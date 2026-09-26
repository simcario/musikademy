"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, NotebookPen, Paperclip } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { Segmented } from "@/components/shared/segmented";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { AttendanceBadge, LessonBadge } from "@/components/shared/status-badge";
import { useMyAttendanceFor, useMyLessons } from "@/features/student-area/hooks";
import type { Attendance, Lesson, LessonStatus, WithId } from "@/types";
import { formatDate } from "@/utils/format";

type Tab = "scheduled" | "completed" | "all";

export default function MyLessonsPage() {
  const [tab, setTab] = useState<Tab>("scheduled");
  const q = useMyLessons(tab === "all" ? undefined : (tab as LessonStatus));
  const lessons = q.data?.pages.flatMap((p) => p.items) ?? [];
  const att = useMyAttendanceFor(lessons.map((l) => l.id));

  return (
    <PageContainer>
      <PageHeader eyebrow="La tua voce, il tuo percorso" title="Le mie lezioni" />
      <Segmented
        label="Filtra lezioni"
        value={tab}
        onChange={setTab}
        options={[
          { value: "scheduled", label: "In programma" },
          { value: "completed", label: "Concluse" },
          { value: "all", label: "Tutte" },
        ]}
      />
      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lessons.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={tab === "scheduled" ? "Nessuna lezione in programma" : "Nessuna lezione"}
          description="Le lezioni fissate dal docente appariranno qui."
        />
      ) : (
        <ul className="space-y-3">
          {lessons.map((l, i) => (
            <li key={l.id}>
              <LessonCard lesson={l} attendance={att.data?.get(l.id)} highlight={tab === "scheduled" && i === 0} />
            </li>
          ))}
        </ul>
      )}
      <LoadMore
        hasMore={!!q.hasNextPage}
        loading={q.isFetchingNextPage}
        onClick={() => q.fetchNextPage()}
        label="Carica lezioni precedenti"
      />
    </PageContainer>
  );
}

function LessonCard({
  lesson,
  attendance,
  highlight,
}: {
  lesson: WithId<Lesson>;
  attendance?: WithId<Attendance>;
  highlight?: boolean;
}) {
  const materials = lesson.materialIds?.length ?? 0;
  return (
    <Link
      href={`/lessons/${lesson.id}`}
      className={
        "card-surface card-interactive block space-y-3 p-4 " + (highlight ? "border-l-4 border-l-primary shadow-card-hover" : "")
      }
    >
      {highlight && <p className="section-label text-brand-ink">Prossimo appuntamento</p>}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="size-3.5" aria-hidden />
            {formatDate(lesson.date, "d MMMM yyyy")}
            {lesson.startTime && ` • ${lesson.startTime}`}
          </p>
          <h2 className="text-lg leading-snug font-semibold">{lesson.title}</h2>
          <p className="text-sm text-muted-foreground">Docente: {lesson.teacherName}</p>
        </div>
        {attendance ? <AttendanceBadge status={attendance.status} /> : <LessonBadge status={lesson.status} />}
      </div>
      {lesson.notes && (
        <div className="rounded-lg bg-surface-low p-3">
          <p className="section-label flex items-center gap-1.5 text-brand-ink">
            <NotebookPen className="size-3.5" aria-hidden /> Note del docente
          </p>
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground italic">“{lesson.notes}”</p>
        </div>
      )}
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1 rounded-full bg-surface-mid px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          <Paperclip className="size-3" aria-hidden />
          {materials ? `${materials} material${materials === 1 ? "e" : "i"}` : "Nessun allegato"}
        </span>
        <ChevronRight className="size-5 text-muted-foreground" aria-hidden />
      </div>
    </Link>
  );
}
