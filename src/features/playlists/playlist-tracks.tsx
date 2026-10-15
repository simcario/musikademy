"use client";

import { ListMusic } from "lucide-react";
import { Pill } from "@/components/shared/status-badge";
import { MaterialRow } from "@/features/materials/material-card";
import { useMaterialsByIds } from "@/features/student-area/hooks";
import type { Playlist, PlaylistTrack, WithId } from "@/types";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "12 brani · 3 gruppi · 2 studenti", per le card delle playlist. */
export function playlistSummary(p: Playlist, withSharing = false): string {
  const parts = [count(p.tracks?.length ?? 0, "brano", "brani")];
  if (withSharing) {
    if (p.groupIds?.length) parts.push(count(p.groupIds.length, "gruppo", "gruppi"));
    if (p.studentIds?.length) parts.push(count(p.studentIds.length, "studente", "studenti"));
    if (!p.audience?.length) parts.push("non condivisa");
  }
  return parts.join(" · ");
}

/** Copertina della playlist (icona su sfondo colorato). */
export function PlaylistCover({ className = "size-12" }: { className?: string }) {
  return (
    <span className={`flex shrink-0 items-center justify-center rounded-xl bg-indigo-soft text-brand-ink ${className}`}>
      <ListMusic className="size-6" aria-hidden />
    </span>
  );
}

/**
 * Brani della playlist, ognuno con i suoi materiali (ascolto, base, spartito, testo, video…), apribili
 * e riproducibili come nella libreria. Lo studente riceve solo i materiali che le rules gli consentono.
 */
export function PlaylistTracks({
  playlist,
  trackActions,
  emptyText = "Nessun brano in questa playlist.",
}: {
  playlist: WithId<Playlist>;
  trackActions?: (track: PlaylistTrack, index: number) => React.ReactNode;
  emptyText?: string;
}) {
  const materials = useMaterialsByIds(playlist.materialIds ?? []);
  const byId = new Map((materials.data ?? []).map((m) => [m.id, m]));
  const tracks = playlist.tracks ?? [];

  if (tracks.length === 0) return <p className="card-surface p-6 text-center text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ol className="space-y-3">
      {tracks.map((t, i) => {
        const items = t.materialIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
        return (
          <li key={t.id} className="card-surface space-y-3 p-4">
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-mid text-sm font-bold tabular-nums">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="font-semibold">{t.title}</h3>
                {t.artist && <p className="text-sm text-muted-foreground">{t.artist}</p>}
                {t.notes && <p className="mt-1 text-sm whitespace-pre-line">{t.notes}</p>}
              </div>
              {trackActions?.(t, i)}
            </div>
            {materials.isPending && t.materialIds.length > 0 ? (
              <p className="text-xs text-muted-foreground">Caricamento materiali…</p>
            ) : items.length > 0 ? (
              <ul className="space-y-2">
                {items.map((m) => (
                  <li key={m.id}>
                    <MaterialRow material={m} />
                  </li>
                ))}
              </ul>
            ) : (
              <Pill tone="neutral">Nessun materiale</Pill>
            )}
          </li>
        );
      })}
    </ol>
  );
}