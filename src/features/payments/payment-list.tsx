"use client";

import { useState } from "react";
import { CalendarPlus, CheckCircle2, CreditCard, HandCoins, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ConfirmDialog, FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { EmptyState, ErrorState, ListSkeleton, LoadMore } from "@/components/shared/states";
import { PaymentBadge } from "@/components/shared/status-badge";
import { useActiveStudents, usePaymentsPage, useStaffMutation } from "@/features/admin/hooks";
import { StudentSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { paymentService } from "@/services/paymentService";
import type { Payment, PaymentStatus, WithId } from "@/types";
import { formatCurrency, formatDate, fromInputDate } from "@/utils/format";
import { PAYMENT_META, PAYMENT_METHOD_LABEL, effectivePaymentStatus, paidAmountOf, periodLabel, periodOf, remainingOf } from "@/utils/status";
import { InstallmentDialog, PaymentFormDialog } from "./payment-form";

const INVALIDATE = [["payments"], ["stats"]];
const FILTER_STATUSES = ["pending", "partial", "paid", "overdue", "cancelled"] as const;

export function StaffPaymentList({ studentId, showFilters = true }: { studentId?: string; showFilters?: boolean }) {
  const [filterStudent, setFilterStudent] = useState("");
  const [status, setStatus] = useState<PaymentStatus | "all">("all");
  const [month, setMonth] = useState("");
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [editing, setEditing] = useState<WithId<Payment> | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<WithId<Payment> | null>(null);

  const range = month ? monthRange(month) : undefined;
  const q = usePaymentsPage({ studentId: studentId ?? (filterStudent || undefined), status, ...range });
  const rows = q.data?.pages.flatMap((p) => p.items) ?? [];
  // Il dialog versamenti legge la quota dalla lista, così resta aggiornato dopo ogni modifica.
  const paying = rows.find((p) => p.id === payingId) ?? null;

  const markPaid = useStaffMutation((p: WithId<Payment>) => paymentService.markPaid(p.id, p.method ?? "cash"), {
    success: "Quota saldata",
    invalidate: INVALIDATE,
  });
  const remove = useStaffMutation((p: WithId<Payment>) => paymentService.remove(p.id), {
    success: "Quota eliminata",
    invalidate: INVALIDATE,
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
              {FILTER_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {PAYMENT_META[s].label}
                </option>
              ))}
            </NativeSelect>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mese di scadenza" />
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {!studentId && (
            <Button variant="secondary" onClick={() => setGenerating(true)}>
              <CalendarPlus aria-hidden /> Genera quote del mese
            </Button>
          )}
          <Button onClick={() => setCreating(true)}>
            <Plus aria-hidden /> Nuova quota
          </Button>
        </div>
      </div>

      {q.isPending ? (
        <ListSkeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={CreditCard} title="Nessuna quota" />
      ) : (
        <ul className="card-surface divide-y divide-border">
          {rows.map((p) => {
            const eff = effectivePaymentStatus(p);
            const paid = paidAmountOf(p);
            const rest = remainingOf(p);
            return (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <button type="button" onClick={() => setPayingId(p.id)} className="min-w-0 flex-1 text-left">
                  <p className="truncate font-semibold">{studentId ? p.description : p.studentName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {!studentId && `${p.description} · `}Scad. {formatDate(p.dueDate, "d MMM yyyy")}
                    {eff === "paid" && p.method && ` · ${PAYMENT_METHOD_LABEL[p.method]}`}
                  </p>
                  {paid > 0 && rest > 0 && (
                    <p className="text-xs font-medium text-muted-foreground tabular-nums">
                      Versati {formatCurrency(paid)} · residuo <span className="text-warning">{formatCurrency(rest)}</span>
                    </p>
                  )}
                </button>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-bold tabular-nums">{formatCurrency(p.amount)}</span>
                  <PaymentBadge status={eff} />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Azioni quota ${p.description}`} className="flex size-11 items-center justify-center rounded-full hover:bg-muted">
                    <MoreVertical className="size-5" aria-hidden />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {rest > 0 && (
                      <>
                        <DropdownMenuItem className="min-h-10" onClick={() => setPayingId(p.id)}>
                          <HandCoins aria-hidden /> Registra versamento
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-10" onClick={() => markPaid.mutate(p)}>
                          <CheckCircle2 aria-hidden /> Salda {formatCurrency(rest)}
                        </DropdownMenuItem>
                      </>
                    )}
                    {rest === 0 && paid > 0 && (
                      <DropdownMenuItem className="min-h-10" onClick={() => setPayingId(p.id)}>
                        <HandCoins aria-hidden /> Vedi versamenti
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem className="min-h-10" onClick={() => setEditing(p)}>
                      <Pencil aria-hidden /> Modifica quota
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
      <InstallmentDialog payment={paying} onOpenChange={(o) => !o && setPayingId(null)} />
      <GenerateMonthlyDialog open={generating} onOpenChange={setGenerating} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare la quota?"
        description="Verranno eliminati anche i versamenti registrati. Se la quota non è più dovuta, puoi invece segnarla come annullata e mantenerla nello storico."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </div>
  );
}

/** Crea in un colpo le quote del mese per tutti gli studenti attivi con un costo impostato. */
function GenerateMonthlyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { uid } = useSession();
  const students = useActiveStudents();
  const [period, setPeriod] = useState(() => periodOf(new Date()));
  const withFee = (students.data ?? []).filter((s) => (s.fee?.monthlyAmount ?? 0) > 0);
  const total = withFee.reduce((s, st) => s + (st.fee?.monthlyAmount ?? 0), 0);

  const generate = useStaffMutation(() => paymentService.generateMonthly(students.data ?? [], period, uid), {
    success: (r) =>
      r.created
        ? `${r.created} ${r.created === 1 ? "quota creata" : "quote create"}${r.existing ? ` (${r.existing} già presenti)` : ""}`
        : "Tutte le quote del mese erano già presenti",
    invalidate: INVALIDATE,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Genera quote del mese"
      description="Crea una quota per ogni studente attivo con il costo del corso impostato. Le quote già create non vengono toccate."
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          generate.mutate(undefined);
        }}
      >
        <Field label="Mese" required>
          {(p) => <Input {...p} type="month" value={period} onChange={(e) => e.target.value && setPeriod(e.target.value)} />}
        </Field>
        <p className="text-sm text-muted-foreground">
          {students.isPending
            ? "Caricamento studenti…"
            : `${periodLabel(period)}: ${withFee.length} studenti con costo impostato, totale ${formatCurrency(total)}.`}
          {!students.isPending && (students.data?.length ?? 0) > withFee.length && (
            <> {(students.data?.length ?? 0) - withFee.length} senza costo: impostalo dalla scheda studente, sezione Pagamenti.</>
          )}
        </p>
        <FormActions onCancel={() => onOpenChange(false)} submitting={generate.isPending} submitLabel="Genera quote" />
      </form>
    </FormDialog>
  );
}

function monthRange(month: string) {
  const from = fromInputDate(`${month}-01`);
  const to = new Date(from.getFullYear(), from.getMonth() + 1, 0, 23, 59, 59);
  return { from, to };
}
