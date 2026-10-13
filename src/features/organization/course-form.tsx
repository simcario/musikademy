"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { useTeachers } from "@/features/student-area/hooks";
import { courseService } from "@/services/userService";
import type { Course, WithId } from "@/types";
import { fullName } from "@/utils/format";

const courseSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(100),
  description: z.string().max(500).optional(),
  active: z.boolean(),
  teacherIds: z.array(z.string()),
});
type CourseValues = z.infer<typeof courseSchema>;

export function CourseForm({
  course,
  onDone,
  onCancel,
}: {
  course: WithId<Course> | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const teachers = useTeachers();
  const form = useForm<CourseValues>({
    resolver: zodResolver(courseSchema),
    defaultValues: {
      name: course?.name ?? "",
      description: course?.description ?? "",
      active: course?.active ?? true,
      teacherIds: course?.teacherIds ?? [],
    },
  });
  const save = useStaffMutation(async (v: CourseValues) => { if (course) await courseService.update(course.id, v); else await courseService.create(v); }, {
    success: course ? "Corso aggiornato" : "Corso creato",
    invalidate: [["courses"]],
    onSuccess: onDone,
  });
  const { errors } = form.formState;
  const watch_teacherIds = useWatch({ control: form.control, name: "teacherIds" });
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Nome" error={errors.name?.message} required>
        {(p) => <Input {...p} placeholder="Canto moderno" {...form.register("name")} />}
      </Field>
      <Field label="Descrizione">{(p) => <Textarea {...p} rows={2} {...form.register("description")} />}</Field>
      <CheckList
        label="Docenti"
        items={(teachers.data ?? []).map((t) => ({ id: t.id, label: fullName(t), sub: t.email }))}
        selected={watch_teacherIds}
        onChange={(ids) => form.setValue("teacherIds", ids)}
        maxHeight="max-h-40"
      />
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-[18px] accent-primary" {...form.register("active")} /> Corso attivo
      </label>
      <FormActions onCancel={onCancel} submitting={save.isPending} />
    </form>
  );
}

/** Iscrizioni al corso: chi viene tolto esce anche dai gruppi del corso (`groupIds`). */
export function CourseStudentsForm({
  course,
  enrolled,
  groupIds,
  onDone,
}: {
  course: WithId<Course>;
  enrolled: string[];
  groupIds: string[];
  onDone: () => void;
}) {
  const students = useActiveStudents();
  const [selected, setSelected] = useState(enrolled);
  const save = useStaffMutation(
    () =>
      courseService.setStudents(
        course.id,
        selected.filter((id) => !enrolled.includes(id)),
        enrolled.filter((id) => !selected.includes(id)),
        groupIds,
      ),
    { success: "Studenti del corso aggiornati", invalidate: [["students"]], onSuccess: onDone },
  );
  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <CheckList
        label={`Iscritti (${selected.length} selezionati)`}
        items={(students.data ?? []).map((s) => ({ id: s.id, label: fullName(s), sub: s.email }))}
        selected={selected}
        onChange={setSelected}
        emptyText={students.isPending ? "Caricamento…" : "Nessuno studente attivo: creane uno nella scheda Utenti."}
        maxHeight="max-h-80"
      />
      <p className="text-xs text-muted-foreground">Chi viene tolto dal corso esce anche dai suoi gruppi.</p>
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}
