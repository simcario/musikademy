"use client";

import { Suspense, lazy, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileText, Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import type { MarkdownEditorApi } from "@/components/shared/markdown-editor";
import { useStaffMutation } from "@/features/admin/hooks";
import { qk } from "@/hooks/query-keys";
import { dirOf } from "@/lib/files";
import { VIDEO_PROVIDER_LABEL, parseVideoUrl } from "@/lib/video";
import { materialService } from "@/services/materialService";
import { LIBRARY_CATEGORIES, LYRICS_CATEGORY, MATERIAL_CATEGORIES, type Material, type WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { CATEGORY_META } from "@/utils/status";
import { useMaterialUrl } from "./material-card";

// L'editor è pesante: si scarica solo quando si apre un Markdown.
const MarkdownEditor = lazy(() => import("@/components/shared/markdown-editor"));

const schema = z.object({
  title: z.string().trim().min(1, "Inserisci un titolo").max(140),
  description: z.string().max(2000).optional(),
  category: z.enum(MATERIAL_CATEGORIES),
});
type Values = z.infer<typeof schema>;

/**
 * Modifica di un materiale a schermo intero: titolo, descrizione, categoria e, per i Markdown,
 * il contenuto in un editor visuale. L'assegnazione agli studenti è in MaterialAssignDialog.
 */
export function MaterialEditorDialog({
  open,
  onOpenChange,
  material,
  exercise,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  material: WithId<Material> | null;
  /** Voce del catalogo esercizi: categoria fissa. */
  exercise?: boolean;
}) {
  if (!open || !material) return null;
  return <Editor key={material.id} material={material} exercise={exercise} onClose={() => onOpenChange(false)} />;
}

function Editor({ material, exercise, onClose }: { material: WithId<Material>; exercise?: boolean; onClose: () => void }) {
  const isMarkdown = material.type === "markdown";
  const editor = useRef<MarkdownEditorApi | null>(null);
  const [contentDirty, setContentDirty] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  // Video online (ADR D30): il link si può cambiare.
  const [link, setLink] = useState(material.externalUrl ?? "");
  const linkDirty = !!material.externalUrl && link.trim() !== material.externalUrl;
  const linkVideo = material.externalUrl ? parseVideoUrl(link) : null;

  // I Markdown caricati prima che il testo fosse copiato in Firestore si leggono dal file.
  const file = useQuery({
    queryKey: ["file-text", material.storagePath],
    queryFn: async () => (await materialService.fileBlob(material)).text(),
    enabled: isMarkdown && material.content === undefined,
    staleTime: 0,
  });
  const original = material.content ?? file.data;

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { title: material.title, description: material.description ?? "", category: material.category },
  });
  const { errors, isDirty } = form.formState;

  // Testi (ADR D27): tracce audio a cui il testo è associato.
  const isLyrics = useWatch({ control: form.control, name: "category" }) === LYRICS_CATEGORY && isMarkdown;
  const tracks = useQuery({ queryKey: qk.materials("audio"), queryFn: () => materialService.listAudio(), enabled: isLyrics });
  const linked = useQuery({
    queryKey: qk.materials({ lyricsOf: material.id }),
    queryFn: () => materialService.listLyricsTracks(material.id),
    enabled: isMarkdown,
    staleTime: 0,
  });
  // `null` finché il docente non tocca la lista: vale l'associazione salvata.
  const [pickedTracks, setPickedTracks] = useState<string[] | null>(null);
  const trackIds = pickedTracks ?? linked.data?.map((t) => t.id) ?? [];

  const save = useStaffMutation(
    async (v: Values) => {
      const content = contentDirty ? editor.current?.getMarkdown() : undefined;
      await materialService.updateDetails(material, v, content, linkDirty ? link : undefined);
      // Le tracce associate ricevono il testo aggiornato; cambiando categoria l'associazione decade.
      const lyrics = v.category === LYRICS_CATEGORY;
      if (isMarkdown && (lyrics || linked.data?.length)) {
        await materialService.linkLyrics(material.id, content ?? original ?? "", lyrics ? trackIds : []);
      }
    },
    {
      success: exercise ? "Esercizio aggiornato" : "Materiale aggiornato",
      invalidate: [["materials"], ["file-text"]],
      onSuccess: onClose,
    },
  );

  function discard() {
    // Le immagini caricate in questa sessione e mai salvate nel documento non devono restare su Storage.
    if (uploaded && original !== undefined) void materialService.pruneImages(material, original).catch(() => undefined);
    onClose();
  }

  function requestClose() {
    if (save.isPending) return;
    if (isDirty || contentDirty || pickedTracks || linkDirty) setConfirmClose(true);
    else discard();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && requestClose()}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 ring-0 sm:max-w-none data-open:zoom-in-100 data-closed:zoom-out-100"
      >
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="flex min-h-0 flex-1 flex-col" noValidate>
          <header className="flex shrink-0 items-center gap-2 border-b border-border bg-popover px-4 py-2">
            <div className="min-w-0 flex-1 space-y-1">
              <DialogTitle className="truncate text-base font-semibold">
                {exercise ? "Modifica esercizio" : "Modifica materiale"}
              </DialogTitle>
              <DialogDescription className="truncate text-xs">{material.externalUrl ?? material.fileName}</DialogDescription>
            </div>
            <Button type="button" variant="outline" onClick={requestClose} disabled={save.isPending}>
              Annulla
            </Button>
            <Button
              type="submit"
              disabled={
                save.isPending || (isMarkdown && (original === undefined || linked.isPending)) || (!!material.externalUrl && !linkVideo)
              }
            >
              {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
              Salva
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
            <aside className="shrink-0 space-y-4 border-b border-border bg-popover p-4 lg:w-80 lg:overflow-y-auto lg:border-r lg:border-b-0">
              {material.externalUrl && (
                <Field
                  label="Link del video"
                  required
                  error={linkVideo ? undefined : "Incolla il link completo del video (https://…)"}
                  hint={linkVideo ? `Riconosciuto: ${VIDEO_PROVIDER_LABEL[linkVideo.provider]}` : undefined}
                >
                  {(p) => <Input {...p} type="url" inputMode="url" value={link} onChange={(ev) => setLink(ev.target.value)} />}
                </Field>
              )}
              <Field label="Titolo" error={errors.title?.message} required>
                {(p) => <Input {...p} {...form.register("title")} />}
              </Field>
              <Field label={exercise ? "Istruzioni" : "Descrizione"} error={errors.description?.message}>
                {(p) => <Textarea {...p} rows={4} {...form.register("description")} />}
              </Field>
              {!exercise && (
                <Field label="Categoria">
                  {(p) => (
                    <NativeSelect {...p} {...form.register("category")}>
                      {LIBRARY_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {CATEGORY_META[c].label}
                        </option>
                      ))}
                    </NativeSelect>
                  )}
                </Field>
              )}
              {isLyrics && (
                <div className="space-y-1">
                  <CheckList
                    label={`Tracce associate (${trackIds.length})`}
                    items={(tracks.data ?? []).map((t) => ({
                      id: t.id,
                      label: t.title,
                      sub: t.lyricsId && t.lyricsId !== material.id ? "Ha già un altro testo: verrà sostituito" : CATEGORY_META[t.category].label,
                    }))}
                    selected={trackIds}
                    onChange={setPickedTracks}
                    emptyText={tracks.isPending ? "Caricamento…" : "Nessuna traccia audio caricata."}
                    maxHeight="max-h-72"
                  />
                  <p className="text-xs text-muted-foreground">
                    Il testo compare nel player di queste tracce, per chiunque possa ascoltarle: non serve assegnarlo agli
                    studenti.
                  </p>
                </div>
              )}
            </aside>

            <div className="flex min-h-0 flex-1 flex-col bg-surface-low">
              {material.externalUrl ? (
                <OnlinePreview url={linkVideo ? link : material.externalUrl} title={material.title} />
              ) : !isMarkdown ? (
                <Preview material={material} />
              ) : file.isError ? (
                <Centered>
                  <p className="p-6 text-sm text-danger">{errorMessage(file.error, "Impossibile leggere il documento.")}</p>
                </Centered>
              ) : original === undefined ? (
                <Spinner />
              ) : (
                <Suspense fallback={<Spinner />}>
                  <MarkdownEditor
                    value={original}
                    apiRef={editor}
                    onDirty={() => setContentDirty(true)}
                    assetDir={dirOf(material.storagePath)}
                    uploadImage={async (f) => {
                      const name = await materialService.uploadImage(material, f);
                      setUploaded(true);
                      return name;
                    }}
                  />
                </Suspense>
              )}
            </div>
          </div>
        </form>

        <ConfirmDialog
          open={confirmClose}
          onOpenChange={setConfirmClose}
          title="Uscire senza salvare?"
          description="Le modifiche non salvate andranno perse."
          confirmLabel="Esci senza salvare"
          destructive
          onConfirm={discard}
        />
      </DialogContent>
    </Dialog>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="flex min-h-48 flex-1 items-center justify-center">{children}</div>;
}

function Spinner() {
  return (
    <Centered>
      <Loader2 className="size-6 animate-spin text-primary" aria-label="Caricamento" />
    </Centered>
  );
}

/** Anteprima di un video online: player incorporato, file video o semplice link. */
function OnlinePreview({ url, title }: { url: string; title: string }) {
  const video = parseVideoUrl(url);
  if (video?.embedUrl) {
    return (
      <iframe
        src={video.embedUrl}
        title={title}
        allow="encrypted-media; fullscreen; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        className="min-h-[50vh] w-full flex-1 border-0 bg-black"
      />
    );
  }
  if (video?.provider === "file") {
    return <video src={video.url} controls playsInline preload="metadata" className="min-h-0 w-full flex-1 bg-black object-contain" />;
  }
  return (
    <Centered>
      <div className="space-y-3 p-6 text-center">
        <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden />
        <p className="text-sm text-muted-foreground">Anteprima non disponibile: lo studente aprirà il link in una nuova scheda.</p>
      </div>
    </Centered>
  );
}

/** Il file non è modificabile in-app: lo si mostra accanto ai dettagli, per sapere cosa si sta rinominando. */
function Preview({ material }: { material: WithId<Material> }) {
  const url = useMaterialUrl(material);
  if (url.isPending) return <Spinner />;
  if (url.isError) {
    return (
      <Centered>
        <p className="p-6 text-sm text-danger">{errorMessage(url.error)}</p>
      </Centered>
    );
  }
  switch (material.type) {
    case "pdf":
      return <iframe src={url.data} title={material.title} className="min-h-[70vh] w-full flex-1 border-0 bg-white" />;
    case "video":
      return <video src={url.data} controls playsInline preload="metadata" className="min-h-0 w-full flex-1 bg-black object-contain" />;
    case "image":
      return (
        <div className="flex min-h-0 flex-1 items-center justify-center p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- URL firmato dinamico di Storage */}
          <img src={url.data} alt={material.title} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      );
    case "audio":
      return (
        <Centered>
          <audio src={url.data} controls preload="metadata" className="w-full max-w-md px-4" />
        </Centered>
      );
    default:
      return (
        <Centered>
          <div className="space-y-3 p-6 text-center">
            <FileText className="mx-auto size-10 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">Anteprima non disponibile per questo formato.</p>
          </div>
        </Centered>
      );
  }
}
