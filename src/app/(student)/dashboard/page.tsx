"use client";

import Link from "next/link";
import { CalendarDays, Check, CheckCircle2, Clock, ListChecks, Megaphone, NotebookText, Timer } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { UserAvatar } from "@/components/shared/brand";
import { SectionHeader, PageContainer } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AssignmentBadge, Pill } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/features/auth/auth-provider";
import { MaterialActions, MaterialIcon, TYPE_META } from "@/features/materials/material-card";
import {
  useMyAnnouncements,
  useMyAssignments,
  useMyAttendance,
  useMyMaterials,
  useNextLesson,
  useSetAssignmentStatus,
} from "@/features/student-area/hooks";
import { useNow } from "@/hooks/use-now";
import { cn } from "@/lib/utils";
import { formatDate, formatWeekday, relativeDay, toDate } from "@/utils/format";
import { summarizeAttendance } from "@/utils/status";

export default function StudentDashboard() {
  const { profile } = useSession();
  return (
    <PageContainer className="space-y-7">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-[28px] leading-9 font-bold tracking-tight">
            Ciao, {profile?.name ?? ""} <span aria-hidden>👋</span>
          </h1>
          <p className="text-sm text-muted-foreground">Ecco cosa ti aspetta oggi.</p>
        </div>
        <UserAvatar person={profile} size="lg" className="md:hidden" />
      </div>

      <div className="grid gap-7 lg:grid-cols-[1.2fr_1fr]">
        <div className="space-y-7">
          <NextLessonHero />
          <TodoAssignments />
        </div>
        <div className="space-y-7">
          <AttendanceSummaryTiles />
          <LatestAnnouncements />
        </div>
      </div>
      <LatestMaterials />
    </PageContainer>
  );
}

function NextLessonHero() {
  const q = useNextLesson();
  if (q.isPending) return <Skeleton className="h-56 w-full rounded-xl" />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const lesson = q.data;
  if (!lesson) {
    return (
      <EmptyState
        icon={CalendarDays}
        title="Nessuna lezione in programma"
        description="Quando il docente fisserà la prossima lezione la troverai qui."
      />
    );
  }
  return (
    <section
      aria-label="Prossima lezione"
      className="hero-gradient relative overflow-hidden rounded-xl p-6 text-white shadow-hero"
    >
      <div aria-hidden className="pointer-events-none absolute -right-8 -bottom-8 size-40 rounded-full bg-violet-soft/20 blur-2xl" />
      <div aria-hidden className="pointer-events-none absolute -top-6 -left-6 size-32 rounded-full bg-white/10 blur-xl" />
      <div className="relative space-y-4">
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold backdrop-blur-md">
            <span className="size-2 rounded-full bg-emerald-400" aria-hidden /> In programma
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">
            <Clock className="size-3.5" aria-hidden /> {relativeDay(lesson.date)}
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-semibold tracking-wider text-white/75 uppercase">Prossima lezione</p>
          <h2 className="text-xl leading-tight font-bold">{lesson.title}</h2>
          <p className="flex items-center gap-2 text-sm text-white/90">
            <CalendarDays className="size-4" aria-hidden />
            {formatWeekday(lesson.date)}
            {lesson.startTime ? ` • ${lesson.startTime}` : ""}
            {lesson.endTime ? `–${lesson.endTime}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-white/10 p-2.5 backdrop-blur-md">
          <span className="flex size-10 items-center justify-center rounded-full bg-white/20 text-sm font-bold">
            {lesson.teacherName?.[0] ?? "M"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold">{lesson.teacherName}</p>
            {lesson.subject && <p className="truncate text-xs text-white/75">{lesson.subject}</p>}
          </div>
        </div>
        <Link
          href={`/lessons/${lesson.id}`}
          className="flex h-11 w-full items-center justify-center gap-1.5 rounded-lg bg-white text-[13px] font-semibold text-brand-ink shadow-sm hover:bg-surface-low"
        >
          <NotebookText className="size-4" aria-hidden /> Dettagli lezione
        </Link>
      </div>
    </section>
  );
}

function AttendanceSummaryTiles() {
  const q = useMyAttendance();
  const s = summarizeAttendance((q.data ?? []).map((a) => a.status));
  return (
    <section className="space-y-3" aria-labelledby="att-title">
      <div className="flex items-center justify-between">
        <h2 id="att-title" className="text-lg font-semibold">
          Riepilogo presenze
        </h2>
        <Link href="/attendance" className="flex min-h-11 items-center text-[13px] font-semibold text-brand-ink hover:underline">
          Dettagli
        </Link>
      </div>
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <Tile label="Totali" value={q.isPending ? "–" : s.total} hint="Lezioni" icon={<NotebookText className="size-4" aria-hidden />} />
          <Tile
            label="Presenze"
            value={q.isPending ? "–" : s.present}
            tone="text-success"
            icon={<CheckCircle2 className="size-4" aria-hidden />}
            extra={
              <>
                <span className="text-[11px] font-bold text-success">{s.rate}%</span>
                <span className="mt-1 block h-1 overflow-hidden rounded-full bg-surface-high">
                  <span className="block h-full rounded-full bg-success" style={{ width: `${s.rate}%` }} />
                </span>
              </>
            }
          />
          <Tile
            label="Assenze"
            value={q.isPending ? "–" : s.absent + s.excused}
            tone="text-warning"
            icon={<ListChecks className="size-4" aria-hidden />}
            hint={s.excused ? `${s.excused} giustificate` : "—"}
          />
        </div>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  hint,
  icon,
  tone,
  extra,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: string;
  extra?: React.ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col gap-1 p-3">
      <div className={cn("flex items-center justify-between text-muted-foreground", tone)}>
        <span className="text-[11px] font-semibold">{label}</span>
        {icon}
      </div>
      <span className="text-2xl font-bold text-foreground">{value}</span>
      {extra ?? <span className={cn("truncate text-xs text-muted-foreground", tone)}>{hint}</span>}
    </div>
  );
}

function TodoAssignments() {
  const q = useMyAssignments();
  const setStatus = useSetAssignmentStatus();
  const open = (q.data ?? []).filter((a) => a.status !== "completed");
  const now = useNow();
  return (
    <section className="space-y-3">
      <SectionHeader title="Attività da completare" count={open.length} href="/exercises" />
      {q.isPending ? (
        <ListSkeleton rows={2} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : open.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Tutto fatto!" description="Non hai esercizi da completare." />
      ) : (
        <ul className="space-y-3">
          {open.slice(0, 3).map((a) => {
            const due = toDate(a.dueDate);
            const urgent = due && due.getTime() - now < 2 * 86_400_000;
            return (
              <li key={a.id} className="card-surface card-interactive space-y-2 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <AssignmentBadge status={a.status} />
                      {urgent && (
                        <Pill tone="danger" dot>
                          Urgente
                        </Pill>
                      )}
                    </div>
                    <Link href="/exercises" className="block pt-1 font-semibold hover:underline">
                      {a.title}
                    </Link>
                    {(a.description || due) && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Timer className="size-4 shrink-0" aria-hidden />
                        <span className="line-clamp-1">
                          {[a.description, due && `Scadenza ${formatDate(due, "d MMM")}`].filter(Boolean).join(" • ")}
                        </span>
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label={`Segna "${a.title}" come completato`}
                    onClick={() => setStatus.mutate({ id: a.id, status: "completed" })}
                    className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-surface-high text-muted-foreground transition-colors hover:bg-success-soft hover:text-success"
                  >
                    <Check className="size-5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function LatestMaterials() {
  const q = useMyMaterials({ sort: "recent" });
  const items = q.data?.pages.flatMap((p) => p.items).slice(0, 8) ?? [];
  return (
    <section className="space-y-3">
      <SectionHeader title="Ultimi materiali assegnati" href="/materials" linkLabel="Tutti i materiali" />
      {q.isPending ? (
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 w-60 shrink-0 rounded-xl" />
          ))}
        </div>
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title="Nessun materiale" description="I materiali assegnati dal docente compariranno qui." />
      ) : (
        <ul className="no-scrollbar -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 xl:grid-cols-4">
          {items.map((m) => (
            <li key={m.id} className="card-surface flex w-64 shrink-0 snap-start flex-col justify-between gap-3 p-4 md:w-auto">
              <div className="flex items-center justify-between">
                <MaterialIcon type={m.type} className="size-10 rounded-lg" />
                <span className="rounded bg-surface-mid px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                  {TYPE_META[m.type].label}
                </span>
              </div>
              <div className="space-y-1">
                <h3 className="line-clamp-1 text-[13px] font-bold">{m.title}</h3>
                <p className="line-clamp-1 text-xs text-muted-foreground">{m.description || formatDate(m.createdAt)}</p>
              </div>
              <MaterialActions material={m} compact />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LatestAnnouncements() {
  const q = useMyAnnouncements(3);
  return (
    <section className="space-y-3">
      <SectionHeader
        title="Ultime comunicazioni"
        href="/announcements"
        linkLabel="Tutte"
        icon={<Megaphone className="size-5 text-muted-foreground" aria-hidden />}
      />
      {q.isPending ? (
        <ListSkeleton rows={1} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data?.length ? (
        <EmptyState icon={Megaphone} title="Nessuna comunicazione" />
      ) : (
        <ul className="space-y-3">
          {q.data.slice(0, 2).map((a) => (
            <li key={a.id} className="card-surface space-y-2 p-4">
              <div className="flex items-center gap-2">
                <Pill tone="secondary">{a.targetType === "all" ? "Scuola" : a.targetType === "course" ? "Corso" : "Per te"}</Pill>
                <span className="text-xs text-muted-foreground">{formatDate(a.publishedAt)}</span>
              </div>
              <h3 className="font-semibold">{a.title}</h3>
              <p className="line-clamp-3 text-sm text-muted-foreground">{a.content}</p>
              <Link href="/announcements" className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}>
                Leggi tutto
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
