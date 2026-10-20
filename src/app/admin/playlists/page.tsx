"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ListMusic, ListPlus, MoreVertical, Pencil, Plus, Share2, Trash2 } from "lucide-react";
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
import { usePlaylists, useScopeGetter, useStaffMutation } from "@/features/admin/hooks";
import { AddSongsDialog, PlaylistDetailsDialog, PlaylistShareDialog } from "@/features/playlists/playlist-dialogs";
import { PlaylistCover, PlaylistSongs, playlistSummary } from "@/features/playlists/playlist-songs";
import { SongDetailPanel } from "@/features/songs/song-detail";
import { SongDialog } from "@/features/songs/song-dialog";
import { playlistService, songNotesOf } from "@/services/playlistService";
import type { Playlist, Song, WithId } from "@/types";

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

  const getScope = useScopeGetter();
  const remove = useStaffMutation((p: WithId<Playlist>) => playlistService.remove(p.id, getScope()), {
    success: "Playlist eliminata",
    invalidate: [["playlists"], ["songs"], ["materials"]],
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
            description="Raccolte di brani da condividere con studenti e gruppi."
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
              description="Crea una playlist, aggiungi i brani (sezione Brani) e condividila con studenti o gruppi."
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
        description="Brani e materiali non vengono eliminati: restano disponibili per le altre playlist."
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
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<WithId<Song> | null>(null);
  const [editing, setEditing] = useState<WithId<Song> | null>(null);
  const [toRemove, setToRemove] = useState<WithId<Song> | null>(null);
  const songIds = playlist.songIds ?? [];
  const getScope = useScopeGetter();
  const setSongs = useStaffMutation((ids: string[]) => playlistService.setSongs(playlist.id, ids, getScope()), {
    invalidate: [["playlists"], ["songs"], ["materials"]],
    onSuccess: () => setToRemove(null),
  });

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
        <Button onClick={() => setAdding(true)}>
          <ListPlus aria-hidden /> Aggiungi brani
        </Button>
        {menu}
      </div>
      {playlist.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{playlist.description}</p>}
      {songIds.length > 1 && (
        <p className="text-xs text-muted-foreground">Trascina un brano dalla maniglia a sinistra per cambiarne l&apos;ordine.</p>
      )}

      <PlaylistSongs
        playlist={playlist}
        emptyText="Nessun brano: aggiungili con “Aggiungi brani”."
        onReorder={(ids) => setSongs.mutateAsync(ids)}
        onOpenSong={setViewing}
        songActions={(s) => (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Azioni brano ${s.title}`} className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted">
              <MoreVertical className="size-5" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem className="min-h-10" onClick={() => setEditing(s)}>
                <Pencil aria-hidden /> Modifica brano e note
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToRemove(s)}>
                <Trash2 aria-hidden /> Togli dalla playlist
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      />

      <AddSongsDialog open={adding} onOpenChange={setAdding} playlist={playlist} />
      <SongDetailPanel
        song={viewing}
        notes={viewing ? songNotesOf(playlist, viewing.id) : []}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={(s) => {
          setViewing(null);
          setEditing(s);
        }}
      />
      <SongDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} song={editing} playlist={playlist} />
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Togliere il brano dalla playlist?"
        description="Il brano resta nella sezione Brani, con i suoi materiali."
        confirmLabel="Togli"
        destructive
        loading={setSongs.isPending}
        onConfirm={() => toRemove && setSongs.mutate(songIds.filter((id) => id !== toRemove.id))}
      />
    </>
  );
}