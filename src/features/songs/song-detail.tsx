"use client";

import { useState } from "react";
import { FileText, Library, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SidePanel } from "@/components/shared/dialogs";
import { TabBar } from "@/components/shared/segmented";
import { useGroups, usePlaylists } from "@/features/admin/hooks";
import { MaterialRow } from "@/features/materials/material-card";
import { AudiencePills, useSongMaterials } from "@/features/playlists/playlist-songs";
import type { Song, WithId } from "@/types";

type Tab = "details" | "materials";

/** Scheda di un brano in sola lettura (dalla playlist): dati, materiali con i gruppi e il tasto per modificarlo. */
export function SongDetailPanel({
  song,
  onOpenChange,
  onEdit,
}: {
  song: WithId<Song> | null;
  onOpenChange: (o: boolean) => void;
  onEdit: (song: WithId<Song>) => void;
}) {
  return (
    <SidePanel open={!!song} onOpenChange={onOpenChange} title={song?.title ?? "Brano"} description={song?.artist} wide>
      {song && <SongDetail key={song.id} song={song} onEdit={() => onEdit(song)} />}
    </SidePanel>
  );
}

function SongDetail({ song, onEdit }: { song: WithId<Song>; onEdit: () => void }) {
  const [tab, setTab] = useState<Tab>("details");
  const materials = useSongMaterials([song]);
  const groupNames = new Map((useGroups().data ?? []).map((g) => [g.id, g.name]));
  const playlists = (usePlaylists().data ?? []).filter((p) => (p.songIds ?? []).includes(song.id)).map((p) => p.title);
  const items = song.items ?? [];

  return (
    <div className="flex min-h-full flex-col gap-4">
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
          <Detail label="In playlist">{playlists.length ? playlists.join(", ") : "Nessuna"}</Detail>
        </dl>
      )}

      {tab === "materials" &&
        (items.length === 0 ? (
          <p className="rounded-lg border border-dashed border-input p-3 text-sm text-muted-foreground">
            Nessun materiale: aggiungili con &quot;Modifica brano&quot;.
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => {
              const m = materials.map.get(i.materialId);
              return (
                <li key={i.materialId} className="space-y-1">
                  {m ? (
                    <MaterialRow material={m} />
                  ) : (
                    <p className="rounded-lg bg-surface-low p-2.5 text-sm text-muted-foreground">
                      {materials.isPending ? "Caricamento…" : "Materiale non disponibile"}
                    </p>
                  )}
                  <AudiencePills groupIds={i.groupIds} groupNames={groupNames} />
                </li>
              );
            })}
          </ul>
        ))}

      <div className="pb-safe sticky bottom-0 -mx-5 mt-auto -mb-4 flex justify-end border-t border-border bg-popover px-5 py-3">
        <Button onClick={onEdit}>
          <Pencil aria-hidden /> Modifica brano
        </Button>
      </div>
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
