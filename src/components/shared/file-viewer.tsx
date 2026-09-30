"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2 } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { extensionOf } from "@/lib/files";
import { errorMessage } from "@/utils/errors";
import { Markdown } from "./markdown";

export type ViewerKind = "pdf" | "video" | "image" | "markdown" | "other";

/** Tipo di visualizzazione dedotto dal nome file (allegati senza metadati, es. comunicazioni). */
export function viewerKindOf(fileName: string): ViewerKind {
  const ext = extensionOf(fileName);
  if (ext === "pdf") return "pdf";
  if (["mp4", "mov", "webm"].includes(ext)) return "video";
  if (["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) return "image";
  if (["md", "markdown"].includes(ext)) return "markdown";
  return "other";
}

/**
 * Visualizzatore a schermo intero per tutti i file in-app.
 * Il Markdown usa `content` se disponibile (da Firestore), altrimenti prova a scaricare il testo da `url`.
 */
export function FileViewer({
  open,
  onOpenChange,
  title,
  kind,
  url,
  urlPending,
  urlError,
  content,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  kind: ViewerKind;
  url?: string;
  urlPending?: boolean;
  urlError?: unknown;
  content?: string;
}) {
  const text = useQuery({
    queryKey: ["file-text", url],
    queryFn: async () => {
      const res = await fetch(url!);
      if (!res.ok) throw new Error("Impossibile leggere il file.");
      return res.text();
    },
    enabled: open && kind === "markdown" && content === undefined && !!url,
    staleTime: 30 * 60_000,
  });
  const markdown = content ?? text.data;
  const pending = kind === "markdown" && content !== undefined ? false : urlPending || (kind === "markdown" && text.isPending);
  const error = kind === "markdown" && content !== undefined ? null : urlError || (kind === "markdown" ? text.error : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-popover py-2 pr-12 pl-4">
          <DialogTitle className="min-w-0 flex-1 truncate text-base font-semibold">{title}</DialogTitle>
          <DialogDescription className="sr-only">Visualizzazione a schermo intero</DialogDescription>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Apri in una nuova scheda"
              title="Apri in una nuova scheda"
              className={buttonVariants({ variant: "ghost", size: "icon-sm" })}
            >
              <ExternalLink aria-hidden />
            </a>
          )}
        </header>
        <div className="pb-safe relative min-h-0 flex-1 overflow-auto bg-surface-low">
          {pending ? (
            <Centered>
              <Loader2 className="size-6 animate-spin text-primary" aria-label="Caricamento" />
            </Centered>
          ) : error ? (
            <Centered>
              <p className="p-6 text-sm text-danger">{errorMessage(error)}</p>
            </Centered>
          ) : kind === "markdown" ? (
            <article className="mx-auto max-w-3xl bg-card px-5 py-8 sm:my-6 sm:rounded-xl sm:px-10 sm:shadow-card">
              <Markdown>{markdown ?? ""}</Markdown>
            </article>
          ) : kind === "video" ? (
            <video src={url} controls playsInline autoPlay preload="metadata" className="absolute inset-0 size-full bg-black object-contain" />
          ) : kind === "image" ? (
            <Centered>
              {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato dinamico di Storage */}
              <img src={url} alt={title} className="max-h-full max-w-full object-contain" />
            </Centered>
          ) : kind === "pdf" ? (
            <iframe src={url} title={title} className="absolute inset-0 size-full border-0 bg-white" />
          ) : (
            <Centered>
              <div className="space-y-3 p-6 text-center">
                <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden />
                <p className="text-sm text-muted-foreground">Anteprima non disponibile per questo formato.</p>
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer" className={buttonVariants()}>
                    Scarica il file
                  </a>
                )}
              </div>
            </Centered>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="absolute inset-0 flex items-center justify-center">{children}</div>;
}
