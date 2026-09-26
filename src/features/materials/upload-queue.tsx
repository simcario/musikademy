"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, UploadCloud, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { materialService, type MaterialMeta } from "@/services/materialService";
import { errorMessage } from "@/utils/errors";

type UploadStatus = "uploading" | "saving" | "done" | "error" | "canceled";

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: UploadStatus;
  error?: string;
  cancel: () => void;
}

const UploadContext = createContext<{ start: (file: File, meta: MaterialMeta, uid: string) => void } | null>(null);

/**
 * Coda di upload: l'interfaccia resta utilizzabile durante il caricamento (§25).
 * Flusso: Storage → documento Firestore → conferma.
 */
export function UploadQueueProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const qc = useQueryClient();
  const patch = (id: string, p: Partial<UploadItem>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const start = useCallback(
    (file: File, meta: MaterialMeta, uid: string) => {
      const id = crypto.randomUUID();
      let handle: ReturnType<typeof materialService.upload>;
      try {
        handle = materialService.upload(file, meta, uid);
      } catch (e) {
        toast.error(errorMessage(e));
        return;
      }
      setItems((xs) => [...xs, { id, name: meta.title, progress: 0, status: "uploading", cancel: () => handle.task.cancel() }]);
      handle.task.on("state_changed", (snap) => {
        const progress = snap.totalBytes ? Math.round((snap.bytesTransferred / snap.totalBytes) * 100) : 0;
        patch(id, { progress, status: progress >= 100 ? "saving" : "uploading" });
      });
      handle.done
        .then(() => {
          patch(id, { status: "done", progress: 100 });
          toast.success(`“${meta.title}” caricato`);
          qc.invalidateQueries({ queryKey: ["materials"] });
          setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 4000);
        })
        .catch((e) => {
          const canceled = (e as { code?: string })?.code === "storage/canceled";
          patch(id, { status: canceled ? "canceled" : "error", error: canceled ? undefined : errorMessage(e) });
          if (canceled) setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), 2000);
        });
    },
    [qc],
  );

  return (
    <UploadContext.Provider value={{ start }}>
      {children}
      {items.length > 0 && (
        <section
          aria-label="Caricamenti in corso"
          aria-live="polite"
          className="fixed inset-x-3 bottom-[calc(80px+env(safe-area-inset-bottom))] z-40 space-y-2 rounded-2xl border border-border bg-popover p-3 shadow-dialog md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
        >
          <p className="section-label flex items-center gap-1.5">
            <UploadCloud className="size-4" aria-hidden /> Caricamenti
          </p>
          <ul className="space-y-2">
            {items.map((it) => (
              <li key={it.id} className="space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  {it.status === "done" ? (
                    <CheckCircle2 className="size-4 text-success" aria-hidden />
                  ) : it.status === "error" ? (
                    <XCircle className="size-4 text-danger" aria-hidden />
                  ) : (
                    <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{it.name}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {it.status === "saving"
                      ? "Salvataggio…"
                      : it.status === "done"
                        ? "Completato"
                        : it.status === "canceled"
                          ? "Annullato"
                          : it.status === "error"
                            ? "Errore"
                            : `${it.progress}%`}
                  </span>
                  {(it.status === "uploading" || it.status === "error") && (
                    <button
                      type="button"
                      onClick={() =>
                        it.status === "error" ? setItems((xs) => xs.filter((x) => x.id !== it.id)) : it.cancel()
                      }
                      aria-label={it.status === "error" ? "Chiudi" : `Annulla caricamento ${it.name}`}
                      className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
                <div
                  className="h-1.5 overflow-hidden rounded-full bg-surface-high"
                  role="progressbar"
                  aria-valuenow={it.progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`Avanzamento ${it.name}`}
                >
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      it.status === "error" ? "bg-danger" : it.status === "done" ? "bg-success" : "bg-primary",
                    )}
                    style={{ width: `${it.progress}%` }}
                  />
                </div>
                {it.error && <p className="text-xs text-danger">{it.error}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </UploadContext.Provider>
  );
}

export function useUploadQueue() {
  const ctx = useContext(UploadContext);
  if (!ctx) throw new Error("useUploadQueue richiede <UploadQueueProvider>");
  return ctx;
}
