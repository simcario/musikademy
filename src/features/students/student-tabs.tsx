"use client";

import { useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ClipboardCheck, EyeOff, Library, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { useStaffMutation, useStudentAttendance } from "@/features/admin/hooks";
import { StaffAssignmentList } from "@/features/exercises/assignment-list";
import { StaffLessonList } from "@/features/lessons/lesson-list";
import { AssignMaterialsDialog } from "@/features/materials/assign-materials-dialog";
import { MaterialRow } from "@/features/materials/material-card";
import { StudentFeeCard } from "@/features/payments/fee-form";
import { StaffPaymentList } from "@/features/payments/payment-list";
import { qk } from "@/hooks/query-keys";
import { assignmentService } from "@/services/assignmentService";
import { lessonService } from "@/services/lessonService";
import { materialService } from "@/services/materialService";
import { paymentService } from "@/services/paymentService";
import { studentService } from "@/services/studentService";
import type { Student, WithId } from "@/types";
import { formatCurrency, formatDate, formatWeekday } from "@/utils/format";
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
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
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
