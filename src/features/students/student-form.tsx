"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useStaffMutation, useStaffScope } from "@/features/admin/hooks";
import { useSelectableCourses } from "@/features/admin/pickers";
import type { InviteInfo } from "@/lib/auth/invite-token";
import { studentService } from "@/services/studentService";
import type { Student, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { fromInputDate, toInputDate } from "@/utils/format";
import { InviteShare } from "./invite-share";
import { studentFormSchema, type StudentFormValues } from "./schemas";

type CreatedStudent = { name: string; email: string; phone?: string; invite: InviteInfo };

export function StudentFormDialog({
  open,
  onOpenChange,
  student,
  notes,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student?: WithId<Student> | null;
  notes?: string;
}) {
  const [created, setCreated] = useState<CreatedStudent | null>(null);
  const close = (o: boolean) => {
    if (!o) setCreated(null);
    onOpenChange(o);
  };
  return (
    <SidePanel
      open={open}
      onOpenChange={close}
      title={created ? "Studente creato" : student ? "Modifica studente" : "Nuovo studente"}
      description={
        created || student ? undefined : "Riceverai un link d'invito da inviare allo studente per accedere con Google."
      }
    >
      {created ? (
        <div className="space-y-4 pb-2">
          <InviteShare invite={created.invite} student={created} />
          <Button className="w-full" onClick={() => close(false)}>
            Fatto
          </Button>
        </div>
      ) : (
        <StudentForm
          key={student?.id ?? "new"}
          student={student}
          notes={notes}
          onCancel={() => close(false)}
          onCreated={setCreated}
          onSaved={() => close(false)}
        />
      )}
    </SidePanel>
  );
}

function StudentForm({
  student,
  notes,
  onCancel,
  onCreated,
  onSaved,
}: {
  student?: WithId<Student> | null;
  notes?: string;
  onCancel: () => void;
  onCreated: (s: CreatedStudent) => void;
  onSaved: () => void;
}) {
  const courses = useSelectableCourses();
  const scope = useStaffScope();
  // I corsi che chi modifica non gestisce (di altri docenti) non sono in elenco: restano in `courseIds` come erano.
  const kept = (student?.courseIds ?? []).filter((id) => !courses.data.some((c) => c.id === id));
  const form = useForm<StudentFormValues>({
    resolver: zodResolver(studentFormSchema),
    defaultValues: {
      name: student?.name ?? "",
      surname: student?.surname ?? "",
      email: student?.email ?? "",
      phone: student?.phone ?? "",
      courseIds: student?.courseIds ?? [],
      enrollmentDate: toInputDate(student?.enrollmentDate ?? new Date()),
      notes: notes ?? "",
    },
  });
  const { errors } = form.formState;
  const watch_courseIds = useWatch({ control: form.control, name: "courseIds" });

  const save = useStaffMutation(
    async (v: StudentFormValues) => {
      // Il docente vede solo gli studenti dei suoi corsi (ADR D29): senza, lo perderebbe di vista.
      if (!scope?.admin && !v.courseIds.some((id) => scope?.courseIds.includes(id))) {
        throw new AppError("Iscrivilo ad almeno uno dei tuoi corsi.");
      }
      const input = {
        name: v.name,
        surname: v.surname,
        email: v.email,
        phone: v.phone || "",
        courseIds: v.courseIds,
        enrollmentDate: fromInputDate(v.enrollmentDate),
        notes: v.notes || "",
      };
      if (student) {
        await studentService.update(student.id, input);
        if ((v.notes ?? "") !== (notes ?? "")) await studentService.setNotes(student.id, v.notes ?? "");
        if (v.email !== student.email) await studentService.changeEmail(student.id, v.email);
        return null;
      }
      const res = await studentService.create(input);
      return { name: v.name, email: v.email, phone: v.phone || undefined, invite: res.invite };
    },
    {
      success: () => (student ? "Studente aggiornato" : "Studente creato"),
      invalidate: [["students"], ["studentNotes"]],
      onSuccess: (r) => (r ? onCreated(r) : onSaved()),
    },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name?.message} required>
          {(p) => <Input {...p} {...form.register("name")} />}
        </Field>
        <Field label="Cognome" error={errors.surname?.message} required>
          {(p) => <Input {...p} {...form.register("surname")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Email" error={errors.email?.message} required hint={student ? "Cambiandola, cambia anche l'accesso." : undefined}>
          {(p) => <Input {...p} type="email" inputMode="email" {...form.register("email")} />}
        </Field>
        <Field label="Telefono" error={errors.phone?.message}>
          {(p) => <Input {...p} type="tel" {...form.register("phone")} />}
        </Field>
      </div>
      <Field label="Data iscrizione" error={errors.enrollmentDate?.message} required>
        {(p) => <Input {...p} type="date" {...form.register("enrollmentDate")} />}
      </Field>
      <CheckList
        label={scope?.admin ? "Corsi" : "I tuoi corsi"}
        items={courses.data.map((c) => ({ id: c.id, label: c.name }))}
        selected={watch_courseIds}
        onChange={(ids) => form.setValue("courseIds", ids, { shouldDirty: true })}
        emptyText={
          scope?.admin
            ? "Nessun corso: creane uno in Organizzazione."
            : "Non sei abilitato a nessun corso: chiedi all'amministratore."
        }
        maxHeight="max-h-40"
      />
      {kept.length > 0 && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Frequenta anche {kept.length === 1 ? "un altro corso" : `altri ${kept.length} corsi`} di altri docenti.
        </p>
      )}
      <Field label="Note private (visibili solo ai docenti)" error={errors.notes?.message}>
        {(p) => <Textarea {...p} rows={3} {...form.register("notes")} />}
      </Field>
      <FormActions onCancel={onCancel} submitting={save.isPending} submitLabel={student ? "Salva" : "Crea studente"} />
    </form>
  );
}
