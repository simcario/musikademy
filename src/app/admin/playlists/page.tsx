"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ListMusic, ListPlus, MoreVertical, Pencil, Plus, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { usePlaylists, useStaffMutation } from "@/features/admin/hooks";
import { PlaylistDetailsDialog, PlaylistShareDialog, TrackDialog } from "@/features/playlists/playlist-dialogs";
import { PlaylistCover, PlaylistTracks, playlistSummary } from "@/features/playlists/playlist-tracks";
import { playlistService } from "@/services/playlistService";
import type { Playlist, PlaylistTrack, WithId } from "@/types";

export default function AdminPlaylistsPage() {
  return (
    <Suspense>
      <Playlists />
    </Suspense>
  );
}

function Playlists() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = usePlaylists();
  const openId = params.get("id");
  const open = openId ? (q.data?.find((p) => p.id === openId) ?? null) : null;
  const [details, setDetails] = useState<{ playlist: WithId<Playlist> | null } | null>(null);
  const [sharing, setSharing] = useState<WithId<Playlist> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Playlist> | null>(null);

  // La playlist aperta è nell'URL: il tasto "indietro" torna all'elenco.
  const show = (id: string | null) => router.push(id ? `${pathname}?id=${id}` : pathname);

  const remove = useStaffMutation((p: WithId<Playlist>) => playlistService.remove(p.id), {
    success: "Playlist eliminata",
    invalidate: [["playlists"], ["materials"]],
    onSuccess: () => {
      setToDelete(null);
      if (openId) show(null);
    },
  });

  const menu = (p: WithId<Playlist>) => (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label={`Azioni playlist ${p.title}`} className="flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-muted">
        <MoreVertical className="size-5" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem className="min-h-10" onClick={() => setSharing(p)}>
          <Share2 aria-hidden /> Condividi
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-10" onClick={() => setDetails({ playlist: p })}>
          <Pencil aria-hidden /> Modifica
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(p)}>
          <Trash2 aria-hidden /> Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <PageContainer className="max-w-5xl">
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : open ? (
        <PlaylistDetail playlist={open} menu={menu(open)} onBack={() => show(null)} onShare={() => setSharing(open)} />
      ) : (
        <>
          <PageHeader
            title="Playlist"
            description="Brani con tutti i loro materiali: ascolti, basi, spartiti, testi e video."
            actions={
              <Button onClick={() => setDetails({ playlist: null })}>
                <Plus aria-hidden /> Nuova playlist
              </Button>
            }
          />
          {q.data.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title={openId ? "Playlist non trovata" : "Nessuna playlist"}
              description="Crea una playlist, aggiungi i brani e per ognuno scegli i materiali; poi condividila con studenti o gruppi."
              action={
                <Button onClick={() => setDetails({ playlist: null })}>
                  <Plus aria-hidden /> Crea la prima playlist
                </Button>
              }
            />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {q.data.map((p) => (
                <li key={p.id} className="card-surface flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => show(p.id)}
                    className="flex min-h-16 min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-muted/50"
                  >
                    <PlaylistCover />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">{playlistSummary(p, true)}</span>
                    </span>
                  </button>
                  {menu(p)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <PlaylistDetailsDialog
        open={!!details}
        onOpenChange={(o) => !o && setDetails(null)}
        playlist={details?.playlist}
        onCreated={(id) => show(id)}
      />
      <PlaylistShareDialog open={!!sharing} onOpenChange={(o) => !o && setSharing(null)} playlist={sharing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare la playlist?"
        description="I materiali non vengono eliminati: restano nella libreria e visibili a chi li riceve in altro modo."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </PageContainer>
  );
}

function PlaylistDetail({
  playlist,
  menu,
  onBack,
  onShare,
}: {
  playlist: WithId<Playlist>;
  menu: React.ReactNode;
  onBack: () => void;
  onShare: () => void;
}) {
  const [editing, setEditing] = useState<{ track: PlaylistTrack | null } | null>(null);
  const [toRemove, setToRemove] = useState<PlaylistTrack | null>(null);
  const setTracks = useStaffMutation((tracks: PlaylistTrack[]) => playlistService.setTracks(playlist.id, tracks), {
    invalidate: [["playlists"], ["materials"]],
    onSuccess: () => setToRemove(null),
  });

  function move(index: number, delta: number) {
    const tracks = [...playlist.tracks];
    const [t] = tracks.splice(index, 1);
    tracks.splice(index + delta, 0, t);
    setTracks.mutate(tracks);
  }

  const last = playlist.tracks.length - 1;

  return (
    <>
      <div className="card-surface flex flex-wrap items-center gap-2 p-2 pl-1">
        <Button variant="ghost" size="icon" aria-label="Torna a tutte le playlist" onClick={onBack}>
          <ArrowLeft aria-hidden />
        </Button>
        <PlaylistCover className="size-11" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold">{playlist.title}</h1>
          <p className="truncate text-xs text-muted-foreground">{playlistSummary(playlist, true)}</p>
        </div>
        <Button variant="outline" className="hidden sm:inline-flex" onClick={onShare}>
          <Share2 aria-hidden /> Condividi
        </Button>
        <Button onClick={() => setEditing({ track: null })}>
          <ListPlus aria-hidden /> Aggiungi brano
        </Button>
        {menu}
      </div>
      {playlist.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{playlist.description}</p>}

      <PlaylistTracks
        playlist={playlist}
        emptyText="Nessun brano: aggiungi il primo con “Aggiungi brano”."
        trackActions={(t, i) => (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Azioni brano ${t.title}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted">
              <MoreVertical className="size-5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="min-h-10" onClick={() => setEditing({ track: t })}>
                <Pencil aria-hidden /> Modifica / materiali
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-10" disabled={i === 0 || setTracks.isPending} onClick={() => move(i, -1)}>
                <ArrowUp aria-hidden /> Sposta su
              </DropdownMenuItem>
              <DropdownMenuItem className="min-h-10" disabled={i === last || setTracks.isPending} onClick={() => move(i, 1)}>
                <ArrowDown aria-hidden /> Sposta giù
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToRemove(t)}>
                <Trash2 aria-hidden /> Rimuovi brano
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <TrackDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        playlist={playlist}
        track={editing?.track ?? null}
      />
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Rimuovere il brano?"
        description="Il brano esce dalla playlist; i suoi materiali restano nella libreria."
        confirmLabel="Rimuovi"
        destructive
        loading={setTracks.isPending}
        onConfirm={() => toRemove && setTracks.mutate(playlist.tracks.filter((t) => t.id !== toRemove.id))}
      />
    </>
  );
}