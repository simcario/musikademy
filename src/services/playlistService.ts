import { doc, documentId, getDoc, orderBy, where, writeBatch, type DocumentReference } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import {
  MAX_PLAYLIST_SONGS,
  MAX_SONG_ITEMS,
  type Material,
  type Playlist,
  type Song,
  type SongItem,
  type WithId,
} from "@/types";
import { AppError } from "@/utils/errors";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, col, getById, list, ref, timestamps, touched } from "./base";
import { folderService, materialAudience, toFolderMap } from "./folderService";

export interface PlaylistDetails {
  title: string;
  description?: string;
}

export interface SongDetails {
  title: string;
  artist?: string;
  notes?: string;
}

export interface Sharing {
  studentIds: string[];
  groupIds: string[];
}

type Write = { ref: DocumentReference; data: Record<string, unknown> | null; create?: boolean };
type State = { playlists: WithId<Playlist>[]; songs: WithId<Song>[] };

const unique = (ids: string[]) => Array.from(new Set(ids));
const songIdsOf = (p: Pick<Playlist, "songIds">) => p.songIds ?? [];
const itemsOf = (s: Pick<Song, "items">) => s.items ?? [];

/**
 * Chi può aprire un materiale grazie alle playlist (ADR D29): per ogni playlist condivisa che contiene
 * un brano con il materiale, i gruppi indicati nel brano oppure, se il materiale è per tutti, chi riceve
 * la playlist.
 */
export function playlistAudienceOf(materialId: string, { playlists, songs }: State): string[] {
  const out: string[] = [];
  for (const s of songs) {
    const items = itemsOf(s).filter((i) => i.materialId === materialId);
    if (!items.length) continue;
    for (const p of playlists) {
      if (!p.audience?.length || !songIdsOf(p).includes(s.id)) continue;
      for (const i of items) out.push(...(i.groupIds.length ? i.groupIds : p.audience));
    }
  }
  return unique(out);
}

/** Chi riceve il brano: tutte le playlist condivise che lo contengono. */
const songAudienceOf = (songId: string, { playlists }: State) =>
  unique(playlists.filter((p) => songIdsOf(p).includes(songId)).flatMap((p) => p.audience ?? []));

/**
 * Scritture che riallineano brani e materiali coinvolti allo stato `state` (già modificato in memoria):
 * `audience` dei brani e `playlistAudience`/`audience` dei materiali.
 */
async function syncWrites(state: State, songIds: string[], materialIds: string[]): Promise<Write[]> {
  const writes: Write[] = unique(songIds)
    .filter((id) => state.songs.some((s) => s.id === id))
    .map((id) => ({ ref: ref(COLLECTIONS.songs, id), data: { audience: songAudienceOf(id, state), ...touched() } }));
  const ids = unique(materialIds);
  if (ids.length === 0) return writes;
  const folders = toFolderMap(await folderService.list());
  // Limite Firestore: 30 valori per `in`. I materiali eliminati nel frattempo non compaiono.
  for (const part of chunk(ids)) {
    const materials = await list<Material>(COLLECTIONS.materials, where(documentId(), "in", part));
    for (const m of materials) {
      const playlistAudience = playlistAudienceOf(m.id, state);
      const folder = m.folderId ? (folders.get(m.folderId) ?? null) : null;
      writes.push({
        ref: ref(COLLECTIONS.materials, m.id),
        data: { playlistAudience, audience: materialAudience(m.groupIds, folder, playlistAudience), ...touched() },
      });
    }
  }
  return writes;
}

/** `data: null` = eliminazione. Limite di 500 scritture per batch. */
async function commit(writes: Write[]) {
  for (const part of chunk(writes, 400)) {
    const batch = writeBatch(firestore());
    part.forEach((w) =>
      w.data === null ? batch.delete(w.ref) : w.create ? batch.set(w.ref, w.data) : batch.update(w.ref, w.data),
    );
    await batch.commit();
  }
}

async function loadState(): Promise<State> {
  const [playlists, songs] = await Promise.all([playlistService.list(), songService.list()]);
  return { playlists, songs };
}

const replace = <T extends { id: string }>(items: T[], next: T | null, id: string) => [
  ...items.filter((x) => x.id !== id),
  ...(next ? [next] : []),
];

function cleanItems(items: SongItem[]): SongItem[] {
  if (items.length > MAX_SONG_ITEMS) throw new AppError(`Un brano può avere al massimo ${MAX_SONG_ITEMS} materiali.`);
  const seen = new Set<string>();
  return items
    .filter((i) => !seen.has(i.materialId) && seen.add(i.materialId))
    .map((i) => ({ materialId: i.materialId, groupIds: unique(i.groupIds) }));
}

/** Brani (ADR D29): un titolo con i suoi materiali, anche diversi per gruppo. */
export const songService = {
  get: (id: string) => getById<Song>(COLLECTIONS.songs, id),

  // ── Docente ──
  list: () => list<Song>(COLLECTIONS.songs, orderBy("title")),

  /** Lettura puntuale (lo studente riceve solo i brani delle playlist condivise con lui). */
  async getMany(ids: string[]): Promise<WithId<Song>[]> {
    const snaps = await Promise.allSettled(unique(ids).map((id) => getDoc(ref(COLLECTIONS.songs, id))));
    return snaps.flatMap((s) =>
      s.status === "fulfilled" && s.value.exists() ? [{ id: s.value.id, ...(s.value.data() as Song) }] : [],
    );
  },

  async create(details: SongDetails, items: SongItem[], createdBy: string): Promise<string> {
    const r = doc(col(COLLECTIONS.songs));
    const next = cleanItems(items);
    await commit([
      {
        ref: r,
        create: true,
        data: clean({
          title: details.title.trim(),
          artist: details.artist?.trim() || undefined,
          notes: details.notes?.trim() || undefined,
          items: next,
          materialIds: next.map((i) => i.materialId),
          audience: [],
          createdBy,
          keywords: buildKeywords(details.title, details.artist),
          ...timestamps(),
        }),
      },
    ]);
    return r.id;
  },

  /** Dati e materiali del brano: chi lo riceve vede subito i materiali aggiunti, non più quelli tolti. */
  async update(id: string, details: SongDetails, items: SongItem[]) {
    const state = await loadState();
    const before = state.songs.find((s) => s.id === id);
    if (!before) throw new AppError("Brano non trovato.");
    const next = cleanItems(items);
    const materialIds = next.map((i) => i.materialId);
    const data = {
      title: details.title.trim(),
      artist: details.artist?.trim() ?? "",
      notes: details.notes?.trim() ?? "",
      items: next,
      materialIds,
      keywords: buildKeywords(details.title, details.artist),
      ...touched(),
    };
    const after = { ...state, songs: replace(state.songs, { ...before, items: next, materialIds }, id) };
    await commit([
      { ref: ref(COLLECTIONS.songs, id), data },
      ...(await syncWrites(after, [], [...(before.materialIds ?? []), ...materialIds])),
    ]);
  },

  /** Aggiunge un materiale al brano (dal caricamento del materiale). */
  async addItem(id: string, item: SongItem) {
    const s = await this.get(id);
    if (!s) throw new AppError("Brano non trovato.");
    await this.update(id, s, [...itemsOf(s).filter((i) => i.materialId !== item.materialId), item]);
  },

  /** Elimina il brano (non i materiali) e lo toglie dalle playlist. */
  async remove(id: string) {
    const state = await loadState();
    const before = state.songs.find((s) => s.id === id);
    const touchedPlaylists = state.playlists.filter((p) => songIdsOf(p).includes(id));
    const playlists = state.playlists.map((p) => ({ ...p, songIds: songIdsOf(p).filter((s) => s !== id) }));
    const after = { playlists, songs: replace(state.songs, null, id) };
    await commit([
      ...touchedPlaylists.map((p) => ({
        ref: ref(COLLECTIONS.playlists, p.id),
        data: { songIds: songIdsOf(p).filter((s) => s !== id), ...touched() },
      })),
      { ref: ref(COLLECTIONS.songs, id), data: null },
      ...(await syncWrites(after, [], before?.materialIds ?? [])),
    ]);
  },

  /** Toglie un materiale (che sta per essere eliminato) dai brani che lo contengono. */
  async detachMaterial(materialId: string) {
    const songs = await list<Song>(COLLECTIONS.songs, where("materialIds", "array-contains", materialId));
    await commit(
      songs.map((s) => {
        const items = itemsOf(s).filter((i) => i.materialId !== materialId);
        return {
          ref: ref(COLLECTIONS.songs, s.id),
          data: { items, materialIds: items.map((i) => i.materialId), ...touched() },
        };
      }),
    );
  },
};

/**
 * Scrive la playlist `id` (`data`; `null` = eliminazione) e riallinea i brani che conteneva prima e
 * quelli che contiene ora, con i loro materiali. `next` è la playlist dopo la scrittura.
 */
async function applyPlaylist(id: string, next: WithId<Playlist> | null, data: Record<string, unknown> | null) {
  const state = await loadState();
  const before = state.playlists.find((p) => p.id === id);
  const after = { ...state, playlists: replace(state.playlists, next, id) };
  const songIds = unique([...(before ? songIdsOf(before) : []), ...(next ? songIdsOf(next) : [])]);
  const materialIds = state.songs.filter((s) => songIds.includes(s.id)).flatMap((s) => s.materialIds ?? []);
  await commit([{ ref: ref(COLLECTIONS.playlists, id), data }, ...(await syncWrites(after, songIds, materialIds))]);
}

async function loadPlaylist(id: string) {
  const p = await playlistService.get(id);
  if (!p) throw new AppError("Playlist non trovata.");
  return p;
}

/** Playlist (ADR D29): brani in ordine, condivisi con studenti e gruppi. */
export const playlistService = {
  get: (id: string) => getById<Playlist>(COLLECTIONS.playlists, id),

  // ── Docente ──
  list: () => list<Playlist>(COLLECTIONS.playlists, orderBy("title")),

  // ── Studente: playlist condivise con lui o con uno dei suoi gruppi ──
  async listShared(audienceIds: string[]) {
    if (audienceIds.length === 0) return [];
    const playlists = await list<Playlist>(
      COLLECTIONS.playlists,
      where("audience", "array-contains-any", chunk(audienceIds)[0]),
    );
    return playlists.sort((a, b) => a.title.localeCompare(b.title, "it"));
  },

  /** Nuova playlist vuota, non ancora condivisa. */
  async create(details: PlaylistDetails, createdBy: string): Promise<string> {
    const r = doc(col(COLLECTIONS.playlists));
    await commit([
      {
        ref: r,
        create: true,
        data: clean({
          title: details.title.trim(),
          description: details.description?.trim() || undefined,
          songIds: [],
          studentIds: [],
          groupIds: [],
          audience: [],
          createdBy,
          keywords: buildKeywords(details.title, details.description),
          ...timestamps(),
        }),
      },
    ]);
    return r.id;
  },

  async updateDetails(id: string, details: PlaylistDetails) {
    await commit([
      {
        ref: ref(COLLECTIONS.playlists, id),
        data: {
          title: details.title.trim(),
          description: details.description?.trim() ?? "",
          keywords: buildKeywords(details.title, details.description),
          ...touched(),
        },
      },
    ]);
  },

  /** Brani nell'ordine dato. */
  async setSongs(id: string, songIds: string[]) {
    const next = unique(songIds);
    if (next.length > MAX_PLAYLIST_SONGS) throw new AppError(`Una playlist può contenere al massimo ${MAX_PLAYLIST_SONGS} brani.`);
    const p = await loadPlaylist(id);
    await applyPlaylist(id, { ...p, songIds: next }, { songIds: next, ...touched() });
  },

  /** Condivisione: chi la riceve vede la playlist, i suoi brani e i materiali per tutti o per il proprio gruppo. */
  async share(id: string, sharing: Sharing) {
    const p = await loadPlaylist(id);
    const audience = unique([...sharing.studentIds, ...sharing.groupIds]);
    await applyPlaylist(id, { ...p, ...sharing, audience }, { ...sharing, audience, ...touched() });
  },

  /** Elimina la playlist, non i brani né i materiali. */
  remove: (id: string) => applyPlaylist(id, null, null),
};