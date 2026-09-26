"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useMaterialsPage, useStaffMutation } from "@/features/admin/hooks";
import { CourseSelect, StudentSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { useTeachers } from "@/features/student-area/hooks";
import { lessonService } from "@/services/lessonService";
import { materialService } from "@/services/materialService";
import type { Lesson, WithId } from "@/types";
import { fromInputDate, fullName, toInputDate } from "@/utils/format";
import { CATEGORY_META, LESSON_META } from "@/utils/status";
import { lessonFormSchema, parseTopics, type LessonFormValues } from "./schemas";

export function LessonFormDialog({
  open,
  onOpenChange,
  lesson,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson?: WithId<Lesson> | null;
  defaults?: { studentId?: string; date?: Date };
}) {
  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={lesson ? "Modifica lezione" : "Nuova lezione"} wide>
      <LessonForm key={lesson?.id ?? "new"} lesson={lesson} defaults={defaults} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function LessonForm({
  lesson,
  defaults,
  onDone,
}: {
  lesson?: WithId<Lesson> | null;
  defaults?: { studentId?: string; date?: Date };
  onDone: () => void;
}) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const teachers = useTeachers();
  const materials = useMaterialsPage({ sort: "recent" });
  const materialItems = materials.data?.pages.flatMap((p) => p.items) ?? [];
  const [materialIds, setMaterialIds] = useState<string[]>(lesson?.materialIds ?? []);
  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      studentId: lesson?.studentId ?? defaults?.studentId ?? "",
      teacherId: lesson?.teacherId ?? uid,
      courseId: lesson?.courseId ?? "",
      date: toInputDate(lesson?.date ?? defaults?.date ?? new Date()),
      startTime: lesson?.startTime ?? "",
      endTime: lesson?.endTime ?? "",
      title: lesson?.title ?? "",
      subject: lesson?.subject ?? "",
      topics: lesson?.topics?.join("\n") ?? "",
      notes: lesson?.notes ?? "",
      status: lesson?.status ?? "scheduled",
    },
  });
  const { errors } = form.formState;

  const save = useStaffMutation(
    async (v: LessonFormValues) => {
      const student = students.data?.find((s) => s.id === v.studentId);
      const teacher = teachers.data?.find((t) => t.id === v.teacherId);
      const input = {
        studentId: v.studentId,
        studentName: student ? fullName(student) : (lesson?.studentName ?? ""),
        teacherId: v.teacherId,
        teacherName: teacher ? fullName(teacher) : (lesson?.teacherName ?? ""),
        courseId: v.courseId || undefined,
        date: fromInputDate(v.date, v.startTime),
        startTime: v.startTime || undefined,
        endTime: v.endTime || undefined,
        title: v.title,
        subject: v.subject || undefined,
        topics: parseTopics(v.topics),
        notes: v.notes || undefined,
        materialIds,
        status: v.status,
      };
      // I materiali associati devono essere leggibili dallo studente (visibilità additiva, ADR D18).
      await Promise.all(
        materialItems
          .filter((m) => materialIds.includes(m.id) && !m.studentIds?.includes(v.studentId))
          .map((m) => materialService.assignToStudents(m, [v.studentId])),
      );
      if (lesson) await lessonService.update(lesson.id, input);
      else await lessonService.create(input);
    },
    { success: lesson ? "Lezione aggiornata" : "Lezione creata", invalidate: [["lessons"], ["stats"], ["materials"]], onSuccess: onDone },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Studente" error={errors.studentId?.message} required>
          {(p) => <StudentSelect {...p} {...form.register("studentId")} />}
        </Field>
        <Field label="Docente" error={errors.teacherId?.message} required>
          {(p) => (
            <NativeSelect {...p} {...form.register("teacherId")}>
              <option value="">Seleziona docente</option>
              {teachers.data?.map((t) => (
                <option key={t.id} value={t.id}>
                  {fullName(t)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field label="Titolo" error={errors.title?.message} required>
        {(p) => <Input {...p} placeholder="Es. Tecnica vocale" {...form.register("title")} />}
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Data" error={errors.date?.message} required>
          {(p) => <Input {...p} type="date" {...form.register("date")} />}
        </Field>
        <Field label="Inizio" error={errors.startTime?.message}>
          {(p) => <Input {...p} type="time" step={300} {...form.register("startTime")} />}
        </Field>
        <Field label="Fine" error={errors.endTime?.message}>
          {(p) => <Input {...p} type="time" step={300} {...form.register("endTime")} />}
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Materia" error={errors.subject?.message}>
          {(p) => <Input {...p} placeholder="Canto moderno" {...form.register("subject")} />}
        </Field>
        <Field label="Corso">{(p) => <CourseSelect {...p} {...form.register("courseId")} />}</Field>
        <Field label="Stato">
          {(p) => (
            <NativeSelect {...p} {...form.register("status")}>
              {(["scheduled", "completed", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>
                  {LESSON_META[s].label}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
      <Field label="Argomenti" hint="Uno per riga (es. Respirazione, Appoggio, Vocalizzi)" error={errors.topics?.message}>
        {(p) => <Textarea {...p} rows={3} {...form.register("topics")} />}
      </Field>
      <Field label="Note per lo studente" hint="Visibili allo studente nel dettaglio lezione." error={errors.notes?.message}>
        {(p) => <Textarea {...p} rows={3} {...form.register("notes")} />}
      </Field>
      <CheckList
        label="Materiali della lezione"
        items={materialItems.map((m) => ({ id: m.id, label: m.title, sub: CATEGORY_META[m.category].label }))}
        selected={materialIds}
        onChange={setMaterialIds}
        emptyText="Nessun materiale caricato."
        maxHeight="max-h-44"
      />
      <p className="-mt-2 text-xs text-muted-foreground">
        I materiali selezionati diventano visibili allo studente della lezione.
      </p>
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={lesson ? "Salva" : "Crea lezione"} />
    </form>
  );
}
