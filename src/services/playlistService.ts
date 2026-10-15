import { doc, documentId, orderBy, where, writeBatch, type DocumentReference } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { MAX_PLAYLIST_TRACKS, type Material, type Playlist, type PlaylistTrack, type WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, col, getById, list, ref, timestamps, touched } from "./base";
import { folderService, materialAudience, toFolderMap } from "./folderService";

export interface PlaylistDetails {
  title: string;
  description?: string;
}

export interface PlaylistSharing {
  studentIds: string[];
  groupIds: string[];
}

type Write = { ref: DocumentReference; data: Record<string, unknown> | null; create?: boolean };

const unique = (ids: string[]) => Array.from(new Set(ids));

/** Materiali di tutti i brani, senza doppioni. */
const materialIdsOf = (tracks: PlaylistTrack[]) => unique(tracks.flatMap((t) => t.materialIds));

/** Nuovo id di brano, stabile dentro la playlist. */
export const newTrackId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 12);

/** Brani pronti per il salvataggio: niente campi vuoti (Firestore rifiuta `undefined`). */
function cleanTracks(tracks: PlaylistTrack[]): PlaylistTrack[] {
  if (tracks.length > MAX_PLAYLIST_TRACKS) {
    throw new AppError(`Una playlist può contenere al massimo ${MAX_PLAYLIST_TRACKS} brani.`);
  }
  return tracks.map((t) =>
    clean({
      id: t.id,
      title: t.title.trim(),
      artist: t.artist?.trim() || undefined,
      notes: t.notes?.trim() || undefined,
      materialIds: unique(t.materialIds),
    }),
  );
}

/**
 * Scritture che riallineano i materiali `materialIds` (ADR D29): `playlistAudience` = chi riceve almeno
 * una delle playlist che li contengono, e `audience` ricalcolata insieme a gruppi e cartella.
 * `playlists` è lo stato già modificato in memoria (playlist nuova, cambiata o tolta).
 */
async function materialWrites(materialIds: string[], playlists: WithId<Playlist>[]): Promise<Write[]> {
  if (materialIds.length === 0) return [];
  const folders = toFolderMap(await folderService.list());
  const writes: Write[] = [];
  // Limite Firestore: 30 valori per `in`. I materiali eliminati nel frattempo non compaiono.
  for (const ids of chunk(materialIds)) {
    const materials = await list<Material>(COLLECTIONS.materials, where(documentId(), "in", ids));
    for (const m of materials) {
      const playlistAudience = unique(playlists.filter((p) => p.materialIds.includes(m.id)).flatMap((p) => p.audience));
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

/**
 * Scrive la playlist `id` (`data`; `null` = eliminazione) e riallinea i materiali che conteneva prima
 * e quelli che contiene ora. `next` è la playlist come sarà dopo la scrittura (`null` se eliminata).
 */
async function apply(id: string, next: WithId<Playlist> | null, data: Record<string, unknown> | null) {
  const all = await playlistService.list();
  const before = all.find((p) => p.id === id);
  const after = [...all.filter((p) => p.id !== id), ...(next ? [next] : [])];
  const materialIds = unique([...(before?.materialIds ?? []), ...(next?.materialIds ?? [])]);
  await commit([{ ref: ref(COLLECTIONS.playlists, id), data }, ...(await materialWrites(materialIds, after))]);
}

async function load(id: string) {
  const p = await playlistService.get(id);
  if (!p) throw new AppError("Playlist non trovata.");
  return p;
}

/** Playlist (ADR D29): brani con più materiali ciascuno, condivise con studenti e gruppi. */
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
          tracks: [],
          materialIds: [],
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

  /** Brani nell'ordine dato: chi riceve la playlist vede subito i materiali aggiunti, non più quelli tolti. */
  async setTracks(id: string, tracks: PlaylistTrack[]) {
    const p = await load(id);
    const next = cleanTracks(tracks);
    const materialIds = materialIdsOf(next);
    await apply(id, { ...p, tracks: next, materialIds }, { tracks: next, materialIds, ...touched() });
  },

  /** Condivisione: chi la riceve vede la playlist e tutti i materiali dei suoi brani. */
  async share(id: string, sharing: PlaylistSharing) {
    const p = await load(id);
    const audience = unique([...sharing.studentIds, ...sharing.groupIds]);
    await apply(id, { ...p, ...sharing, audience }, { ...sharing, audience, ...touched() });
  },

  /** Elimina la playlist, non i materiali: restano visibili a chi li riceve per altre vie. */
  remove: (id: string) => apply(id, null, null),

  /** Toglie un materiale (che sta per essere eliminato) dai brani delle playlist che lo contengono. */
  async detachMaterial(materialId: string) {
    const playlists = await list<Playlist>(COLLECTIONS.playlists, where("materialIds", "array-contains", materialId));
    await commit(
      playlists.map((p) => {
        const tracks = p.tracks.map((t) => ({ ...t, materialIds: t.materialIds.filter((m) => m !== materialId) }));
        return { ref: ref(COLLECTIONS.playlists, p.id), data: { tracks, materialIds: materialIdsOf(tracks), ...touched() } };
      }),
    );
  },
};
