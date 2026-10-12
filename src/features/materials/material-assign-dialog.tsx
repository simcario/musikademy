"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { NativeSelect } from "@/components/ui/native-select";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { materialService } from "@/services/materialService";
import type { Material, WithId } from "@/types";
import { fullName } from "@/utils/format";

const schema = z
  .object({
    courseId: z.string().optional(),
    visibility: z.enum(["all", "course", "student"]),
    studentIds: z.array(z.string()),
  })
  // "student" senza studenti = materiale non visibile a nessuno: è un'assegnazione valida (la si toglie a tutti).
  .refine((v) => v.visibility !== "course" || !!v.courseId, { path: ["courseId"], message: "Seleziona il corso" });
type Values = z.infer<typeof schema>;

/** Assegnazione di un materiale: a chi è visibile (tutti, un corso, singoli studenti). Il contenuto si modifica altrove. */
export function MaterialAssignDialog({
  open,
  onOpenChange,
  material,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  material: WithId<Material> | null;
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Assegna materiale" description={material?.title}>
      {material && <AssignForm key={material.id} material={material} onDone={() => onOpenChange(false)} />}
    </FormDialog>
  );
}

function AssignForm({ material, onDone }: { material: WithId<Material>; onDone: () => void }) {
  const students = useActiveStudents();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      courseId: material.courseId ?? "",
      visibility: material.visibility,
      studentIds: material.studentIds ?? [],
    },
  });
  const { errors } = form.formState;
  const studentIds = useWatch({ control: form.control, name: "studentIds" });
  const visibility = useWatch({ control: form.control, name: "visibility" });

  const assign = useStaffMutation((v: Values) => materialService.updateAssignment(material.id, v), {
    success: "Assegnazione aggiornata",
    invalidate: [["materials"]],
    onSuccess: onDone,
  });

  return (
    <form onSubmit={form.handleSubmit((v) => assign.mutate(v))} className="space-y-4" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
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
          label={visibility === "student" ? `Studenti (${studentIds.length} selezionati)` : "Assegna anche a studenti specifici (opzionale)"}
          items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
          selected={studentIds}
          onChange={(ids) => form.setValue("studentIds", ids, { shouldValidate: true })}
          emptyText={students.isPending ? "Caricamento…" : "Nessuno studente attivo."}
          maxHeight="max-h-72"
        />
        {visibility === "student" && studentIds.length === 0 && (
          <p className="text-xs text-muted-foreground">Nessuno studente selezionato: il materiale non sarà visibile a nessuno.</p>
        )}
      </div>
      <FormActions onCancel={onDone} submitting={assign.isPending} submitLabel="Assegna" />
    </form>
  );
}
