"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { NativeSelect } from "@/components/ui/native-select";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useGroups, useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { materialService } from "@/services/materialService";
import type { Material, WithId } from "@/types";
import { fullName } from "@/utils/format";

const schema = z
  .object({
    courseId: z.string().optional(),
    visibility: z.enum(["all", "course", "student"]),
    studentIds: z.array(z.string()),
    groupIds: z.array(z.string()),
  })
  // "student" senza studenti = materiale non visibile a nessuno: è un'assegnazione valida (la si toglie a tutti).
  .refine((v) => v.visibility !== "course" || !!v.courseId, { path: ["courseId"], message: "Seleziona il corso" });
type Values = z.infer<typeof schema>;

/** Assegnazione di un materiale: a chi è visibile (tutti, un corso, gruppi, singoli studenti). Il contenuto si modifica altrove. */
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
    <SidePanel open={open} onOpenChange={onOpenChange} title="Assegna materiale" description={material?.title}>
      {material && <AssignForm key={material.id} material={material} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function AssignForm({ material, onDone }: { material: WithId<Material>; onDone: () => void }) {
  const { role } = useSession();
  const students = useActiveStudents();
  const groups = useGroups();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      courseId: material.courseId ?? "",
      visibility: material.visibility,
      studentIds: material.studentIds ?? [],
      groupIds: material.groupIds ?? [],
    },
  });
  const { errors } = form.formState;
  const studentIds = useWatch({ control: form.control, name: "studentIds" });
  const groupIds = useWatch({ control: form.control, name: "groupIds" });
  const visibility = useWatch({ control: form.control, name: "visibility" });
  // Condiviso anche tramite la cartella: non dipende da questa assegnazione.
  const viaFolder = (material.audience ?? []).some((id) => !(material.groupIds ?? []).includes(id));
  const nobody = visibility === "student" && studentIds.length === 0 && groupIds.length === 0 && !viaFolder;

  const assign = useStaffMutation((v: Values) => materialService.updateAssignment(material, v), {
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
              {/* A tutta la scuola solo l'admin (ADR D34); un materiale già "per tutti" resta tale. */}
              {(role === "admin" || material.visibility === "all") && <option value="all">Tutti gli studenti</option>}
            </NativeSelect>
          )}
        </Field>
        <Field label="Corso" error={errors.courseId?.message} required={visibility === "course"}>
          {(p) => <CourseSelect {...p} {...form.register("courseId")} />}
        </Field>
      </div>
      {viaFolder && (
        <p className="text-sm text-muted-foreground">
          È visibile anche a chi ha accesso alla sua cartella: la condivisione si gestisce dalla cartella.
        </p>
      )}
      {!!groups.data?.length && (
        <CheckList
          label={`Gruppi (${groupIds.length} selezionati)`}
          items={groups.data.map((g) => ({ id: g.id, label: g.name, sub: g.description }))}
          selected={groupIds}
          onChange={(ids) => form.setValue("groupIds", ids, { shouldValidate: true })}
          maxHeight="max-h-44"
        />
      )}
      <div className="space-y-1">
        <CheckList
          label={visibility === "student" ? `Studenti (${studentIds.length} selezionati)` : "Assegna anche a studenti specifici (opzionale)"}
          items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
          selected={studentIds}
          onChange={(ids) => form.setValue("studentIds", ids, { shouldValidate: true })}
          emptyText={students.isPending ? "Caricamento…" : "Nessuno studente attivo."}
          maxHeight="max-h-72"
        />
        {nobody && (
          <p className="text-xs text-muted-foreground">Nessuno studente o gruppo selezionato: il materiale non sarà visibile a nessuno.</p>
        )}
      </div>
      <FormActions onCancel={onDone} submitting={assign.isPending} submitLabel="Assegna" />
    </form>
  );
}
