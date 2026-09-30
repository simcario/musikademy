"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FileUp, Paperclip, X } from "lucide-react";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { ACCEPT_ATTR, checkFile } from "@/lib/files";
import { assignmentService } from "@/services/assignmentService";
import { materialService } from "@/services/materialService";
import type { Assignment, WithId } from "@/types";
import { formatFileSize, fromInputDate, fullName, toInputDate } from "@/utils/format";
import { CATEGORY_META } from "@/utils/status";

export const assignmentFormSchema = z.object({
  title: z.string().trim().min(1, "Inserisci un titolo").max(140),
  description: z.string().max(2000).optional(),
  studentIds: z.array(z.string()).min(1, "Seleziona almeno uno studente"),
  materialIds: z.array(z.string()).max(20),
  dueDate: z.string().optional(),
});
type Values = z.infer<typeof assignmentFormSchema>;

export function AssignmentFormDialog({
  open,
  onOpenChange,
  assignment,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assignment?: WithId<Assignment> | null;
  defaults?: { studentIds?: string[]; lessonId?: string; materialIds?: string[] };
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={assignment ? "Modifica esercizio" : "Assegna esercizio"}
      description={assignment ? undefined : "Puoi assegnarlo a più studenti in un'unica operazione."}
      wide
    >
      <AssignmentForm key={assignment?.id ?? "new"} assignment={assignment} defaults={defaults} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function AssignmentForm({
  assignment,
  defaults,
  onDone,
}: {
  assignment?: WithId<Assignment> | null;
  defaults?: { studentIds?: string[]; lessonId?: string; materialIds?: string[] };
  onDone: () => void;
}) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const materials = useMaterialsPage({ sort: "recent" });
  const materialItems = materials.data?.pages.flatMap((p) => p.items) ?? [];
  const form = useForm<Values>({
    resolver: zodResolver(assignmentFormSchema),
    defaultValues: {
      title: assignment?.title ?? "",
      description: assignment?.description ?? "",
      studentIds: assignment ? [assignment.studentId] : (defaults?.studentIds ?? []),
      materialIds: assignment?.materialIds ?? defaults?.materialIds ?? [],
      dueDate: toInputDate(assignment?.dueDate),
    },
  });
  const { errors } = form.formState;
  const watch_studentIds = useWatch({ control: form.control, name: "studentIds" });
  const watch_materialIds = useWatch({ control: form.control, name: "materialIds" });
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  function addFiles(list: FileList | null) {
    setFileError(null);
    const picked = Array.from(list ?? []);
    const rejected = picked.flatMap((f) => {
      const check = checkFile(f);
      return check.ok ? [] : [`${f.name}: ${check.error}`];
    });
    if (rejected.length) setFileError(rejected.join(" "));
    setFiles((xs) => [...xs, ...picked.filter((f) => checkFile(f).ok)].slice(0, 10));
  }

  /** Gli allegati diventano materiali "esercizio" visibili solo agli studenti dell'esercizio. */
  async function uploadAttachments(title: string, studentIds: string[]): Promise<string[]> {
    if (files.length === 0) return [];
    const total = files.reduce((s, f) => s + f.size, 0);
    const sent = files.map(() => 0);
    setUploadPct(0);
    try {
      return await Promise.all(
        files.map((f, i) => {
          const h = materialService.upload(
            f,
            {
              title: f.name.replace(/\.[^.]+$/, ""),
              description: `Allegato all'esercizio “${title}”`,
              category: "esercizio",
              visibility: "student",
              studentIds,
            },
            uid,
          );
          h.task.on("state_changed", (snap) => {
            sent[i] = snap.bytesTransferred;
            setUploadPct(Math.round((sent.reduce((a, b) => a + b, 0) / total) * 100));
          });
          return h.done;
        }),
      );
    } finally {
      setUploadPct(null);
    }
  }

  const save = useStaffMutation(
    async (v: Values) => {
      const targetIds = assignment ? [assignment.studentId] : v.studentIds;
      const uploadedIds = await uploadAttachments(v.title, targetIds);
      // I materiali collegati devono essere leggibili dagli studenti (visibilità additiva, ADR D18).
      await Promise.all(
        materialItems
          .filter((m) => v.materialIds.includes(m.id) && targetIds.some((id) => !m.studentIds?.includes(id)))
          .map((m) => materialService.assignToStudents(m, targetIds)),
      );
      const input = {
        title: v.title,
        description: v.description || undefined,
        lessonId: assignment?.lessonId ?? defaults?.lessonId,
        materialIds: [...v.materialIds, ...uploadedIds],
        dueDate: v.dueDate ? fromInputDate(v.dueDate, "23:59") : undefined,
      };
      if (assignment) return assignmentService.update(assignment.id, input, assignment.studentName);
      const selected = (students.data ?? [])
        .filter((s) => v.studentIds.includes(s.id))
        .map((s) => ({ id: s.id, name: fullName(s) }));
      return assignmentService.assign(input, selected, uid);
    },
    {
      success: (_r, v) =>
        assignment ? "Esercizio aggiornato" : `Esercizio assegnato a ${v.studentIds.length} student${v.studentIds.length === 1 ? "e" : "i"}`,
      invalidate: [["assignments"], ["materials"]],
      onSuccess: onDone,
    },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} placeholder="Es. Vocalizzo 04 – Agilità" {...form.register("title")} />}
      </Field>
      <Field label="Istruzioni" hint="Supporta Markdown: **grassetto**, elenchi con -, titoli con #" error={errors.description?.message}>
        {(p) => <Textarea {...p} rows={5} className="font-mono text-[13px]" placeholder="Es. 10 minuti al giorno" {...form.register("description")} />}
      </Field>
      <Field label="Scadenza" error={errors.dueDate?.message}>
        {(p) => <Input {...p} type="date" {...form.register("dueDate")} />}
      </Field>
      {!assignment && (
        <div className="space-y-1">
          <CheckList
            label="Studenti"
            items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
            selected={watch_studentIds}
            onChange={(ids) => form.setValue("studentIds", ids, { shouldValidate: true })}
          />
          {errors.studentIds && (
            <p role="alert" className="text-xs font-medium text-danger">
              {errors.studentIds.message}
            </p>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <p className="text-[13px] font-medium">Allegati</p>
        <label className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-input bg-surface-low p-3 text-center hover:border-primary focus-within:border-primary">
          <FileUp className="size-6 text-brand-ink" aria-hidden />
          <span className="text-sm font-semibold">Allega file</span>
          <span className="text-xs text-muted-foreground">PDF, audio, video, immagini o Markdown (.md) · anche più file</span>
          <input
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="sr-only"
            disabled={save.isPending}
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            aria-describedby={fileError ? "attach-error" : undefined}
          />
        </label>
        {fileError && (
          <p id="attach-error" role="alert" className="text-xs font-medium text-danger">
            {fileError}
          </p>
        )}
        {files.length > 0 && (
          <ul className="space-y-1 rounded-lg border border-input bg-card p-1">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex min-h-10 items-center gap-2 px-2 text-sm">
                <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-medium">{f.name}</span>
                <span className="text-xs text-muted-foreground tabular-nums">{formatFileSize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => setFiles((xs) => xs.filter((_, j) => j !== i))}
                  disabled={save.isPending}
                  aria-label={`Rimuovi ${f.name}`}
                  className="flex size-8 items-center justify-center rounded-full hover:bg-muted"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {uploadPct !== null && (
          <p className="text-xs text-muted-foreground" aria-live="polite">
            Caricamento allegati… {uploadPct}%
          </p>
        )}
      </div>
      <CheckList
        label="Materiali già caricati"
        items={materialItems.map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
        selected={watch_materialIds}
        onChange={(ids) => form.setValue("materialIds", ids)}
        emptyText="Nessun materiale caricato."
        maxHeight="max-h-44"
      />
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={assignment ? "Salva" : "Assegna"} />
    </form>
  );
}
