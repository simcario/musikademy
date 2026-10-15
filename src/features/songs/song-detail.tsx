"use client";

import { useState } from "react";
import { FileText, Library, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/shared/dialogs";
import { TabBar } from "@/components/shared/segmented";
import { Pill } from "@/components/shared/status-badge";
import { useGroups, usePlaylists } from "@/features/admin/hooks";
import { MaterialRow } from "@/features/materials/material-card";
import { AudiencePills, useSongMaterials } from "@/features/playlists/playlist-songs";
import { PostIts } from "@/features/playlists/song-notes";
import type { PlaylistNote, Song, WithId } from "@/types";

type Tab = "details" | "materials";

/**
 * Scheda di un brano in sola lettura (dalla playlist): note della playlist come post-it, dati e materiali.
 * Docente (senza `audienceIds`): materiali con i gruppi e il tasto per modificarlo. Studente (con `audienceIds`:
 * UID + gruppi attivi): solo i materiali per tutti e per i suoi gruppi.
 */
export function SongDetailPanel({
  song,
  onOpenChange,
  onEdit,
  audienceIds,
  notes = [],
}: {
  song: WithId<Song> | null;
  onOpenChange: (o: boolean) => void;
  onEdit?: (song: WithId<Song>) => void;
  audienceIds?: string[];
  /** Note del brano nella playlist da cui è aperto (già filtrate per lo studente). */
  notes?: PlaylistNote[];
}) {
  return (
    <SidePanel open={!!song} onOpenChange={onOpenChange} title={song?.title ?? "Brano"} description={song?.artist} wide>
      {song && (
        <SongDetail
          key={song.id}
          song={song}
          notes={notes}
          audienceIds={audienceIds}
          onEdit={onEdit ? () => onEdit(song) : undefined}
        />
      )}
    </SidePanel>
  );
}

function SongDetail({
  song,
  notes,
  audienceIds,
  onEdit,
}: {
  song: WithId<Song>;
  notes: PlaylistNote[];
  audienceIds?: string[];
  onEdit?: () => void;
}) {
  const staff = !audienceIds;
  // Lo studente apre il brano per studiarlo: si parte dai materiali.
  const [tab, setTab] = useState<Tab>(staff ? "details" : "materials");
  const materials = useSongMaterials([song]);
  const groups = useGroups(staff);
  const groupNames = staff ? new Map((groups.data ?? []).map((g) => [g.id, g.name])) : undefined;
  const playlists = (usePlaylists(staff).data ?? []).filter((p) => (p.songIds ?? []).includes(song.id)).map((p) => p.title);
  const items = (song.items ?? []).filter(
    (i) => staff || i.groupIds.length === 0 || i.groupIds.some((g) => audienceIds.includes(g)),
  );

  return (
    <div className="flex min-h-full flex-col gap-4">
      {notes.length > 0 && (
        <section aria-label="Note del docente" className="pb-1">
          <PostIts notes={notes} groupNames={groupNames} />
        </section>
      )}

      <TabBar<Tab>
        label="Sezioni del brano"
        value={tab}
        onChange={setTab}
        options={[
          { value: "details", label: "Dati", icon: FileText },
          { value: "materials", label: "Materiali", icon: Library, count: items.length },
        ]}
      />

      {tab === "details" && (
        <dl className="space-y-3 text-sm">
          <Detail label="Titolo">{song.title}</Detail>
          <Detail label="Autore / interprete">{song.artist || "—"}</Detail>
          <Detail label="Note per chi lo studia">
            <span className="whitespace-pre-line">{song.notes || "—"}</span>
          </Detail>
          {staff && <Detail label="In playlist">{playlists.length ? playlists.join(", ") : "Nessuna"}</Detail>}
        </dl>
      )}

      {tab === "materials" &&
        (items.length === 0 ? (
          staff ? (
            <p className="rounded-lg border border-dashed border-input p-3 text-sm text-muted-foreground">
              Nessun materiale: aggiungili con &quot;Modifica brano&quot;.
            </p>
          ) : (
            <Pill tone="neutral">Nessun materiale per te</Pill>
          )
        ) : (
          <ul className="space-y-3">
            {items.map((i) => {
              const m = materials.map.get(i.materialId);
              // Lo studente non vede i materiali che le rules non gli fanno leggere.
              if (!m && !staff && !materials.isPending) return null;
              return (
                <li key={i.materialId} className="space-y-1">
                  {m ? (
                    <MaterialRow material={m} />
                  ) : (
                    <p className="rounded-lg bg-surface-low p-2.5 text-sm text-muted-foreground">
                      {materials.isPending ? "Caricamento…" : "Materiale non disponibile"}
                    </p>
                  )}
                  {groupNames && <AudiencePills groupIds={i.groupIds} groupNames={groupNames} />}
                </li>
              );
            })}
          </ul>
        ))}

      {onEdit && (
        <div className="pb-safe sticky bottom-0 -mx-5 mt-auto -mb-4 flex justify-end border-t border-border bg-popover px-5 py-3">
          <Button onClick={onEdit}>
            <Pencil aria-hidden /> Modifica brano
          </Button>
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
