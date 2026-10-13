"use client";

import { useState } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, ChevronRight, GraduationCap, Pencil, Plus, UserCog } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/shared/brand";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { CheckList, Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { Pill } from "@/components/shared/status-badge";
import { useActiveStudents, useGroups, useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { useCourses, useTeachers } from "@/features/student-area/hooks";
import { can } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { courseService } from "@/services/userService";
import type { Course, Student, StudentGroup, WithId } from "@/types";
import { fullName } from "@/utils/format";
import { GroupForm, GroupList } from "./group-list";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Scheda "Corsi" della sezione Organizzazione: ogni corso con i suoi gruppi e i suoi studenti.
 * `creating` è pilotato dalla pagina, che ha il pulsante "Nuovo corso" nell'intestazione.
 */
export function CoursesTab({ creating, onCreatingChange }: { creating: boolean; onCreatingChange: (o: boolean) => void }) {
  const { role } = useSession();
  const editable = can(role, "settings:manage");
  const courses = useCourses();
  const groups = useGroups();
  const students = useActiveStudents();
  const [editing, setEditing] = useState<WithId<Course> | null>(null);

  if (courses.isPending) return <ListSkeleton rows={3} />;
  if (courses.isError) return <ErrorState error={courses.error} onRetry={() => courses.refetch()} />;

  const courseIds = new Set(courses.data.map((c) => c.id));
  const allGroups = groups.data ?? [];
  const allStudents = students.data ?? [];
  // Gruppi creati prima dei corsi e studenti non ancora iscritti: restano raggiungibili da qui.
  const looseGroups = allGroups.filter((g) => !g.courseId || !courseIds.has(g.courseId));
  const looseStudents = allStudents.filter((s) => !s.courseIds.some((c) => courseIds.has(c)));
  const sorted = [...courses.data].sort((a, b) => Number(b.active) - Number(a.active));

  return (
    <>
      {!editable && (
        <p className="rounded-lg bg-info-soft p-3 text-sm text-info">
          I corsi sono creati dall&apos;amministratore. Qui puoi gestirne gruppi e studenti.
        </p>
      )}
      {sorted.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nessun corso"
          description="Crea un corso per organizzare gruppi e studenti. Uno studente può frequentare più corsi."
          action={
            editable && (
              <Button onClick={() => onCreatingChange(true)}>
                <Plus aria-hidden /> Crea il primo corso
              </Button>
            )
          }
        />
      ) : (
        <div className="space-y-3">
          {sorted.map((c) => (
            <CourseCard
              key={c.id}
              course={c}
              groups={allGroups.filter((g) => g.courseId === c.id)}
              students={allStudents.filter((s) => s.courseIds.includes(c.id))}
              loading={groups.isPending || students.isPending}
              onEdit={editable ? () => setEditing(c) : undefined}
            />
          ))}
        </div>
      )}
      {(looseGroups.length > 0 || looseStudents.length > 0) && (
        <CourseCard course={null} groups={looseGroups} students={looseStudents} loading={false} />
      )}

      <FormDialog open={creating} onOpenChange={onCreatingChange} title="Nuovo corso">
        {creating && <CourseForm course={null} onDone={() => onCreatingChange(false)} />}
      </FormDialog>
      <FormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} title="Modifica corso">
        {editing && <CourseForm course={editing} onDone={() => setEditing(null)} />}
      </FormDialog>
    </>
  );
}

/** Un corso con gruppi e studenti; `course: null` raccoglie ciò che non appartiene a nessun corso. */
function CourseCard({
  course,
  groups,
  students,
  loading,
  onEdit,
}: {
  course: WithId<Course> | null;
  groups: WithId<StudentGroup>[];
  students: WithId<Student>[];
  loading: boolean;
  onEdit?: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [addingGroup, setAddingGroup] = useState(false);
  const [managing, setManaging] = useState(false);
  const name = course?.name ?? "Senza corso";
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section className="card-surface">
      <header className="flex items-center gap-1 pr-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left"
        >
          <span
            className={cn(
              "flex size-10 shrink-0 items-center justify-center rounded-full",
              course ? "bg-indigo-soft text-brand-ink" : "bg-neutral-soft text-neutral",
            )}
          >
            <GraduationCap className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-lg font-semibold">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {loading
                ? "Caricamento…"
                : [plural(groups.length, "gruppo", "gruppi"), plural(students.length, "studente", "studenti"), course?.description]
                    .filter(Boolean)
                    .join(" · ")}
            </span>
          </span>
          {course && !course.active && <Pill tone="neutral">Non attivo</Pill>}
          <Chevron className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
        {onEdit && (
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label={`Modifica ${name}`}>
            <Pencil className="size-4" aria-hidden />
          </Button>
        )}
      </header>

      {open && (
        <div className="space-y-5 border-t border-border px-4 py-4">
          {!course && (
            <p className="text-sm text-muted-foreground">
              Gruppi e studenti non ancora collegati a un corso. Apri un gruppo per scegliere il corso; iscrivi gli
              studenti da «Gestisci» nel corso.
            </p>
          )}
          <div className="space-y-2">
            <div className="flex min-h-9 items-center justify-between gap-2">
              <h3 className="section-label">Gruppi</h3>
              {course && (
                <Button variant="ghost" size="sm" onClick={() => setAddingGroup(true)}>
                  <Plus aria-hidden /> Nuovo gruppo
                </Button>
              )}
            </div>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessun gruppo.</p>
            ) : (
              <GroupList groups={groups} />
            )}
          </div>

          <div className="space-y-2">
            <div className="flex min-h-9 items-center justify-between gap-2">
              <h3 className="section-label">Studenti</h3>
              {course && (
                <Button variant="ghost" size="sm" onClick={() => setManaging(true)}>
                  <UserCog aria-hidden /> Gestisci
                </Button>
              )}
            </div>
            {students.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nessuno studente{course ? " iscritto" : ""}.</p>
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {students.map((s) => {
                  const inGroups = groups.filter((g) => s.groupIds?.includes(g.id)).map((g) => g.name);
                  return (
                    <li key={s.id}>
                      <Link
                        href={`/admin/organization/users/${s.id}`}
                        className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50"
                      >
                        <UserAvatar person={s} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{fullName(s)}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {inGroups.length ? inGroups.join(" · ") : s.email}
                          </span>
                        </span>
                        <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {course && (
        <>
          <FormDialog open={addingGroup} onOpenChange={setAddingGroup} title="Nuovo gruppo" description={course.name}>
            {addingGroup && <GroupForm group={null} courseId={course.id} onDone={() => setAddingGroup(false)} />}
          </FormDialog>
          <FormDialog open={managing} onOpenChange={setManaging} title="Studenti del corso" description={course.name}>
            {managing && (
              <CourseStudentsForm
                course={course}
                enrolled={students.map((s) => s.id)}
                groupIds={groups.map((g) => g.id)}
                onDone={() => setManaging(false)}
              />
            )}
          </FormDialog>
        </>
      )}
    </section>
  );
}

function CourseStudentsForm({
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

const courseSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(100),
  description: z.string().max(500).optional(),
  active: z.boolean(),
  teacherIds: z.array(z.string()),
});
type CourseValues = z.infer<typeof courseSchema>;

function CourseForm({ course, onDone }: { course: WithId<Course> | null; onDone: () => void }) {
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
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}
