"use client";

import { Suspense } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { useAudioDock } from "@/features/materials/audio-dock";
import { PlaylistCover, PlaylistTracks, playlistSummary } from "@/features/playlists/playlist-tracks";
import { useMyPlaylists } from "@/features/student-area/hooks";

export default function PlaylistsPage() {
  return (
    <Suspense>
      <Playlists />
    </Suspense>
  );
}

/** Playlist ricevute (ADR D29): ogni brano con ascolto, base, spartito, testo, video… */
function Playlists() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const q = useMyPlaylists();
  const openId = params.get("id");
  const open = openId ? (q.data?.find((p) => p.id === openId) ?? null) : null;
  const playing = !!useAudioDock().track;

  return (
    <PageContainer>
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : open ? (
        <>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" aria-label="Torna alle playlist" onClick={() => router.push(pathname)}>
              <ArrowLeft aria-hidden />
            </Button>
            <PlaylistCover className="size-11" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-xl font-bold">{open.title}</h1>
              <p className="truncate text-xs text-muted-foreground">{playlistSummary(open)}</p>
            </div>
          </div>
          {open.description && <p className="text-sm whitespace-pre-line text-muted-foreground">{open.description}</p>}
          <PlaylistTracks playlist={open} />
        </>
      ) : (
        <>
          <PageHeader title="Playlist" description="I brani da studiare, ognuno con i suoi materiali." />
          {q.data.length === 0 ? (
            <EmptyState
              icon={ListMusic}
              title="Nessuna playlist"
              description="Quando il docente condividerà una playlist con te la troverai qui."
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {q.data.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`${pathname}?id=${p.id}`)}
                    className="card-surface card-interactive flex min-h-16 w-full items-center gap-3 p-3 text-left"
                  >
                    <PlaylistCover />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{p.title}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {[playlistSummary(p), p.description].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {/* Su mobile il player in basso non deve coprire le ultime righe. */}
      {playing && <div className="h-16 md:hidden" aria-hidden />}
    </PageContainer>
  );
}