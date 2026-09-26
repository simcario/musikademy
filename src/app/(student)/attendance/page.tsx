"use client";

import { ClipboardCheck } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { AttendanceBadge } from "@/components/shared/status-badge";
import { useMyAttendance } from "@/features/student-area/hooks";
import { formatDate } from "@/utils/format";
import { summarizeAttendance } from "@/utils/status";

export default function AttendancePage() {
  const q = useMyAttendance();
  const s = summarizeAttendance((q.data ?? []).map((a) => a.status));
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Presenze" description="Il riepilogo della tua frequenza." />
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Lezioni" value={s.total} />
        <Stat label="Presenze" value={s.present} tone="text-success" />
        <Stat label="Assenze" value={s.absent + s.excused} tone="text-warning" />
        <Stat label="Frequenza" value={`${s.rate}%`} tone="text-brand-ink" />
      </dl>
      <div className="h-2 overflow-hidden rounded-full bg-surface-high" aria-hidden>
        <div className="h-full rounded-full bg-success transition-all" style={{ width: `${s.rate}%` }} />
      </div>
      <section className="space-y-3">
        <h2 className="section-label">Cronologia</h2>
        {q.isPending ? (
          <ListSkeleton rows={4} />
        ) : q.isError ? (
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        ) : !q.data?.length ? (
          <EmptyState icon={ClipboardCheck} title="Nessuna presenza registrata" />
        ) : (
          <ul className="card-surface divide-y divide-border">
            {q.data.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold capitalize">{formatDate(a.lessonDate, "EEEE d MMMM yyyy")}</p>
                  {a.notes && <p className="text-xs text-muted-foreground">{a.notes}</p>}
                </div>
                <AttendanceBadge status={a.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PageContainer>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className="card-surface p-4">
      <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
      <dd className={`text-2xl font-bold ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
