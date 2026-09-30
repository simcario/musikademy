"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { lessonFormSchema, oneHourAfter, parseTopics, type LessonFormValues } from "./schemas";

export function LessonFormDialog({
  open,
  onOpenChange,
  lesson,
  copyFrom,
  defaults,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  lesson?: WithId<Lesson> | null;
  /** Nuova lezione con le stesse caratteristiche: cambiano studente, giorno e orario. */
  copyFrom?: WithId<Lesson> | null;
  defaults?: { studentId?: string; date?: Date };
}) {
  // Dalla modifica si può passare alla copia senza chiudere il dialog.
  const [copying, setCopying] = useState<WithId<Lesson> | null>(null);
  const source = copyFrom ?? copying;
  const editing = source ? null : lesson;
  const close = (o: boolean) => {
    if (!o) setCopying(null);
    onOpenChange(o);
  };
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={editing ? "Modifica lezione" : source ? "Copia lezione" : "Nuova lezione"}
      description={source ? "Stessi contenuti: scegli studente, giorno e orario della nuova lezione." : undefined}
      wide
    >
      <LessonForm
        key={source ? `copy-${source.id}` : (editing?.id ?? "new")}
        lesson={editing}
        copyFrom={source}
        defaults={defaults}
        onCopy={editing ? () => setCopying(editing) : undefined}
        onDone={() => close(false)}
      />
    </FormDialog>
  );
}

function LessonForm({
  lesson,
  copyFrom,
  defaults,
  onCopy,
  onDone,
}: {
  lesson?: WithId<Lesson> | null;
  copyFrom?: WithId<Lesson> | null;
  defaults?: { studentId?: string; date?: Date };
  onCopy?: () => void;
  onDone: () => void;
}) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const teachers = useTeachers();
  const materials = useMaterialsPage({ sort: "recent" });
  const materialItems = materials.data?.pages.flatMap((p) => p.items) ?? [];
  // In copia si parte dai contenuti della lezione sorgente; studente, giorno e orario si scelgono di nuovo.
  const base = lesson ?? copyFrom;
  const [materialIds, setMaterialIds] = useState<string[]>(base?.materialIds ?? []);
  const form = useForm<LessonFormValues>({
    resolver: zodResolver(lessonFormSchema),
    defaultValues: {
      studentId: copyFrom ? "" : (lesson?.studentId ?? defaults?.studentId ?? ""),
      teacherId: base?.teacherId ?? uid,
      courseId: base?.courseId ?? "",
      date: toInputDate(copyFrom ? new Date() : (lesson?.date ?? defaults?.date ?? new Date())),
      startTime: copyFrom ? "" : (lesson?.startTime ?? ""),
      endTime: copyFrom ? "" : (lesson?.endTime ?? ""),
      title: base?.title ?? "",
      subject: base?.subject ?? "",
      topics: base?.topics?.join("\n") ?? "",
      notes: base?.notes ?? "",
      status: copyFrom ? "scheduled" : (lesson?.status ?? "scheduled"),
    },
  });
  const { errors } = form.formState;
  const startField = form.register("startTime");

  // Fine lezione automatica: un'ora dopo l'inizio, finché non la si imposta a mano.
  const onStartChange = (start: string) => {
    const end = form.getValues("endTime");
    const endIsAuto = !end || end === oneHourAfter(form.getValues("startTime") ?? "");
    const next = oneHourAfter(start);
    if (endIsAuto && next) form.setValue("endTime", next, { shouldValidate: !!form.formState.errors.endTime });
  };

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
    { success: lesson ? "Lezione aggiornata" : copyFrom ? "Lezione copiata" : "Lezione creata", invalidate: [["lessons"], ["stats"], ["materials"]], onSuccess: onDone },
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
          {(p) => (
            <Input
              {...p}
              type="time"
              step={300}
              {...startField}
              onChange={(e) => {
                onStartChange(e.target.value);
                return startField.onChange(e);
              }}
            />
          )}
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
      {onCopy && (
        <Button type="button" variant="outline" className="w-full" onClick={onCopy} disabled={save.isPending}>
          <Copy aria-hidden /> Copia per un altro studente o giorno
        </Button>
      )}
      <FormActions onCancel={onDone} submitting={save.isPending} submitLabel={lesson ? "Salva" : "Crea lezione"} />
    </form>
  );
}
