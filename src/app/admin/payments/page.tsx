"use client";

import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { ErrorState } from "@/components/shared/states";
import { usePaymentTotals } from "@/features/admin/hooks";
import { StaffPaymentList } from "@/features/payments/payment-list";
import { formatCurrency } from "@/utils/format";

export default function AdminPaymentsPage() {
  const totals = usePaymentTotals();
  return (
    <PageContainer className="max-w-5xl">
      <PageHeader title="Pagamenti" description="Quote mensili e versamenti, anche parziali (es. lezione per lezione). Pagamenti online non attivi nella V1." />
      {totals.isError ? (
        <ErrorState error={totals.error} onRetry={() => totals.refetch()} />
      ) : (
        <dl className="grid gap-3 sm:grid-cols-3">
          <Total label="Totale incassato" value={totals.data?.paid} icon={<CheckCircle2 className="size-5 text-success" aria-hidden />} tone="text-success" />
          <Total label="Da incassare" value={totals.data?.pending} icon={<Clock className="size-5 text-warning" aria-hidden />} tone="text-warning" />
          <Total label="Scaduto" value={totals.data?.overdue} icon={<AlertTriangle className="size-5 text-danger" aria-hidden />} tone="text-danger" />
        </dl>
      )}
      <StaffPaymentList />
    </PageContainer>
  );
}

function Total({ label, value, icon, tone }: { label: string; value?: number; icon: React.ReactNode; tone: string }) {
  return (
    <div className="card-surface flex items-center justify-between p-4">
      <div>
        <dt className="text-xs font-semibold text-muted-foreground">{label}</dt>
        <dd className={`text-2xl font-bold tabular-nums ${tone}`}>
          {value === undefined ? <Skeleton className="h-8 w-24" /> : formatCurrency(value)}
        </dd>
      </div>
      {icon}
    </div>
  );
}
