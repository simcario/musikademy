"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarPlus,
  ClipboardCheck,
  CreditCard,
  FilePlus2,
  UserPlus,
  Users,
} from "lucide-react";
import { PageContainer, PageHeader, SectionHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AttendanceBadge, LessonBadge } from "@/components/shared/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAttendanceMap, useDashboardStats, useLessonsInRange } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { LessonFormDialog } from "@/features/lessons/lesson-form";
import { MaterialFormDialog } from "@/features/materials/material-form";
import { PaymentFormDialog } from "@/features/payments/payment-form";
import { StudentFormDialog } from "@/features/students/student-form";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/utils/format";

type Dialog = "student" | "lesson" | "material" | "payment" | null;

export default function AdminDashboard() {
  const { profile } = useSession();
  const [dialog, setDialog] = useState<Dialog>(null);
  const stats = useDashboardStats();

  return (
    <PageContainer className="max-w-6xl">
      <PageHeader
        eyebrow={formatDate(new Date(), "EEEE d MMMM")}
        title={`Buongiorno, ${profile?.name ?? ""}`}
        description="Ecco cosa c'è da gestire oggi."
      />

      <section aria-label="Azioni rapide" className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
        <QuickAction icon={UserPlus} label="Nuovo studente" onClick={() => setDialog("student")} />
        <QuickAction icon={CalendarPlus} label="Nuova lezione" onClick={() => setDialog("lesson")} />
        <QuickAction icon={FilePlus2} label="Nuovo materiale" onClick={() => setDialog("material")} />
        <QuickAction icon={CreditCard} label="Registra pagamento" onClick={() => setDialog("payment")} />
        <QuickAction icon={ClipboardCheck} label="Registra presenza" href="/admin/attendance" />
      </section>

      <section aria-label="Indicatori" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Studenti attivi" value={stats.students.data?.length} loading={stats.students.isPending} icon={Users} href="/admin/students" />
        <Stat
          label="Lezioni oggi"
          value={stats.today.data}
          loading={stats.today.isPending}
          sub={stats.week.data !== undefined ? `${stats.week.data} questa settimana` : undefined}
          icon={CalendarDays}
          href="/admin/attendance"
        />
        <Stat
          label="Presenze"
          value={stats.attendance.data === null ? "—" : stats.attendance.data !== undefined ? `${stats.attendance.data}%` : undefined}
          loading={stats.attendance.isPending}
          sub="Percentuale complessiva"
          icon={ClipboardCheck}
          tone="text-success"
        />
        <Stat
          label="Incassato"
          value={stats.payments.data ? formatCurrency(stats.payments.data.paid) : undefined}
          loading={stats.payments.isPending}
          sub={
            stats.payments.data
              ? `${formatCurrency(stats.payments.data.pending)} da incassare · ${formatCurrency(stats.payments.data.overdue)} scaduti`
              : undefined
          }
          icon={CreditCard}
          href="/admin/payments"
          alert={!!stats.payments.data?.overdue}
        />
      </section>

      <UpcomingLessons />

      <StudentFormDialog open={dialog === "student"} onOpenChange={(o) => !o && setDialog(null)} />
      <LessonFormDialog open={dialog === "lesson"} onOpenChange={(o) => !o && setDialog(null)} />
      <MaterialFormDialog open={dialog === "material"} onOpenChange={(o) => !o && setDialog(null)} />
      <PaymentFormDialog open={dialog === "payment"} onOpenChange={(o) => !o && setDialog(null)} />
    </PageContainer>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
  href,
}: {
  icon: typeof Users;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  const cls =
    "flex h-11 shrink-0 items-center gap-2 rounded-full border border-border bg-card px-4 text-[13px] font-semibold text-brand-ink shadow-card transition-colors hover:border-primary hover:bg-indigo-soft";
  const content = (
    <>
      <Icon className="size-4" aria-hidden /> {label}
    </>
  );
  return href ? (
    <Link href={href} className={cls}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

function Stat({
  label,
  value,
  sub,
  loading,
  icon: Icon,
  href,
  tone,
  alert,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  loading: boolean;
  icon: typeof Users;
  href?: string;
  tone?: string;
  alert?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-semibold">{label}</span>
        <Icon className={cn("size-5", tone ?? "text-brand-ink")} aria-hidden />
      </div>
      {loading ? <Skeleton className="h-8 w-16" /> : <p className="text-2xl font-bold md:text-3xl">{value ?? "—"}</p>}
      {sub && <p className={cn("text-xs text-muted-foreground", alert && "font-semibold text-danger")}>{sub}</p>}
    </>
  );
  const cls = "card-surface flex flex-col gap-1.5 p-4";
  return href ? (
    <Link href={href} className={cn(cls, "card-interactive")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function UpcomingLessons() {
  const q = useLessonsInRange(new Date(), 7);
  const lessons = (q.data ?? []).filter((l) => l.status !== "cancelled");
  const att = useAttendanceMap(lessons.map((l) => l.id));
  return (
    <section className="space-y-3">
      <SectionHeader title="Prossime lezioni" href="/admin/lessons" linkLabel="Tutte le lezioni" />
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : lessons.length === 0 ? (
        <EmptyState icon={CalendarDays} title="Nessuna lezione nei prossimi 7 giorni" />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {lessons.map((l) => {
            const a = att.data?.get(l.id);
            return (
              <li key={l.id}>
                <Link
                  href={`/admin/attendance?date=${formatDate(l.date, "yyyy-MM-dd")}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50"
                >
                  <div className="w-14 shrink-0 text-center">
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase">{formatDate(l.date, "EEE")}</p>
                    <p className="text-lg leading-none font-bold">{formatDate(l.date, "d")}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{l.studentName}</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {l.startTime ?? "—"} · {l.title}
                    </p>
                  </div>
                  {a ? <AttendanceBadge status={a.status} /> : <LessonBadge status={l.status} />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
