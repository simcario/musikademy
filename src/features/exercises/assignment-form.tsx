"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { assignmentService } from "@/services/assignmentService";
import type { Assignment, WithId } from "@/types";
import { fromInputDate, fullName, toInputDate } from "@/utils/format";
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

  const save = useStaffMutation(
    async (v: Values) => {
      const input = {
        title: v.title,
        description: v.description || undefined,
        lessonId: assignment?.lessonId ?? defaults?.lessonId,
        materialIds: v.materialIds,
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
      invalidate: [["assignments"]],
      onSuccess: onDone,
    },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} placeholder="Es. Vocalizzo 04 – Agilità" {...form.register("title")} />}
      </Field>
      <Field label="Istruzioni" hint="Es. 10 minuti al giorno" error={errors.description?.message}>
        {(p) => <Textarea {...p} rows={3} {...form.register("description")} />}
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
      <CheckList
        label="Materiali collegati"
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
