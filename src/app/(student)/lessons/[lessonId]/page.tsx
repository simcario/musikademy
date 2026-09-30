"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, Clock, Headphones, NotebookPen, UserRound } from "lucide-react";
import { Markdown } from "@/components/shared/markdown";
import { PageContainer } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AssignmentBadge, AttendanceBadge, LessonBadge } from "@/components/shared/status-badge";
import { MaterialRow } from "@/features/materials/material-card";
import {
  useLesson,
  useLessonAssignments,
  useMaterialsByIds,
  useMyAttendanceFor,
} from "@/features/student-area/hooks";
import { formatDate } from "@/utils/format";

export default function LessonDetailPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = use(params);
  const lesson = useLesson(lessonId);
  const materials = useMaterialsByIds(lesson.data?.materialIds ?? []);
  const assignments = useLessonAssignments(lessonId);
  const attendance = useMyAttendanceFor([lessonId]);
  const att = attendance.data?.get(lessonId);

  const listening = (materials.data ?? []).filter((m) => m.type === "audio");
  const documents = (materials.data ?? []).filter((m) => m.type !== "audio");

  return (
    <PageContainer className="max-w-3xl">
      <Link href="/lessons" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-ink">
        <ArrowLeft className="size-4" aria-hidden /> Le mie lezioni
      </Link>

      {lesson.isPending ? (
        <ListSkeleton rows={2} />
      ) : lesson.isError ? (
        <ErrorState error={lesson.error} onRetry={() => lesson.refetch()} />
      ) : !lesson.data ? (
        <EmptyState title="Lezione non trovata" />
      ) : (
        <>
          <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {att ? <AttendanceBadge status={att.status} /> : <LessonBadge status={lesson.data.status} />}
              {lesson.data.subject && <span className="text-xs font-medium text-muted-foreground">{lesson.data.subject}</span>}
            </div>
            <h1 className="text-[28px] leading-9 font-bold tracking-tight">{lesson.data.title}</h1>
            <dl className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="size-4 text-brand-ink" aria-hidden />
                <dt className="sr-only">Data</dt>
                <dd>{formatDate(lesson.data.date)}</dd>
              </div>
              {lesson.data.startTime && (
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-brand-ink" aria-hidden />
                  <dt className="sr-only">Orario</dt>
                  <dd>
                    {lesson.data.startTime}
                    {lesson.data.endTime && `–${lesson.data.endTime}`}
                  </dd>
                </div>
              )}
              <div className="flex items-center gap-2">
                <UserRound className="size-4 text-brand-ink" aria-hidden />
                <dt className="sr-only">Docente</dt>
                <dd>{lesson.data.teacherName}</dd>
              </div>
            </dl>
          </header>

          {!!lesson.data.topics?.length && (
            <Section title="Argomenti">
              <ul className="card-surface list-inside list-disc space-y-1 p-4 text-sm marker:text-primary">
                {lesson.data.topics.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </Section>
          )}

          {lesson.data.notes && (
            <Section title="Note del docente">
              <div className="card-surface flex gap-3 p-4">
                <NotebookPen className="size-5 shrink-0 text-brand-ink" aria-hidden />
                <p className="text-sm whitespace-pre-line">{lesson.data.notes}</p>
              </div>
            </Section>
          )}

          {materials.isPending && (lesson.data.materialIds?.length ?? 0) > 0 ? (
            <ListSkeleton rows={1} />
          ) : (
            <>
              {documents.length > 0 && (
                <Section title="Materiali">
                  <div className="space-y-2">
                    {documents.map((m) => (
                      <MaterialRow key={m.id} material={m} />
                    ))}
                  </div>
                </Section>
              )}
              {listening.length > 0 && (
                <Section title="Ascolti">
                  <div className="space-y-2">
                    {listening.map((m) => (
                      <MaterialRow key={m.id} material={m} />
                    ))}
                  </div>
                </Section>
              )}
            </>
          )}

          <Section title="Esercizi">
            {assignments.isPending ? (
              <ListSkeleton rows={1} />
            ) : !assignments.data?.length ? (
              <p className="text-sm text-muted-foreground">Nessun esercizio assegnato per questa lezione.</p>
            ) : (
              <ul className="space-y-2">
                {assignments.data.map((a) => (
                  <li key={a.id} className="card-surface flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{a.title}</p>
                      {a.description && <Markdown className="text-muted-foreground">{a.description}</Markdown>}
                    </div>
                    <AssignmentBadge status={a.status} />
                  </li>
                ))}
              </ul>
            )}
            <Link href="/exercises" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-ink">
              <Headphones className="size-4" aria-hidden /> Vai ai miei esercizi
            </Link>
          </Section>
        </>
      )}
    </PageContainer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="section-label">{title}</h2>
      {children}
    </section>
  );
}
