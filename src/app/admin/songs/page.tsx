"use client";

import { useState } from "react";
import { Music, MoreVertical, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { useGroups, usePlaylists, useSongs, useStaffMutation } from "@/features/admin/hooks";
import { SongBlock, useSongMaterials } from "@/features/playlists/playlist-songs";
import { SongDialog } from "@/features/songs/song-dialog";
import { songService } from "@/services/playlistService";
import type { Song, WithId } from "@/types";
import { searchToken } from "@/utils/keywords";

/** Brani (ADR D29): ognuno con i suoi materiali, per tutti o per singoli gruppi; si raccolgono nelle playlist. */
export default function AdminSongsPage() {
  const q = useSongs();
  const playlists = usePlaylists();
  const groups = useGroups();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<{ song: WithId<Song> | null } | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Song> | null>(null);
  const token = search ? searchToken(search) : null;
  const songs = (q.data ?? []).filter((s) => !token || s.keywords?.includes(token));
  const materials = useSongMaterials(songs);
  const groupNames = new Map((groups.data ?? []).map((g) => [g.id, g.name]));
  const inPlaylists = (id: string) => (playlists.data ?? []).filter((p) => (p.songIds ?? []).includes(id)).map((p) => p.title);

  const remove = useStaffMutation((s: WithId<Song>) => songService.remove(s.id), {
    success: "Brano eliminato",
    invalidate: [["songs"], ["playlists"], ["materials"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <PageContainer className="max-w-5xl">
      <PageHeader
        title="Brani"
        description="Ogni brano raccoglie ascolti, basi, spartiti, testi e video; ogni materiale può valere per tutti o solo per alcuni gruppi."
        actions={
          <Button onClick={() => setEditing({ song: null })}>
            <Plus aria-hidden /> Nuovo brano
          </Button>
        }
      />
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cerca per titolo o autore" aria-label="Cerca brani" className="pl-9" />
      </div>

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : songs.length === 0 ? (
        <EmptyState
          icon={Music}
          title={token ? "Nessun brano trovato" : "Nessun brano"}
          description={token ? undefined : "Crea un brano e aggiungi i suoi materiali; poi inseriscilo in una playlist."}
          action={
            !token && (
              <Button onClick={() => setEditing({ song: null })}>
                <Plus aria-hidden /> Crea il primo brano
              </Button>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {songs.map((s) => {
            const lists = inPlaylists(s.id);
            return (
              <li key={s.id}>
                <SongBlock
                  song={s}
                  materials={materials.map}
                  groupNames={groupNames}
                  footer={lists.length ? `In playlist: ${lists.join(", ")}` : "Non è in nessuna playlist"}
                  actions={
                    <DropdownMenu>
                      <DropdownMenuTrigger aria-label={`Azioni brano ${s.title}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted">
                        <MoreVertical className="size-5" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem className="min-h-10" onClick={() => setEditing({ song: s })}>
                          <Pencil aria-hidden /> Modifica
                        </DropdownMenuItem>
                        <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(s)}>
                          <Trash2 aria-hidden /> Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}

      <SongDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} song={editing?.song ?? null} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare il brano?"
        description="Il brano esce da tutte le playlist. I materiali non vengono eliminati."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </PageContainer>
  );
}