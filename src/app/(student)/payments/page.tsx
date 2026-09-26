"use client";

import { CreditCard } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { PaymentBadge } from "@/components/shared/status-badge";
import { useMyPayments } from "@/features/student-area/hooks";
import { formatCurrency, formatDate } from "@/utils/format";
import { PAYMENT_METHOD_LABEL, effectivePaymentStatus } from "@/utils/status";

/** Sola lettura: lo studente non può modificare i pagamenti (UI + Security Rules). */
export default function PaymentsPage() {
  const q = useMyPayments();
  const rows = (q.data ?? []).map((p) => ({ ...p, effective: effectivePaymentStatus(p) }));
  const due = rows.filter((p) => p.effective === "pending" || p.effective === "overdue").reduce((s, p) => s + p.amount, 0);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Pagamenti" description="Quote e scadenze. Per qualsiasi dubbio contatta la segreteria." />
      {!q.isPending && !q.isError && rows.length > 0 && (
        <div className="card-surface flex items-center justify-between p-4">
          <span className="text-sm text-muted-foreground">Da saldare</span>
          <span className={`text-2xl font-bold ${due > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(due)}</span>
        </div>
      )}
      {q.isPending ? (
        <ListSkeleton rows={3} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nessun pagamento registrato" />
      ) : (
        <ul className="space-y-3">
          {rows.map((p) => (
            <li key={p.id} className="card-surface space-y-2 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">{p.description}</p>
                  <p className="text-xs text-muted-foreground">Scadenza {formatDate(p.dueDate)}</p>
                </div>
                <p className="text-lg font-bold tabular-nums">{formatCurrency(p.amount)}</p>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <PaymentBadge status={p.effective} />
                {p.effective === "paid" && (
                  <span className="text-xs text-muted-foreground">
                    Pagato il {formatDate(p.paidDate)}
                    {p.method && ` · ${PAYMENT_METHOD_LABEL[p.method]}`}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  );
}
