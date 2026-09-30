"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Eye, FileText, Image as ImageIcon, Music, NotebookText, Pause, Play, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FileViewer, type ViewerKind } from "@/components/shared/file-viewer";
import { Pill } from "@/components/shared/status-badge";
import { qk } from "@/hooks/query-keys";
import { cn } from "@/lib/utils";
import { materialService } from "@/services/materialService";
import type { Material, MaterialType, WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { formatFileSize, formatShortDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { useAudioDock } from "./audio-dock";

export const TYPE_META: Record<MaterialType, { icon: typeof FileText; tile: string; label: string }> = {
  pdf: { icon: FileText, tile: "bg-danger-soft text-danger", label: "PDF" },
  audio: { icon: Music, tile: "bg-indigo-soft text-brand-ink", label: "Audio" },
  video: { icon: Video, tile: "bg-warning-soft text-warning", label: "Video" },
  image: { icon: ImageIcon, tile: "bg-violet-soft text-violet", label: "Immagine" },
  markdown: { icon: NotebookText, tile: "bg-success-soft text-success", label: "Testo" },
  document: { icon: FileText, tile: "bg-info-soft text-info", label: "Documento" },
  other: { icon: FileText, tile: "bg-neutral-soft text-neutral", label: "File" },
};

export function MaterialIcon({ type, className }: { type: MaterialType; className?: string }) {
  const m = TYPE_META[type] ?? TYPE_META.other;
  return (
    <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-xl", m.tile, className)}>
      <m.icon className="size-6" aria-hidden />
    </span>
  );
}

export function useMaterialUrl(material: Pick<Material, "storagePath"> | null, enabled = true) {
  return useQuery({
    queryKey: qk.materialUrl(material?.storagePath ?? ""),
    queryFn: () => materialService.fileUrl(material!),
    enabled: !!material && enabled,
    staleTime: 30 * 60_000,
  });
}

const VIEWER_KIND: Record<MaterialType, ViewerKind> = {
  pdf: "pdf",
  video: "video",
  image: "image",
  markdown: "markdown",
  audio: "other",
  document: "other",
  other: "other",
};

/** Visualizzatore in-app a schermo intero (lazy: carica l'URL solo all'apertura; il Markdown non ne ha bisogno). */
export function MaterialViewer({
  material,
  open,
  onOpenChange,
}: {
  material: WithId<Material>;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const kind = VIEWER_KIND[material.type] ?? "other";
  const needsUrl = !(kind === "markdown" && material.content !== undefined);
  const url = useMaterialUrl(material, open && needsUrl);
  return (
    <FileViewer
      open={open}
      onOpenChange={onOpenChange}
      title={material.title}
      kind={kind}
      url={url.data}
      urlPending={needsUrl && url.isPending}
      urlError={url.error}
      content={material.content}
    />
  );
}

async function download(material: WithId<Material>) {
  try {
    const url = await materialService.fileUrl(material);
    window.open(url, "_blank", "noopener,noreferrer");
  } catch (e) {
    toast.error(errorMessage(e, "Impossibile scaricare il file."));
  }
}

export function MaterialActions({ material, compact }: { material: WithId<Material>; compact?: boolean }) {
  const dock = useAudioDock();
  const [viewing, setViewing] = useState(false);
  const isAudio = material.type === "audio";
  const current = dock.isCurrent(material.id);
  const playing = current && dock.state.playing;

  const label = isAudio
    ? playing
      ? "Pausa"
      : material.category === "base"
        ? "Ascolta base"
        : "Ascolta"
    : material.type === "video"
      ? "Guarda video"
      : material.category === "spartito"
        ? "Apri spartito"
        : material.type === "image"
          ? "Visualizza"
          : "Leggi";

  return (
    <div className="flex items-center gap-2">
      <Button
        size={compact ? "sm" : "default"}
        variant={isAudio && current ? "default" : "secondary"}
        onClick={() => (isAudio ? dock.playMaterial(material) : setViewing(true))}
        aria-label={`${label}: ${material.title}`}
      >
        {isAudio ? (
          playing ? <Pause className="fill-current" aria-hidden /> : <Play className="fill-current" aria-hidden />
        ) : (
          <Eye aria-hidden />
        )}
        {label}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => download(material)}
        aria-label={`Scarica ${material.title}`}
      >
        <Download className="size-5" aria-hidden />
      </Button>
      {!isAudio && <MaterialViewer material={material} open={viewing} onOpenChange={setViewing} />}
    </div>
  );
}

/** Card libreria (design "Tutti i Materiali"). */
export function MaterialCard({ material, badge }: { material: WithId<Material>; badge?: React.ReactNode }) {
  const cat = CATEGORY_META[material.category];
  return (
    <article className="card-surface card-interactive space-y-3 p-4">
      <div className="flex gap-3">
        <MaterialIcon type={material.type} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="section-label text-brand-ink">
              {cat.label} · {TYPE_META[material.type]?.label}
            </p>
            {badge}
          </div>
          <h3 className="truncate font-semibold">{material.title}</h3>
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {[formatFileSize(material.size), material.description].filter(Boolean).join(" • ")}
          </p>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <MaterialActions material={material} compact />
        <span className="text-[11px] text-muted-foreground">{formatShortDate(material.createdAt)}</span>
      </div>
    </article>
  );
}

/** Riga compatta per dettaglio lezione / esercizio. */
export function MaterialRow({ material, action }: { material: WithId<Material>; action?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-lg bg-surface-low p-2.5">
      <MaterialIcon type={material.type} className="size-10 rounded-lg" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{material.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {CATEGORY_META[material.category].label} · {formatFileSize(material.size)}
        </p>
      </div>
      <MaterialActions material={material} compact />
      {action}
    </div>
  );
}

export function NewPill() {
  return <Pill tone="success">Nuovo</Pill>;
}
