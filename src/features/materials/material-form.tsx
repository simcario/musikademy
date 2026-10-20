"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, Link2, Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { Segmented } from "@/components/shared/segmented";
import { useActiveStudents, useGroups, useSongs, useScopeGetter, useStaffMutation } from "@/features/admin/hooks";
import { GroupChips } from "@/features/songs/song-dialog";
import { CourseSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { ACCEPT_ATTR, checkFile } from "@/lib/files";
import { VIDEO_PROVIDER_LABEL, parseVideoUrl } from "@/lib/video";
import { materialService } from "@/services/materialService";
import {
  EXERCISE_CATEGORY,
  LIBRARY_CATEGORIES,
  MATERIAL_CATEGORIES,
  type Material,
  type MaterialCategory,
  type WithId,
} from "@/types";
import { formatFileSize, fullName } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { FolderSelect } from "./folder-dialogs";
import { useUploadQueue } from "./upload-queue";

const schema = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(140),
    description: z.string().max(2000).optional(),
    // Obbligatoria: senza una scheda di categoria aperta il menu parte vuoto.
    category: z.enum(MATERIAL_CATEGORIES, { error: "Seleziona la categoria" }),
    courseId: z.string().optional(),
    visibility: z.enum(["all", "course", "student"]),
    studentIds: z.array(z.string()),
    groupIds: z.array(z.string()),
    folderId: z.string().optional(),
  })
  // "student" senza studenti = materiale non ancora visibile: lo si assegna dopo dalla scheda studente.
  .refine((v) => v.visibility !== "course" || !!v.courseId, { path: ["courseId"], message: "Seleziona il corso" });
type Values = z.infer<typeof schema>;

/**
 * File da caricare oppure link online (YouTube, Vimeo, file video: ADR D30). Il link può essere un video
 * ma anche un ascolto o una base: con categoria Ascolto/Base compare nella sezione Ascolti.
 */
type Source = "file" | "link";

/** Caricamento di un nuovo materiale. Per modificarlo o riassegnarlo: MaterialEditorDialog e MaterialAssignDialog. */
export function MaterialFormDialog({
  open,
  onOpenChange,
  exercise,
  folderId,
  category,
  description,
  onCreated,
  songPicker = true,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Voce del catalogo esercizi: categoria fissa, la visibilità è data dalle assegnazioni. */
  exercise?: boolean;
  /** Cartella proposta (quella aperta nella pagina Materiali). */
  folderId?: string;
  /** Categoria proposta (la scheda aperta nella pagina Materiali); assente = da scegliere. */
  category?: MaterialCategory;
  description?: string;
  /** Materiale pronto (link salvato o file caricato, anche a pannello già chiuso). */
  onCreated?: (id: string) => void;
  /** Scelta del brano a cui aggiungerlo: no quando il materiale nasce già dentro un brano. */
  songPicker?: boolean;
}) {
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={exercise ? "Nuovo esercizio" : "Nuovo materiale"}
      description={description ?? (exercise ? "Entra nel catalogo: gli studenti lo vedono solo quando glielo assegni." : undefined)}
      wide
    >
      <MaterialForm
        exercise={exercise}
        folderId={folderId}
        category={category}
        onCreated={onCreated}
        songPicker={songPicker}
        onDone={() => onOpenChange(false)}
      />
    </SidePanel>
  );
}

/**
 * "Nuovo materiale" dentro un selettore di materiali: apre il form di caricamento sopra il pannello in corso
 * (che resta com'è) e, a materiale pronto, lo passa a `onCreated` per selezionarlo.
 */
export function CreateMaterialButton({
  onCreated,
  songPicker,
  context,
  className,
}: {
  onCreated: (material: WithId<Material>) => void;
  songPicker?: boolean;
  /** Dove finirà il materiale, mostrato nel pannello (es. il titolo del brano). */
  context?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" className={className} onClick={() => setOpen(true)}>
        <Plus aria-hidden /> Nuovo materiale
      </Button>
      {/* Gli eventi React attraversano i portali: il submit di questo form non deve arrivare al form che lo contiene. */}
      <span className="contents" onSubmit={(e) => e.stopPropagation()}>
        <MaterialFormDialog
          open={open}
          onOpenChange={setOpen}
          songPicker={songPicker}
          description={context ? `Sarà aggiunto a: ${context}` : "Sarà selezionato appena pronto."}
          onCreated={async (id) => {
            const [m] = await materialService.getMany([id]);
            if (m) onCreated(m);
          }}
        />
      </span>
    </>
  );
}

function MaterialForm({
  exercise,
  folderId,
  category,
  onDone,
  onCreated,
  songPicker = true,
}: {
  exercise?: boolean;
  folderId?: string;
  category?: MaterialCategory;
  onDone: () => void;
  onCreated?: (id: string) => void;
  songPicker?: boolean;
}) {
  const { uid, role } = useSession();
  const students = useActiveStudents();
  const groups = useGroups();
  const uploads = useUploadQueue();
  const [source, setSource] = useState<Source>(category === "video" ? "link" : "file");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  // Brano a cui aggiungere il materiale (ADR D29) e gruppi per cui vale nel brano.
  const songs = useSongs(!exercise && songPicker);
  const [songId, setSongId] = useState("");
  const [songGroups, setSongGroups] = useState<string[]>([]);
  const video = link.trim() ? parseVideoUrl(link) : null;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      // Vuota finché non si sceglie: il resolver la rifiuta con "Seleziona la categoria".
      category: exercise ? EXERCISE_CATEGORY : (category ?? ("" as MaterialCategory)),
      courseId: "",
      visibility: "student",
      studentIds: [],
      groupIds: [],
      folderId: folderId ?? "",
    },
  });
  const { errors } = form.formState;
  const watch_studentIds = useWatch({ control: form.control, name: "studentIds" });
  const watch_groupIds = useWatch({ control: form.control, name: "groupIds" });
  const watch_folderId = useWatch({ control: form.control, name: "folderId" });
  const visibility = useWatch({ control: form.control, name: "visibility" });

  /** Propone la categoria dal tipo di file solo se il docente non ne ha già scelta una. */
  function suggestCategory(c: MaterialCategory) {
    if (!exercise && !form.getValues("category")) form.setValue("category", c, { shouldValidate: true });
  }

  function onFile(f: File | null) {
    setFile(null);
    setFileError(null);
    if (!f) return;
    const check = checkFile(f);
    if (!check.ok) return setFileError(check.error);
    setFile(f);
    if (!form.getValues("title")) form.setValue("title", f.name.replace(/\.[^.]+$/, ""));
    if (check.type === "audio") suggestCategory("ascolto");
    if (check.type === "video") suggestCategory("video");
    if (check.type === "image") suggestCategory("immagine");
  }

  function onSource(s: Source) {
    setSource(s);
    if (s === "link") suggestCategory("video");
  }

  const getScope = useScopeGetter();
  const withSong = (v: Values) => ({ ...v, song: songId ? { id: songId, groupIds: songGroups, scope: getScope() } : undefined });
  const createLink = useStaffMutation((v: Values) => materialService.createLink(link, withSong(v), uid), {
    success: "Link aggiunto",
    invalidate: [["materials"], ["songs"]],
    onSuccess: (id) => {
      onCreated?.(id);
      onDone();
    },
  });

  function submit(v: Values) {
    if (source === "link") {
      if (!video) return setLinkError("Incolla il link completo del video (https://…)");
      return createLink.mutate(v);
    }
    if (!file) return setFileError("Seleziona un file da caricare");
    // Upload in background: il dialog si chiude subito, `onCreated` arriva a caricamento finito.
    uploads.start(file, withSong(v), uid).then(
      (id) => onCreated?.(id),
      () => {}, // errore già mostrato dalla coda di upload
    );
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      {!exercise && (
        <Segmented
          label="Origine del materiale"
          value={source}
          onChange={onSource}
          options={[
            { value: "file", label: "Carica un file" },
            { value: "link", label: "Link YouTube / Vimeo" },
          ]}
        />
      )}
      {source === "file" ? (
        <div className="space-y-1.5">
          <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-surface-low p-4 text-center hover:border-primary focus-within:border-primary">
            <FileUp className="size-7 text-brand-ink" aria-hidden />
            <span className="text-sm font-semibold">{file ? file.name : "Scegli un file"}</span>
            <span className="text-xs text-muted-foreground">
              {file ? formatFileSize(file.size) : "PDF, MP3, WAV, M4A, MP4, MOV, JPG, PNG, WEBP, MD"}
            </span>
            <input
              type="file"
              accept={ACCEPT_ATTR}
              className="sr-only"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              aria-describedby={fileError ? "file-error" : undefined}
            />
          </label>
          {fileError && (
            <p id="file-error" role="alert" className="text-xs font-medium text-danger">
              {fileError}
            </p>
          )}
        </div>
      ) : (
        <Field
          label="Link"
          required
          error={linkError ?? undefined}
          hint={
            video
              ? `Riconosciuto: ${VIDEO_PROVIDER_LABEL[video.provider]}${video.provider === "link" ? " (si aprirà in una nuova scheda)" : ""}`
              : "YouTube, Vimeo o l'indirizzo di un file video (MP4, WEBM). Per gli ascolti scegli la categoria Ascolto o Base."
          }
        >
          {(p) => (
            <div className="relative">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                {...p}
                type="url"
                inputMode="url"
                placeholder="https://www.youtube.com/watch?v=…"
                value={link}
                onChange={(e) => {
                  setLink(e.target.value);
                  setLinkError(null);
                }}
                className="pl-9"
              />
            </div>
          )}
        </Field>
      )}
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} {...form.register("title")} />}
      </Field>
      <Field label={exercise ? "Istruzioni" : "Descrizione"} error={errors.description?.message}>
        {(p) => <Textarea {...p} rows={2} {...form.register("description")} />}
      </Field>
      {!exercise && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Categoria" error={errors.category?.message} required>
              {(p) => (
                <NativeSelect {...p} {...form.register("category")}>
                  <option value="" disabled>
                    Seleziona la categoria
                  </option>
                  {LIBRARY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_META[c].label}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
            <Field label="Cartella">{(p) => <FolderSelect {...p} {...form.register("folderId")} />}</Field>
            <Field label="Visibilità">
              {(p) => (
                <NativeSelect {...p} {...form.register("visibility")}>
                  <option value="student">Solo studenti assegnati</option>
                  <option value="course">Un corso</option>
                  {/* A tutta la scuola solo l'admin (ADR D34). */}
                  {role === "admin" && <option value="all">Tutti gli studenti</option>}
                </NativeSelect>
              )}
            </Field>
            <Field label="Corso" error={errors.courseId?.message} required={visibility === "course"}>
              {(p) => <CourseSelect {...p} {...form.register("courseId")} />}
            </Field>
          </div>
          {songPicker && !!songs.data?.length && (
            <div className="space-y-2 rounded-lg border border-input p-3">
              <Field label="Brano (opzionale)" hint="Il materiale entra nel brano e arriva a chi riceve una playlist che lo contiene.">
                {(p) => (
                  <NativeSelect {...p} value={songId} onChange={(e) => setSongId(e.target.value)}>
                    <option value="">Nessun brano</option>
                    {songs.data.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.title}
                        {s.artist ? ` — ${s.artist}` : ""}
                      </option>
                    ))}
                  </NativeSelect>
                )}
              </Field>
              {songId && (
                <div className="space-y-1">
                  <p className="text-[13px] font-medium">Nel brano vale per</p>
                  <GroupChips groups={groups.data ?? []} value={songGroups} onChange={setSongGroups} label="Gruppi per cui vale nel brano" />
                </div>
              )}
            </div>
          )}
          {!!groups.data?.length && (
            <CheckList
              label="Assegna a gruppi (opzionale)"
              items={groups.data.map((g) => ({ id: g.id, label: g.name, sub: g.description }))}
              selected={watch_groupIds}
              onChange={(ids) => form.setValue("groupIds", ids, { shouldValidate: true })}
              maxHeight="max-h-36"
            />
          )}
          <div className="space-y-1">
            <CheckList
              label={
                visibility === "student"
                  ? "Rendi visibile subito a (opzionale)"
                  : "Assegna anche a studenti specifici (opzionale)"
              }
              items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
              selected={watch_studentIds}
              onChange={(ids) => form.setValue("studentIds", ids, { shouldValidate: true })}
              maxHeight="max-h-44"
            />
            {visibility === "student" && watch_studentIds.length === 0 && watch_groupIds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                {watch_folderId
                  ? "Lo vedrà solo chi ha accesso alla cartella."
                  : "Nessuno studente lo vedrà finché non lo assegni (menu del materiale → Assegna)."}
              </p>
            )}
          </div>
        </>
      )}
      <FormActions
        onCancel={onDone}
        submitting={createLink.isPending}
        submitLabel={source === "link" ? "Aggiungi link" : "Carica"}
      />
    </form>
  );
}