"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AttendanceBadge, LessonBadge } from "@/components/shared/status-badge";
import { useAttendanceMap, useLessonsInRange } from "@/features/admin/hooks";
import { AttendanceDialog } from "@/features/attendance/attendance-picker";
import { cn } from "@/lib/utils";
import type { Lesson, WithId } from "@/types";
import { formatDate, toDate } from "@/utils/format";
import { LessonFormDialog } from "./lesson-form";

type Mode = "month" | "day";
const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const weekOpts = { weekStartsOn: 1 } as const;

const byTime = (a: WithId<Lesson>, b: WithId<Lesson>) =>
  (a.startTime ?? "").localeCompare(b.startTime ?? "") || toDate(a.date)!.getTime() - toDate(b.date)!.getTime();

/** Calendario lezioni docente: vista mese (griglia) e vista giorno (agenda). */
export function LessonCalendar({ toolbar }: { toolbar?: ReactNode }) {
  const [mode, setMode] = useState<Mode>("month");
  const [cursor, setCursor] = useState(() => new Date());
  const [editing, setEditing] = useState<WithId<Lesson> | null>(null);
  const [creatingOn, setCreatingOn] = useState<Date | null>(null);

  // La vista mese carica l'intera griglia (settimane a cavallo incluse).
  const gridStart = startOfWeek(startOfMonth(cursor), weekOpts);
  const gridEnd = endOfWeek(endOfMonth(cursor), weekOpts);
  const from = mode === "month" ? gridStart : cursor;
  const days = mode === "month" ? Math.round((gridEnd.getTime() - gridStart.getTime()) / 86_400_000) + 1 : 1;
  const q = useLessonsInRange(from, days);

  const byDay = useMemo(() => {
    const m = new Map<string, WithId<Lesson>[]>();
    for (const l of q.data ?? []) {
      const k = toDate(l.date)!.toDateString();
      m.set(k, [...(m.get(k) ?? []), l]);
    }
    m.forEach((v) => v.sort(byTime));
    return m;
  }, [q.data]);

  const move = (step: number) => setCursor((c) => (mode === "month" ? addMonths(c, step) : addDays(c, step)));
  const openDay = (d: Date) => {
    setCursor(d);
    setMode("day");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {toolbar}
        <Segmented
          label="Visualizzazione calendario"
          value={mode}
          onChange={setMode}
          options={[
            { value: "month", label: "Mese" },
            { value: "day", label: "Giorno" },
          ]}
          className="min-w-0 flex-1 sm:w-48 sm:flex-none"
        />
        <Button
          className="ml-auto shrink-0"
          aria-label="Nuova lezione"
          onClick={() => setCreatingOn(mode === "day" ? cursor : new Date())}
        >
          <CalendarPlus aria-hidden /> <span className={toolbar ? "hidden sm:inline" : undefined}>Nuova lezione</span>
        </Button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" aria-label={mode === "month" ? "Mese precedente" : "Giorno precedente"} onClick={() => move(-1)}>
          <ChevronLeft aria-hidden />
        </Button>
        <Button variant="ghost" size="icon" aria-label={mode === "month" ? "Mese successivo" : "Giorno successivo"} onClick={() => move(1)}>
          <ChevronRight aria-hidden />
        </Button>
        <h2 className="flex-1 truncate text-lg font-bold capitalize">
          {formatDate(cursor, mode === "month" ? "MMMM yyyy" : "EEEE d MMMM yyyy")}
        </h2>
        <Button variant="outline" size="sm" onClick={() => setCursor(new Date())}>
          Oggi
        </Button>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : mode === "month" ? (
        <MonthGrid
          start={gridStart}
          days={days}
          month={cursor}
          byDay={byDay}
          loading={q.isPending}
          onOpenDay={openDay}
        />
      ) : q.isPending ? (
        <ListSkeleton rows={3} />
      ) : (
        <DayAgenda
          lessons={byDay.get(cursor.toDateString()) ?? []}
          onOpen={setEditing}
          onCreate={() => setCreatingOn(cursor)}
        />
      )}

      <LessonFormDialog
        open={!!creatingOn}
        onOpenChange={(o) => !o && setCreatingOn(null)}
        defaults={creatingOn ? { date: creatingOn } : undefined}
      />
      <LessonFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} lesson={editing} />
    </div>
  );
}

function MonthGrid({
  start,
  days,
  month,
  byDay,
  loading,
  onOpenDay,
}: {
  start: Date;
  days: number;
  month: Date;
  byDay: Map<string, WithId<Lesson>[]>;
  loading: boolean;
  onOpenDay: (d: Date) => void;
}) {
  const cells = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <div className={cn("card-surface overflow-hidden", loading && "animate-pulse")}>
      <div className="grid grid-cols-7 border-b border-border bg-surface-mid">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const lessons = byDay.get(d.toDateString()) ?? [];
          const active = lessons.filter((l) => l.status !== "cancelled");
          const inMonth = isSameMonth(d, month);
          return (
            <button
              key={d.toISOString()}
              type="button"
              onClick={() => onOpenDay(d)}
              aria-label={`${formatDate(d, "EEEE d MMMM")}: ${active.length} lezioni`}
              className={cn(
                "flex min-h-16 flex-col items-stretch gap-1 border-r border-b border-border p-1 text-left transition-colors hover:bg-muted sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-surface-mid/50 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center self-center rounded-full text-xs font-semibold sm:self-start",
                  isToday(d) && "bg-primary text-primary-foreground",
                )}
              >
                {formatDate(d, "d")}
              </span>
              {/* Mobile: pallini; da sm in su: orario + studente. */}
              {lessons.length > 0 && (
                <span className="flex flex-wrap justify-center gap-0.5 sm:hidden">
                  {lessons.slice(0, 4).map((l) => (
                    <span
                      key={l.id}
                      className={cn("size-1.5 rounded-full", l.status === "cancelled" ? "bg-muted-foreground/40" : "bg-primary")}
                    />
                  ))}
                </span>
              )}
              <span className="hidden flex-col gap-0.5 sm:flex">
                {lessons.slice(0, 3).map((l) => (
                  <span
                    key={l.id}
                    className={cn(
                      "truncate rounded px-1 text-[11px] leading-5",
                      l.status === "cancelled"
                        ? "text-muted-foreground line-through"
                        : "bg-indigo-soft text-brand-ink",
                    )}
                  >
                    {l.startTime && <span className="font-semibold">{l.startTime} </span>}
                    {l.studentName}
                  </span>
                ))}
                {lessons.length > 3 && (
                  <span className="px-1 text-[11px] text-muted-foreground">+{lessons.length - 3} altre</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DayAgenda({
  lessons,
  onOpen,
  onCreate,
}: {
  lessons: WithId<Lesson>[];
  onOpen: (l: WithId<Lesson>) => void;
  onCreate: () => void;
}) {
  const ids = lessons.map((l) => l.id);
  const att = useAttendanceMap(ids);
  const [attFor, setAttFor] = useState<WithId<Lesson> | null>(null);
  if (lessons.length === 0) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nessuna lezione in questo giorno"
        action={
          <Button variant="outline" onClick={onCreate}>
            <CalendarPlus aria-hidden /> Aggiungi lezione
          </Button>
        }
      />
    );
  }
  return (
    <ul className="card-surface divide-y divide-border">
      {lessons.map((l) => {
        const a = att.data?.get(l.id);
        return (
          <li key={l.id} className="flex items-center pr-2">
            <button
              type="button"
              onClick={() => onOpen(l)}
              className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left hover:bg-muted"
            >
              <div className="w-14 shrink-0 text-center">
                <p className="font-bold">{l.startTime ?? "—"}</p>
                {l.endTime && <p className="text-xs text-muted-foreground">{l.endTime}</p>}
              </div>
              <div className={cn("min-w-0 flex-1 border-l-4 pl-3", l.status === "cancelled" ? "border-muted" : "border-primary")}>
                <p className={cn("truncate font-semibold", l.status === "cancelled" && "line-through")}>{l.studentName}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {l.title} · {l.teacherName}
                </p>
              </div>
              <span className="hidden sm:block">
                {a ? <AttendanceBadge status={a.status} /> : <LessonBadge status={l.status} />}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="size-11 shrink-0 rounded-full"
              aria-label={`Gestisci presenza di ${l.studentName}`}
              title="Presenza"
              onClick={() => setAttFor(l)}
            >
              <ClipboardCheck className={cn("size-5", a && "text-success")} aria-hidden />
            </Button>
          </li>
        );
      })}
      <AttendanceDialog
        lesson={attFor}
        current={attFor ? att.data?.get(attFor.id) : undefined}
        lessonIds={ids}
        onOpenChange={(o) => !o && setAttFor(null)}
      />
    </ul>
  );
}
