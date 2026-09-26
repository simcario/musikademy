"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { toneClass } from "@/components/shared/status-badge";
import { useAttendanceMap, useLessonsInRange } from "@/features/admin/hooks";
import { LessonFormDialog } from "@/features/lessons/lesson-form";
import { qk } from "@/hooks/query-keys";
import { cn } from "@/lib/utils";
import { attendanceService } from "@/services/attendanceService";
import { ATTENDANCE_STATUSES, type Attendance, type AttendanceStatus, type Lesson, type WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { formatWeekday, fromInputDate, toInputDate } from "@/utils/format";
import { ATTENDANCE_META } from "@/utils/status";

export default function AttendanceRegisterPage() {
  return (
    <Suspense>
      <Register />
    </Suspense>
  );
}

function Register() {
  const params = useSearchParams();
  const router = useRouter();
  const dateParam = params.get("date");
  const day = dateParam ? fromInputDate(dateParam) : new Date();
  day.setHours(0, 0, 0, 0);
  const [newLesson, setNewLesson] = useState(false);

  const lessons = useLessonsInRange(day, 1);
  const ids = (lessons.data ?? []).map((l) => l.id);
  const attendance = useAttendanceMap(ids);

  const go = (delta: number) => {
    const d = new Date(day);
    d.setDate(d.getDate() + delta);
    router.replace(`/admin/attendance?date=${toInputDate(d)}`);
  };

  const done = ids.filter((id) => attendance.data?.has(id)).length;

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Registro presenze"
        description={ids.length ? `${done} di ${ids.length} registrate` : undefined}
        actions={
          <Button variant="outline" onClick={() => setNewLesson(true)}>
            <CalendarPlus aria-hidden /> Lezione
          </Button>
        }
      />

      <div className="card-surface flex items-center gap-2 p-2">
        <Button variant="ghost" size="icon" onClick={() => go(-1)} aria-label="Giorno precedente">
          <ChevronLeft className="size-5" aria-hidden />
        </Button>
        <div className="flex min-w-0 flex-1 flex-col items-center">
          <p className="truncate font-semibold">{formatWeekday(day)}</p>
          <label className="sr-only" htmlFor="att-date">
            Scegli data
          </label>
          <Input
            id="att-date"
            type="date"
            value={toInputDate(day)}
            onChange={(e) => e.target.value && router.replace(`/admin/attendance?date=${e.target.value}`)}
            className="h-8 w-40 border-0 bg-transparent text-center text-xs text-muted-foreground"
          />
        </div>
        <Button variant="ghost" size="icon" onClick={() => go(1)} aria-label="Giorno successivo">
          <ChevronRight className="size-5" aria-hidden />
        </Button>
      </div>

      {lessons.isPending ? (
        <ListSkeleton rows={4} />
      ) : lessons.isError ? (
        <ErrorState error={lessons.error} onRetry={() => lessons.refetch()} />
      ) : !lessons.data?.length ? (
        <EmptyState
          icon={ClipboardCheck}
          title="Nessuna lezione in questa data"
          action={
            <Button onClick={() => setNewLesson(true)}>
              <CalendarPlus aria-hidden /> Crea lezione
            </Button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {lessons.data.map((l) => (
            <AttendanceRow key={l.id} lesson={l} current={attendance.data?.get(l.id)} lessonIds={ids} />
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-muted-foreground">
        {ATTENDANCE_STATUSES.map((s) => `${ATTENDANCE_META[s].glyph} ${ATTENDANCE_META[s].label}`).join(" · ")}
      </p>

      <LessonFormDialog open={newLesson} onOpenChange={setNewLesson} defaults={{ date: day }} />
    </PageContainer>
  );
}

function AttendanceRow({
  lesson,
  current,
  lessonIds,
}: {
  lesson: WithId<Lesson>;
  current?: WithId<Attendance>;
  lessonIds: string[];
}) {
  const qc = useQueryClient();
  const key = qk.attendance({ lessons: lessonIds });
  const record = useMutation({
    mutationFn: (status: AttendanceStatus) => attendanceService.record(lesson, status),
    // Ottimistico: il tap ha effetto immediato, rollback se la scrittura fallisce.
    onMutate: async (status) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Map<string, WithId<Attendance>>>(key);
      const next = new Map(prev ?? []);
      next.set(lesson.id, { ...(current ?? ({} as WithId<Attendance>)), id: lesson.id, lessonId: lesson.id, studentId: lesson.studentId, status });
      qc.setQueryData(key, next);
      return { prev };
    },
    onError: (e, _s, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(errorMessage(e));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["attendance"] });
      qc.invalidateQueries({ queryKey: ["lessons"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });

  return (
    <li className="card-surface space-y-3 p-3">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <p className="truncate font-semibold">{lesson.studentName}</p>
        <p className="shrink-0 text-xs text-muted-foreground">
          {lesson.startTime ?? "—"} · {lesson.title}
        </p>
      </div>
      <div role="radiogroup" aria-label={`Presenza di ${lesson.studentName}`} className="grid grid-cols-5 gap-1.5">
        {ATTENDANCE_STATUSES.map((s) => {
          const m = ATTENDANCE_META[s];
          const active = current?.status === s;
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={m.label}
              title={m.label}
              onClick={() => !active && record.mutate(s)}
              className={cn(
                "flex min-h-12 flex-col items-center justify-center rounded-full border text-sm font-bold transition-all active:scale-95",
                active ? cn(toneClass(m.tone), "border-current") : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              <span aria-hidden>{m.glyph}</span>
              <span className="hidden text-[10px] font-semibold sm:block">{m.short}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}
