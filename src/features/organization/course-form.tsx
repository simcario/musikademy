"use client";

import { useState } from "react";
import { useFieldArray, useForm, useWatch, type Control, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { BookMarked, Plus, Trash2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormActions } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { useTeachers } from "@/features/student-area/hooks";
import { courseService } from "@/services/userService";
import type { Course, Teacher, WithId } from "@/types";
import { fullName } from "@/utils/format";

const courseSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(100),
  description: z.string().max(500).optional(),
  active: z.boolean(),
  teacherIds: z.array(z.string()),
  subjects: z
    .array(
      z.object({
        id: z.string(),
        name: z.string().trim().min(1, "Inserisci il nome della materia").max(100),
        teacherIds: z.array(z.string()),
      }),
    )
    .max(50, "Al massimo 50 materie")
    .refine((s) => new Set(s.map((x) => x.name.trim().toLowerCase())).size === s.length, "Due materie hanno lo stesso nome"),
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
      subjects: course?.subjects ?? [],
    },
  });
  const save = useStaffMutation((v: CourseValues) => courseService.save(course, v), {
    success: course ? "Corso aggiornato" : "Corso creato",
    // Cambiano anche i corsi dei docenti (`teachers.courseIds`) e quindi ciò che vedono.
    invalidate: [["courses"], ["teachers"]],
    onSuccess: onDone,
  });
  const { errors } = form.formState;
  const watch_teacherIds = useWatch({ control: form.control, name: "teacherIds" });
  const courseTeachers = (teachers.data ?? []).filter((t) => watch_teacherIds.includes(t.id));
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Nome" error={errors.name?.message} required>
        {(p) => <Input {...p} placeholder="Canto moderno" {...form.register("name")} />}
      </Field>
      <Field label="Descrizione">{(p) => <Textarea {...p} rows={2} {...form.register("description")} />}</Field>
      <CheckList
        label="Docenti abilitati"
        items={(teachers.data ?? []).map((t) => ({ id: t.id, label: fullName(t), sub: t.email }))}
        selected={watch_teacherIds}
        onChange={(ids) => form.setValue("teacherIds", ids)}
        maxHeight="max-h-40"
      />
      <SubjectsEditor
        control={form.control}
        register={form.register}
        teachers={courseTeachers}
        error={errors.subjects?.root?.message ?? errors.subjects?.message}
        nameErrors={errors.subjects?.map?.((s) => s?.name?.message) ?? []}
        onToggleTeacher={(index, teacherId) => {
          const current = form.getValues(`subjects.${index}.teacherIds`);
          form.setValue(
            `subjects.${index}.teacherIds`,
            current.includes(teacherId) ? current.filter((t) => t !== teacherId) : [...current, teacherId],
            { shouldDirty: true },
          );
        }}
      />
      <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
        <input type="checkbox" className="size-[18px] accent-primary" {...form.register("active")} /> Corso attivo
      </label>
      <FormActions onCancel={onCancel} submitting={save.isPending} />
    </form>
  );
}

/**
 * Materie del corso (ADR D29): per ognuna i docenti che la insegnano, scelti tra quelli abilitati
 * al corso. Un docente abilitato al corso ma a nessuna materia non può fissare lezioni o costi
 * su una materia, solo sul corso se questo non ne ha.
 */
function SubjectsEditor({
  control,
  register,
  teachers,
  error,
  nameErrors,
  onToggleTeacher,
}: {
  control: Control<CourseValues>;
  register: UseFormRegister<CourseValues>;
  teachers: WithId<Teacher>[];
  error?: string;
  nameErrors: (string | undefined)[];
  onToggleTeacher: (index: number, teacherId: string) => void;
}) {
  const { fields, append, remove } = useFieldArray({ control, name: "subjects", keyName: "key" });
  const subjects = useWatch({ control, name: "subjects" });
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium">Materie</legend>
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nessuna materia: lezioni e costi si riferiscono al corso intero. Aggiungi le materie (es. Pianoforte, Teoria) per
          abilitare i docenti a ciascuna.
        </p>
      ) : (
        <ul className="space-y-2">
          {fields.map((f, i) => (
            <li key={f.key} className="space-y-2 rounded-lg border border-border p-3">
              <div className="flex items-start gap-2">
                <BookMarked className="mt-3 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <Field label={`Materia ${i + 1}`} error={nameErrors[i]} required className="flex-1">
                  {(p) => <Input {...p} placeholder="Pianoforte" {...register(`subjects.${i}.name`)} />}
                </Field>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 text-danger"
                  onClick={() => remove(i)}
                  aria-label={`Rimuovi la materia ${subjects?.[i]?.name || i + 1}`}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
              {teachers.length === 0 ? (
                <p className="text-xs text-muted-foreground">Abilita prima i docenti del corso.</p>
              ) : (
                <div className="flex flex-wrap gap-2" role="group" aria-label="Docenti della materia">
                  {teachers.map((t) => {
                    const on = subjects?.[i]?.teacherIds.includes(t.id) ?? false;
                    return (
                      <label
                        key={t.id}
                        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border px-3 text-sm has-checked:border-primary has-checked:bg-indigo-soft/60"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={on}
                          onChange={() => onToggleTeacher(i, t.id)}
                        />
                        {fullName(t)}
                      </label>
                    );
                  })}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-xs font-medium text-danger">{error}</p>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => append({ id: crypto.randomUUID().slice(0, 8), name: "", teacherIds: [] })}
      >
        <Plus aria-hidden /> Aggiungi materia
      </Button>
    </fieldset>
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
