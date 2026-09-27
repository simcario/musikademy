"use client";

import { CreditCard } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shared/page";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/shared/states";
import { PaymentBadge } from "@/components/shared/status-badge";
import { PaymentProgress } from "@/features/payments/payment-progress";
import { useMyPayments, useMyStudentProfile } from "@/features/student-area/hooks";
import { cycleLabel, cycleStartAt } from "@/utils/cycles";
import { formatCurrency, formatDate } from "@/utils/format";
import { PAYMENT_METHOD_LABEL, effectivePaymentStatus, paidAmountOf, remainingOf } from "@/utils/status";

/** Sola lettura: lo studente non può modificare i pagamenti (UI + Security Rules). */
export default function PaymentsPage() {
  const q = useMyPayments();
  const fee = useMyStudentProfile().data?.fee;
  const rows = (q.data ?? []).map((p) => ({ ...p, effective: effectivePaymentStatus(p) }));
  const due = rows.reduce((s, p) => s + remainingOf(p), 0);

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Pagamenti" description="Quote e versamenti. Per qualsiasi dubbio contatta la segreteria." />
      {!q.isPending && !q.isError && (rows.length > 0 || fee) && (
        <div className="card-surface grid gap-3 p-4 sm:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Da saldare</p>
            <p className={`text-2xl font-bold tabular-nums ${due > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(due)}</p>
          </div>
          {fee && (
            <div>
              <p className="text-sm text-muted-foreground">Costo del corso</p>
              <p className="text-lg font-bold tabular-nums">{formatCurrency(fee.cycleAmount)} ogni 4 settimane</p>
              {fee.lessonPrice && (
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(fee.lessonPrice)} a lezione{fee.lessonsPerCycle ? ` × ${fee.lessonsPerCycle}` : ""}
                </p>
              )}
              <p className="text-xs text-muted-foreground">Ciclo in corso: {cycleLabel(cycleStartAt(fee.startDate.toDate(), new Date()))}</p>
            </div>
          )}
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
          {rows.map((p) => {
            const installments = [...(p.installments ?? [])].sort((a, b) => a.date.toMillis() - b.date.toMillis());
            return (
              <li key={p.id} className="card-surface space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.description}</p>
                    <p className="text-xs text-muted-foreground">Scadenza {formatDate(p.dueDate)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <p className="text-lg font-bold tabular-nums">{formatCurrency(p.amount)}</p>
                    <PaymentBadge status={p.effective} />
                  </div>
                </div>
                {p.effective !== "cancelled" && paidAmountOf(p) > 0 && remainingOf(p) > 0 && <PaymentProgress payment={p} />}
                {installments.length > 0 ? (
                  <ul className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                    {installments.map((i) => (
                      <li key={i.id} className="flex justify-between gap-3">
                        <span>
                          {formatDate(i.date)} · {PAYMENT_METHOD_LABEL[i.method]}
                          {i.notes && ` · ${i.notes}`}
                        </span>
                        <span className="font-semibold tabular-nums text-foreground">{formatCurrency(i.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  p.effective === "paid" && (
                    <p className="text-xs text-muted-foreground">
                      Pagato il {formatDate(p.paidDate)}
                      {p.method && ` · ${PAYMENT_METHOD_LABEL[p.method]}`}
                    </p>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
