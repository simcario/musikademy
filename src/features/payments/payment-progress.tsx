import type { Payment } from "@/types";
import { formatCurrency } from "@/utils/format";
import { paidAmountOf, remainingOf } from "@/utils/status";

/** Barra incassato / dovuto. */
export function PaymentProgress({ payment }: { payment: Payment }) {
  const paid = paidAmountOf(payment);
  const pct = payment.amount > 0 ? Math.min(100, Math.round((paid / payment.amount) * 100)) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          Versati <strong className="tabular-nums">{formatCurrency(paid)}</strong> su {formatCurrency(payment.amount)}
        </span>
        {remainingOf(payment) > 0 && (
          <span className="font-semibold text-warning tabular-nums">Residuo {formatCurrency(remainingOf(payment))}</span>
        )}
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Percentuale versata"
      >
        <div className="h-full rounded-full bg-success transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
