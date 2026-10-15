"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, EyeOff, GraduationCap, Library, Loader2, Plus, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckList } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { AttendanceBadge, Pill } from "@/components/shared/status-badge";
import { useGroups, useStaffMutation, useStudentAttendance } from "@/features/admin/hooks";
import { StaffAssignmentList } from "@/features/exercises/assignment-list";
import { StaffLessonList } from "@/features/lessons/lesson-list";
import { AssignMaterialsDialog } from "@/features/materials/assign-materials-dialog";
import { MaterialRow } from "@/features/materials/material-card";
import { StudentFeeCard } from "@/features/payments/fee-form";
import { StaffPaymentList } from "@/features/payments/payment-list";
import { useCourses } from "@/features/student-area/hooks";
import { qk } from "@/hooks/query-keys";
import { assignmentService } from "@/services/assignmentService";
import { groupService } from "@/services/groupService";
import { lessonService } from "@/services/lessonService";
import { materialService } from "@/services/materialService";
import { paymentService } from "@/services/paymentService";
import { studentService } from "@/services/studentService";
import { toCourseMap } from "@/services/userService";
import { EXERCISE_CATEGORY, MAX_GROUPS_PER_STUDENT, type Attendance, type Lesson, type Student, type WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { formatCurrency, formatDate, formatWeekday, toDate } from "@/utils/format";
import { remainingOf, summarizeAttendance } from "@/utils/status";

export function StudentOverviewTab({ studentId }: { studentId: string }) {
  const att = useStudentAttendance(studentId);
  const next = useQuery({ queryKey: qk.lessons({ next: studentId }), queryFn: () => lessonService.nextForStudent(studentId) });
  const assignments = useQuery({
    queryKey: qk.assignments({ mine: studentId }),
    queryFn: () => assignmentService.listForStudent(studentId),
  });
  const payments = useQuery({ queryKey: qk.payments({ mine: studentId }), queryFn: () => paymentService.listForStudent(studentId) });

  const s = summarizeAttendance((att.data ?? []).map((a) => a.status));
  const open = (assignments.data ?? []).filter((a) => a.status !== "completed").length;
  const due = (payments.data ?? []).reduce((sum, p) => sum + remainingOf(p), 0);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Card label="Prossima lezione" loading={next.isPending}>
        {next.data ? (
          <>
            <p className="font-bold">{formatWeekday(next.data.date)}</p>
            <p className="text-xs text-muted-foreground">
              {next.data.startTime ?? ""} {next.data.title}
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Nessuna in programma</p>
        )}
      </Card>
      <Card label="Frequenza" loading={att.isPending}>
        <p className="text-2xl font-bold text-success">{s.rate}%</p>
        <p className="text-xs text-muted-foreground">
          {s.present} presenze su {s.total} lezioni
        </p>
      </Card>
      <Card label="Esercizi aperti" loading={assignments.isPending}>
        <p className="text-2xl font-bold">{open}</p>
        <p className="text-xs text-muted-foreground">{assignments.data?.length ?? 0} assegnati in totale</p>
      </Card>
      <Card label="Da saldare" loading={payments.isPending}>
        <p className={`text-2xl font-bold ${due > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(due)}</p>
      </Card>
    </div>
  );
}

function Card({ label, loading, children }: { label: string; loading: boolean; children: React.ReactNode }) {
  return (
    <div className="card-surface space-y-1 p-4">
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      {loading ? <Loader2 className="size-5 animate-spin text-primary" aria-label="Caricamento" /> : children}
    </div>
  );
}

/** Corsi frequentati dallo studente: gruppi, lezioni e presenze di ciascun corso. */
export function StudentCoursesTab({ student, onEdit }: { student: WithId<Student>; onEdit: () => void }) {
  const courses = toCourseMap(useCourses().data);
  const groups = useGroups();
  const att = useStudentAttendance(student.id);
  const lessons = useQuery({ queryKey: qk.lessons({ all: student.id }), queryFn: () => lessonService.listForStudent(student.id) });

  if (lessons.isError) return <ErrorState error={lessons.error} onRetry={() => lessons.refetch()} />;
  if (att.isError) return <ErrorState error={att.error} onRetry={() => att.refetch()} />;

  const all = lessons.data ?? [];
  const other = all.filter((l) => !l.courseId || !student.courseIds.includes(l.courseId));
  if (student.courseIds.length === 0 && other.length === 0) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Non frequenta nessun corso"
        action={
          <Button onClick={onEdit}>
            <Plus aria-hidden /> Iscrivi a un corso
          </Button>
        }
      />
    );
  }
  const loading = lessons.isPending || att.isPending;
  const myGroups = (groups.data ?? []).filter((g) => student.groupIds?.includes(g.id));

  return (
    <div className="space-y-3">
      {student.courseIds.map((id) => (
        <CourseDetail
          key={id}
          title={courses.get(id)?.name ?? "—"}
          description={courses.get(id)?.description}
          groups={myGroups.filter((g) => g.courseId === id).map((g) => g.name)}
          lessons={all.filter((l) => l.courseId === id)}
          attendance={att.data ?? []}
          loading={loading}
        />
      ))}
      {other.length > 0 && (
        <CourseDetail
          title="Lezioni senza corso"
          description="Lezioni non collegate a un corso frequentato."
          groups={[]}
          lessons={other}
          attendance={att.data ?? []}
          loading={loading}
        />
      )}
    </div>
  );
}

/**
 * Gruppi dello studente (ADR D26): quelli dei suoi corsi e quelli senza corso, come nel form del gruppo.
 * I gruppi di altri corsi compaiono solo se ne fa già parte, per poterlo togliere.
 */
export function StudentGroupsTab({ student }: { student: WithId<Student> }) {
  const courses = toCourseMap(useCourses().data);
  const groups = useGroups();
  const current = student.groupIds ?? [];
  // `null` finché il docente non tocca le spunte: dopo il salvataggio torna ai dati dello studente.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? current;
  const changed = selected.length !== current.length || selected.some((id) => !current.includes(id));

  const save = useStaffMutation(
    async () => {
      if (selected.length > MAX_GROUPS_PER_STUDENT) throw new AppError(`Al massimo ${MAX_GROUPS_PER_STUDENT} gruppi per studente.`);
      await groupService.setForStudent(student.id, selected);
    },
    { success: "Gruppi aggiornati", invalidate: [["students"]], onSuccess: () => setPicked(null) },
  );

  if (groups.isPending) return <ListSkeleton rows={3} />;
  if (groups.isError) return <ErrorState error={groups.error} onRetry={() => groups.refetch()} />;

  const visible = groups.data.filter((g) => !g.courseId || student.courseIds.includes(g.courseId) || current.includes(g.id));
  if (visible.length === 0) {
    return (
      <EmptyState
        icon={UsersRound}
        title="Nessun gruppo disponibile"
        description="Crea i gruppi dalla scheda del corso, in Organizzazione: qui compaiono quelli dei corsi frequentati e quelli senza corso."
      />
    );
  }
  // Prima i corsi frequentati, nell'ordine dello studente; poi i gruppi senza corso; infine gli altri corsi.
  const order = [...student.courseIds, "", ...new Set(visible.map((g) => g.courseId ?? "").filter((c) => c && !student.courseIds.includes(c)))];
  const sections = order
    .map((courseId) => ({
      courseId,
      label: courseId ? (courses.get(courseId)?.name ?? "Corso non disponibile") : "Senza corso",
      groups: visible.filter((g) => (g.courseId ?? "") === courseId),
    }))
    .filter((s) => s.groups.length > 0);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <p className="text-sm text-muted-foreground">
        Lo studente vede i materiali, le cartelle e le parti dei brani assegnati ai suoi gruppi. Fa parte di{" "}
        {selected.length === 1 ? "1 gruppo" : `${selected.length} gruppi`}.
      </p>
      {sections.map((s) => (
        <CheckList
          key={s.courseId || "none"}
          label={s.label}
          items={s.groups.map((g) => ({ id: g.id, label: g.name, sub: g.description || undefined }))}
          selected={selected.filter((id) => s.groups.some((g) => g.id === id))}
          onChange={(ids) => setPicked([...selected.filter((id) => !s.groups.some((g) => g.id === id)), ...ids])}
          maxHeight="max-h-72"
        />
      ))}
      <div className="flex gap-2">
        <Button type="submit" disabled={save.isPending || !changed}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Salva gruppi
        </Button>
        {changed && (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => setPicked(null)}>
            Annulla modifiche
          </Button>
        )}
      </div>
    </form>
  );
}

function CourseDetail({
  title,
  description,
  groups,
  lessons,
  attendance,
  loading,
}: {
  title: string;
  description?: string;
  groups: string[];
  /** Lezioni del corso, dalla più recente. */
  lessons: WithId<Lesson>[];
  attendance: WithId<Attendance>[];
  loading: boolean;
}) {
  const ids = new Set(lessons.map((l) => l.id));
  const rows = attendance.filter((a) => ids.has(a.lessonId));
  const s = summarizeAttendance(rows.map((a) => a.status));
  const now = new Date();
  const next = lessons.findLast((l) => l.status === "scheduled" && (toDate(l.date) ?? now) >= now);
  const held = lessons.filter((l) => l.status === "completed").length;

  return (
    <section className="card-surface space-y-3 p-4">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groups.map((g) => (
              <Pill key={g} tone="secondary">
                {g}
              </Pill>
            ))}
          </div>
        )}
      </div>
      {loading ? (
        <Loader2 className="size-5 animate-spin text-primary" aria-label="Caricamento" />
      ) : (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Frequenza" value={s.total ? `${s.rate}%` : "—"} sub={`${s.present} presenze su ${s.total}`} />
            <Stat label="Assenze" value={s.absent} sub={`${s.excused} giustificate · ${s.makeup} recuperi`} />
            <Stat label="Lezioni svolte" value={held} sub={`${lessons.length} in totale`} />
            <Stat
              label="Prossima lezione"
              value={next ? formatDate(next.date, "d MMM") : "—"}
              sub={next ? [next.startTime, next.title].filter(Boolean).join(" ") : "Nessuna in programma"}
            />
          </dl>
          {rows.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border">
              {rows.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="text-sm font-medium capitalize">{formatDate(a.lessonDate, "EEEE d MMMM yyyy")}</span>
                  <AttendanceBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
          {rows.length > 5 && (
            <p className="text-xs text-muted-foreground">Ultime 5 presenze su {rows.length}: l&apos;elenco completo è nella scheda Presenze.</p>
          )}
        </>
      )}
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold">{value}</dd>
      {sub && <dd className="truncate text-xs text-muted-foreground">{sub}</dd>}
    </div>
  );
}

export function StudentLessonsTab({ studentId }: { studentId: string }) {
  return <StaffLessonList studentId={studentId} showStudent={false} />;
}

export function StudentAttendanceTab({ studentId }: { studentId: string }) {
  const q = useStudentAttendance(studentId);
  if (q.isPending) return <ListSkeleton rows={3} />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data.length) return <EmptyState icon={ClipboardCheck} title="Nessuna presenza registrata" />;
  return (
    <ul className="card-surface divide-y divide-border">
      {q.data.map((a) => (
        <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium capitalize">{formatDate(a.lessonDate, "EEEE d MMMM yyyy")}</span>
          <AttendanceBadge status={a.status} />
        </li>
      ))}
    </ul>
  );
}

export function StudentMaterialsTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [assigning, setAssigning] = useState(false);
  const q = useInfiniteQuery({
    queryKey: qk.materials({ assignedTo: studentId }),
    queryFn: ({ pageParam }) => materialService.pageAssignedTo(studentId, pageParam),
    initialPageParam: null as unknown,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
  // I materiali degli esercizi si gestiscono dalla scheda Esercizi.
  const items = (q.data?.pages.flatMap((p) => p.items) ?? []).filter((m) => m.category !== EXERCISE_CATEGORY);
  const unassign = useStaffMutation((materialId: string) => materialService.unassignFromStudent(materialId, studentId), {
    success: `Materiale nascosto a ${studentName}`,
    invalidate: [["materials"]],
  });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Assegnati personalmente: visibili allo studente. Assegna qui i materiali caricati prima della lezione. Lo
          studente vede anche i materiali del suo corso e quelli per tutti.
        </p>
        <Button onClick={() => setAssigning(true)} className="shrink-0">
          <Plus aria-hidden /> Assegna
        </Button>
      </div>
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Library} title="Nessun materiale assegnato" />
      ) : (
        <div className="space-y-2">
          {items.map((m) => (
            <MaterialRow
              key={m.id}
              material={m}
              action={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Nascondi ${m.title} a ${studentName}`}
                  title="Nascondi allo studente"
                  disabled={unassign.isPending}
                  onClick={() => unassign.mutate(m.id)}
                >
                  <EyeOff aria-hidden />
                </Button>
              }
            />
          ))}
        </div>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <AssignMaterialsDialog open={assigning} onOpenChange={setAssigning} studentId={studentId} studentName={studentName} />
    </div>
  );
}

export function StudentAssignmentsTab({ studentId }: { studentId: string }) {
  return <StaffAssignmentList studentId={studentId} />;
}

export function StudentPaymentsTab({ student }: { student: WithId<Student> }) {
  return (
    <div className="space-y-3">
      <StudentFeeCard student={student} />
      <StaffPaymentList studentId={student.id} />
    </div>
  );
}

export function StudentNotesTab({ studentId, initial, loading }: { studentId: string; initial: string; loading: boolean }) {
  const [value, setValue] = useState<string | null>(null);
  const text = value ?? initial;
  const save = useStaffMutation(() => studentService.setNotes(studentId, text), {
    success: "Note salvate",
    invalidate: [["studentNotes"]],
    onSuccess: () => setValue(null),
  });
  if (loading) return <ListSkeleton rows={1} />;
  return (
    <form
      className="card-surface space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(undefined);
      }}
    >
      <label htmlFor="student-notes" className="text-sm font-semibold">
        Note private
      </label>
      <p className="text-xs text-muted-foreground">Visibili solo ai docenti, mai allo studente.</p>
      <Textarea id="student-notes" rows={8} value={text} onChange={(e) => setValue(e.target.value)} maxLength={5000} />
      <Button type="submit" disabled={save.isPending || value === null}>
        {save.isPending && <Loader2 className="animate-spin" aria-hidden />} Salva note
      </Button>
    </form>
  );
}
