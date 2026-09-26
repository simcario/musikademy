"use client";

import { useState } from "react";
import { CheckCircle2, CreditCard, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { PaymentBadge } from "@/components/shared/status-badge";
import { usePaymentsPage, useStaffMutation } from "@/features/admin/hooks";
import { StudentSelect } from "@/features/admin/pickers";
import { paymentService } from "@/services/paymentService";
import type { Payment, PaymentStatus, WithId } from "@/types";
import { formatCurrency, formatDate, fromInputDate } from "@/utils/format";
import { PAYMENT_META, PAYMENT_METHOD_LABEL, effectivePaymentStatus } from "@/utils/status";
import { PaymentFormDialog } from "./payment-form";

export function StaffPaymentList({ studentId, showFilters = true }: { studentId?: string; showFilters?: boolean }) {
  const [filterStudent, setFilterStudent] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [month, setMonth] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<WithId<Payment> | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Payment> | null>(null);

  const range = month ? monthRange(month) : undefined;
  const q = usePaymentsPage({ studentId: studentId ?? (filterStudent || undefined), status, ...range });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];

  const markPaid = useStaffMutation((p: WithId<Payment>) => paymentService.markPaid(p.id, p.method ?? "cash"), {
    success: "Pagamento registrato come pagato",
    invalidate: [["payments"], ["stats"]],
  });
  const remove = useStaffMutation((p: WithId<Payment>) => paymentService.remove(p.id), {
    success: "Pagamento eliminato",
    invalidate: [["payments"], ["stats"]],
    onSuccess: () => setToDelete(null),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        {showFilters && (
          <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-3">
            {!studentId && (
              <StudentSelect value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} placeholder="Tutti gli studenti" aria-label="Studente" />
            )}
            <NativeSelect value={status} onChange={(e) => setStatus(e.target.value as PaymentStatus | "all")} aria-label="Stato">
              <option value="all">Tutti gli stati</option>
              {(["pending", "paid", "overdue", "cancelled"] as const).map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_META[s].label}
                </option>
              ))}
            </NativeSelect>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mese di scadenza" />
          </div>
        )}
        <Button onClick={() => setCreating(true)}>
          <Plus aria-hidden /> Registra pagamento
        </Button>
      </div>

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nessun pagamento" />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {rows.map((p) => {
            const eff = effectivePaymentStatus(p);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setEditing(p)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold">{studentId ? p.description : p.studentName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {!studentId && `${p.description} · `}Scad. {formatDate(p.dueDate, "d MMM yyyy")}
                    {eff === "paid" && p.method && ` · ${PAYMENT_METHOD_LABEL[p.method]}`}
                  </p>
                </button>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                  <PaymentBadge status={eff} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni pagamento ${p.description}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {eff !== "paid" && eff !== "cancelled" && (
                      <DropdownMenuItem className="min-h-10" onClick={() => markPaid.mutate(p)}>
                        <CheckCircle2 aria-hidden /> Segna come pagato
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(p)}>
                      <Pencil aria-hidden /> Modifica
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" className="min-h-10" onClick={() => setToDelete(p)}>
                      <Trash2 aria-hidden /> Elimina
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            );
          })}
        </ul>
      )}
      <LoadMore hasMore={!!q.hasNextPage} loading={q.isFetchingNextPage} onClick={() => q.fetchNextPage()} />
      <PaymentFormDialog open={creating} onOpenChange={setCreating} defaultStudentId={studentId} />
      <PaymentFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} payment={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare il pagamento?"
        description="Se il pagamento non è più dovuto, puoi anche impostarlo come «Annullato» e mantenerlo nello storico."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </div>
  );
}

function monthRange(month: string) {
  const from = fromInputDate(`${month}-01`);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}

