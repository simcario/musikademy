"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ban, CircleAlert, CircleCheck, CircleX, ClipboardPen, RotateCcw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { SidePanel } from "@/components/shared/dialogs";
import { toneClass } from "@/components/shared/status-badge";
import { qk } from "@/hooks/query-keys";
import { cn } from "@/lib/utils";
import { attendanceService } from "@/services/attendanceService";
import { ATTENDANCE_STATUSES, type Attendance, type AttendanceStatus, type Lesson, type WithId } from "@/types";
import { errorMessage } from "@/utils/errors";
import { formatDate } from "@/utils/format";
import { ATTENDANCE_META } from "@/utils/status";

interface PickerProps {
  lesson: WithId<Lesson>;
  current?: WithId<Attendance>;
  /** Id lezioni della query `useAttendanceMap` da aggiornare in modo ottimistico. */
  lessonIds: string[];
}

const STATUS_ICON: Record<AttendanceStatus, LucideIcon> = {
  present: CircleCheck,
  absent: CircleX,
  excused: CircleAlert,
  makeup: RotateCcw,
  cancelled: Ban,
};

/**
 * Pulsante della presenza nelle righe delle lezioni: apre la registrazione. L'icona dice lo stato a colpo
 * d'occhio — da registrare (blocco con penna, neutro) oppure il simbolo dello stato registrato, su fondo colorato.
 */
export function AttendanceButton({
  studentName,
  status,
  onClick,
}: {
  studentName: string;
  status?: AttendanceStatus;
  onClick: () => void;
}) {
  const meta = status ? ATTENDANCE_META[status] : null;
  const Icon = status ? STATUS_ICON[status] : ClipboardPen;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Presenza di ${studentName}: ${meta ? meta.label.toLowerCase() : "da registrare"}`}
      title={meta ? `Presenza: ${meta.label}` : "Registra presenza"}
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full transition-colors",
        meta ? cn(toneClass(meta.tone), "hover:brightness-95") : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className={meta ? "size-6" : "size-5"} aria-hidden />
    </button>
  );
}

/** Selettore rapido della presenza di una lezione (pagina lezioni e dashboard). */
export function AttendancePicker({ lesson, current, lessonIds }: PickerProps) {
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
  );
}

/** Dialog per registrare la presenza di una singola lezione. */
export function AttendanceDialog({
  lesson,
  current,
  lessonIds,
  onOpenChange,
}: Omit<PickerProps, "lesson"> & { lesson: WithId<Lesson> | null; onOpenChange: (open: boolean) => void }) {
  return (
    <SidePanel
      open={!!lesson}
      onOpenChange={onOpenChange}
      title="Presenza"
      description={
        lesson ? `${lesson.studentName} · ${formatDate(lesson.date, "EEEE d MMMM")} · ${lesson.startTime ?? "—"}` : undefined
      }
    >
      {lesson && (
        <div className="space-y-3">
          <AttendancePicker lesson={lesson} current={current} lessonIds={lessonIds} />
          <p className="text-center text-xs text-muted-foreground">
            {ATTENDANCE_STATUSES.map((s) => `${ATTENDANCE_META[s].glyph} ${ATTENDANCE_META[s].label}`).join(" · ")}
          </p>
        </div>
      )}
    </SidePanel>
  );
}
