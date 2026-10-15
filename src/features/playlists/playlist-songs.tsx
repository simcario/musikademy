"use client";

import { ListMusic, Music } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { useGroups, useSongs } from "@/features/admin/hooks";
import { MaterialRow } from "@/features/materials/material-card";
import { useMaterialsByIds, useSongsByIds } from "@/features/student-area/hooks";
import type { Material, Playlist, Song, WithId } from "@/types";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 brani · 3 gruppi · 2 studenti", per le card delle playlist. */
export function playlistSummary(p: Playlist, withSharing = false): string {
  const parts = [count(p.songIds?.length ?? 0, "brano", "brani")];
  if (withSharing) {
    if (p.groupIds?.length) parts.push(count(p.groupIds.length, "gruppo", "gruppi"));
    if (p.studentIds?.length) parts.push(count(p.studentIds.length, "studente", "studenti"));
    if (!p.audience?.length) parts.push("non condivisa");
  }
  return parts.join(" · ");
}

/** Copertina della playlist (o del brano) su sfondo colorato. */
export function PlaylistCover({ className = "size-12", song }: { className?: string; song?: boolean }) {
  const Icon = song ? Music : ListMusic;
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-brand-ink ${className}`}>
      <Icon className="size-6" aria-hidden />
    </span>
  );
}

/**
 * Un brano con i suoi materiali. Con `audienceIds` (studente: UID + gruppi) mostra solo i materiali per
 * tutti e quelli dei suoi gruppi; senza (docente) li mostra tutti, con i gruppi a cui sono destinati.
 */
export function SongBlock({
  song,
  index,
  materials,
  audienceIds,
  groupNames,
  actions,
}: {
  song: WithId<Song>;
  index?: number;
  materials: Map<string, WithId<Material>>;
  audienceIds?: string[];
  groupNames?: Map<string, string>;
  actions?: React.ReactNode;
}) {
  const items = (song.items ?? []).filter(
    (i) => !audienceIds || i.groupIds.length === 0 || i.groupIds.some((g) => audienceIds.includes(g)),
  );
  const shown = items.flatMap((i) => (materials.has(i.materialId) ? [{ item: i, material: materials.get(i.materialId)! }] : []));
  return (
    <article className="card-surface space-y-3 p-4">
      <div className="flex items-start gap-3">
        {index !== undefined ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-mid text-sm font-bold tabular-nums">
            {index + 1}
          </span>
        ) : (
          <PlaylistCover className="size-9" song />
        )}
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{song.title}</h3>
          {song.artist && <p className="text-sm text-muted-foreground">{song.artist}</p>}
          {song.notes && <p className="mt-1 text-sm whitespace-pre-line">{song.notes}</p>}
        </div>
        {actions}
      </div>
      {shown.length > 0 ? (
        <ul className="space-y-2">
          {shown.map(({ item, material }) => (
            <li key={material.id} className="space-y-1">
              <MaterialRow material={material} />
              {groupNames && (
                <div className="flex flex-wrap gap-1 pl-1">
                  {item.groupIds.length === 0 ? (
                    <Pill tone="neutral">Tutti</Pill>
                  ) : (
                    item.groupIds.map((g) => (
                      <Pill key={g} tone="secondary">
                        {groupNames.get(g) ?? "Gruppo eliminato"}
                      </Pill>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <Pill tone="neutral">Nessun materiale{audienceIds ? " per te" : ""}</Pill>
      )}
    </article>
  );
}

/** Materiali di più brani, letti uno per uno (lo studente riceve solo quelli che le rules gli consentono). */
export function useSongMaterials(songs: WithId<Song>[]) {
  const ids = songs.flatMap((s) => s.materialIds ?? []);
  const q = useMaterialsByIds(ids);
  return { ...q, map: new Map((q.data ?? []).map((m) => [m.id, m])) };
}

/** Brani della playlist, nell'ordine scelto. Docente: tutti i materiali con i gruppi; studente: i suoi. */
export function PlaylistSongs({
  playlist,
  audienceIds,
  songActions,
  emptyText = "Nessun brano in questa playlist.",
}: {
  playlist: WithId<Playlist>;
  /** Studente: UID + gruppi attivi. Assente = vista docente. */
  audienceIds?: string[];
  songActions?: (song: WithId<Song>, index: number) => React.ReactNode;
  emptyText?: string;
}) {
  const staff = !audienceIds;
  const all = useSongs(staff);
  const mine = useSongsByIds(staff ? [] : (playlist.songIds ?? []));
  const source = staff ? all : mine;
  const byId = new Map((source.data ?? []).map((s) => [s.id, s]));
  const songs = (playlist.songIds ?? []).flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  const materials = useSongMaterials(songs);
  const groups = useGroups(staff);
  const groupNames = staff ? new Map((groups.data ?? []).map((g) => [g.id, g.name])) : undefined;

  if (source.isPending && (playlist.songIds ?? []).length) return <p className="text-sm text-muted-foreground">Caricamento…</p>;
  if (songs.length === 0) return <p className="card-surface p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ol className="space-y-3">
      {songs.map((s, i) => (
        <li key={s.id}>
          <SongBlock
            song={s}
            index={i}
            materials={materials.map}
            audienceIds={audienceIds}
            groupNames={groupNames}
            actions={songActions?.(s, i)}
          />
        </li>
      ))}
    </ol>
  );
}