"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { ACCEPT_ATTR, checkFile } from "@/lib/files";
import { materialService } from "@/services/materialService";
import { MATERIAL_CATEGORIES, type Material, type WithId } from "@/types";
import { formatFileSize, fullName } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";
import { useUploadQueue } from "./upload-queue";

const schema = z
  .object({
    title: z.string().trim().min(1, "Inserisci un titolo").max(140),
    description: z.string().max(2000).optional(),
    category: z.enum(MATERIAL_CATEGORIES),
    courseId: z.string().optional(),
    visibility: z.enum(["all", "course", "student"]),
    studentIds: z.array(z.string()),
  })
  // "student" senza studenti = materiale non ancora visibile: lo si assegna dopo dalla scheda studente.
  .refine((v) => v.visibility !== "course" || !!v.courseId, { path: ["courseId"], message: "Seleziona il corso" });
type Values = z.infer<typeof schema>;

export function MaterialFormDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  material?: WithId<Material> | null;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={material ? "Modifica materiale" : "Nuovo materiale"} wide>
      <MaterialForm key={material?.id ?? "new"} material={material} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function MaterialForm({ material, onDone }: { material?: WithId<Material> | null; onDone: () => void }) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const uploads = useUploadQueue();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: material?.title ?? "",
      description: material?.description ?? "",
      category: material?.category ?? "dispensa",
      courseId: material?.courseId ?? "",
      visibility: material?.visibility ?? "student",
      studentIds: material?.studentIds ?? [],
    },
  });
  const { errors } = form.formState;
  const watch_studentIds = useWatch({ control: form.control, name: "studentIds" });
  const visibility = useWatch({ control: form.control, name: "visibility" });

  const update = useStaffMutation((v: Values) => materialService.update(material!.id, v), {
    success: "Materiale aggiornato",
    invalidate: [["materials"]],
    onSuccess: onDone,
  });

  function onFile(f: File | null) {
    setFile(null);
    setFileError(null);
    if (!f) return;
    const check = checkFile(f);
    if (!check.ok) return setFileError(check.error);
    setFile(f);
    if (!form.getValues("title")) form.setValue("title", f.name.replace(/\.[^.]+$/, ""));
    if (check.type === "audio" && form.getValues("category") === "dispensa") form.setValue("category", "ascolto");
    if (check.type === "video" && form.getValues("category") === "dispensa") form.setValue("category", "video");
    if (check.type === "image" && form.getValues("category") === "dispensa") form.setValue("category", "immagine");
  }

  function submit(v: Values) {
    if (material) return update.mutate(v);
    if (!file) return setFileError("Seleziona un file da caricare");
    uploads.start(file, v, uid); // upload in background: il dialog si chiude subito
    onDone();
  }

  return (
    <form onSubmit={form.handleSubmit(submit)} className="space-y-4" noValidate>
      {!material && (
        <div className="space-y-1.5">
          <label
            className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-input bg-surface-low p-4 text-center hover:border-primary focus-within:border-primary"
          >
            <FileUp className="size-7 text-brand-ink" aria-hidden />
            <span className="text-sm font-semibold">{file ? file.name : "Scegli un file"}</span>
            <span className="text-xs text-muted-foreground">
              {file ? formatFileSize(file.size) : "PDF, MP3, WAV, M4A, MP4, MOV, JPG, PNG, WEBP"}
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
      )}
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} {...form.register("title")} />}
      </Field>
      <Field label="Descrizione" error={errors.description?.message}>
        {(p) => <Textarea {...p} rows={2} {...form.register("description")} />}
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Categoria">
          {(p) => (
            <NativeSelect {...p} {...form.register("category")}>
              {MATERIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_META[c].label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Visibilità">
          {(p) => (
            <NativeSelect {...p} {...form.register("visibility")}>
              <option value="student">Solo studenti assegnati</option>
              <option value="course">Un corso</option>
              <option value="all">Tutti gli studenti</option>
            </NativeSelect>
          )}
        </Field>
        <Field label="Corso" error={errors.courseId?.message} required={visibility === "course"}>
          {(p) => <CourseSelect {...p} {...form.register("courseId")} />}
        </Field>
      </div>
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
        {visibility === "student" && watch_studentIds.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nessuno studente lo vedrà finché non lo assegni dalla scheda studente (Materiali → Assegna).
          </p>
        )}
      </div>
      <FormActions onCancel={onDone} submitting={update.isPending} submitLabel={material ? "Salva" : "Carica"} />
    </form>
  );
}
