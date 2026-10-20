"use client";

import { useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog, FormActions, SidePanel } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { cn } from "@/lib/utils";
import { useActiveStudents, useMoneyOwner, useMyFees, useStaffMutation } from "@/features/admin/hooks";
import { StudentSelect } from "@/features/admin/pickers";
import { feeLabel, paymentService } from "@/services/paymentService";
import { PAYMENT_METHODS, type Installment, type Payment, type WithId } from "@/types";
import {
  amountToInput,
  installmentSchema,
  parseAmount,
  paymentFormSchema,
  type InstallmentFormValues,
  type PaymentFormValues,
} from "./schemas";
import { formatCurrency, formatDate, fromInputDate, fullName, toInputDate } from "@/utils/format";
import { PaymentProgress } from "./payment-progress";
import { cycleFee, cycleLabel, cycleStartAt } from "@/utils/cycles";
import { PAYMENT_METHOD_LABEL, paidAmountOf, remainingOf } from "@/utils/status";

const INVALIDATE = [["payments"], ["stats"]];

function MethodOptions() {
  return (
    <>
      <option value="">Seleziona</option>
      {PAYMENT_METHODS.map((m) => (
        <option key={m} value={m}>
          {PAYMENT_METHOD_LABEL[m]}
        </option>
      ))}
    </>
  );
}

export function PaymentFormDialog({
  open,
  onOpenChange,
  payment,
  defaultStudentId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  payment?: WithId<Payment> | null;
  defaultStudentId?: string;
}) {
  return (
    <SidePanel open={open} onOpenChange={onOpenChange} title={payment ? "Modifica quota" : "Nuova quota"}>
      <PaymentForm key={payment?.id ?? "new"} payment={payment} defaultStudentId={defaultStudentId} onDone={() => onOpenChange(false)} />
    </SidePanel>
  );
}

function PaymentForm({
  payment,
  defaultStudentId,
  onDone,
}: {
  payment?: WithId<Payment> | null;
  defaultStudentId?: string;
  onDone: () => void;
}) {
  const owner = useMoneyOwner();
  const students = useActiveStudents();
  // I costi del docente (tutti gli studenti): propongono materia, importo e descrizione.
  const fees = useMyFees();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      studentId: payment?.studentId ?? defaultStudentId ?? "",
      feeId: payment?.feeId ?? "",
      description: payment?.description ?? "",
      amount: amountToInput(payment?.amount),
      dueDate: toInputDate(payment?.dueDate ?? new Date()),
      cancelled: payment?.status === "cancelled",
      notes: payment?.notes ?? "",
      payNowAmount: "",
      payNowDate: toInputDate(new Date()),
      payNowMethod: "",
    },
  });
  const { errors } = form.formState;
  const studentId = useWatch({ control: form.control, name: "studentId" });
  const feeId = useWatch({ control: form.control, name: "feeId" });
  const payNowAmount = useWatch({ control: form.control, name: "payNowAmount" });
  const selected = students.data?.find((s) => s.id === studentId);
  const studentFees = (fees.data ?? []).filter((f) => f.studentId === studentId);
  const selectedFee = studentFees.find((f) => f.id === feeId) ?? null;
  const selectedCycle = cycleFee(selectedFee);

  // Nuova quota: propone descrizione e importo dal costo scelto (materia).
  const applyFee = (id: string) => {
    const fee = cycleFee(studentFees.find((f) => f.id === id));
    if (!fee || payment) return;
    if (!form.getValues("amount")) form.setValue("amount", amountToInput(fee.cycleAmount));
    if (!form.getValues("description")) {
      form.setValue("description", `Quota ${cycleLabel(cycleStartAt(fee.startDate.toDate(), new Date()))}`);
    }
  };
  // Con un solo costo per lo studente lo si sceglie subito.
  const onStudent = (id: string) => {
    const own = (fees.data ?? []).filter((f) => f.studentId === id);
    const only = own.length === 1 ? own[0].id : "";
    form.setValue("feeId", only);
    if (only) applyFee(only);
  };

  const save = useStaffMutation(
    async (v: PaymentFormValues) => {
      const input = {
        studentId: v.studentId,
        studentName: selected ? fullName(selected) : (payment?.studentName ?? ""),
        description: v.description,
        amount: parseAmount(v.amount),
        dueDate: fromInputDate(v.dueDate),
        cancelled: v.cancelled,
        notes: v.notes || undefined,
        fee: selectedFee,
      };
      if (payment) return paymentService.update(payment.id, input);
      const payNow =
        v.payNowAmount && v.payNowDate && v.payNowMethod
          ? { amount: parseAmount(v.payNowAmount), date: fromInputDate(v.payNowDate), method: v.payNowMethod }
          : undefined;
      return paymentService.create(input, owner, payNow);
    },
    { success: payment ? "Quota aggiornata" : "Quota registrata", invalidate: INVALIDATE, onSuccess: onDone },
  );

  const studentField = form.register("studentId");
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Studente" error={errors.studentId?.message} required>
        {(p) => (
          <StudentSelect
            {...p}
            {...studentField}
            onChange={(e) => {
              studentField.onChange(e);
              onStudent(e.target.value);
            }}
            disabled={!!payment}
          />
        )}
      </Field>
      {studentFees.length > 0 && (
        <Field label="Materia" hint="Dai tuoi costi per lo studente">
          {(p) => (
            <NativeSelect
              {...p}
              {...form.register("feeId", { onChange: (e) => applyFee(e.target.value) })}
              disabled={!!payment}
            >
              <option value="">Nessuna (quota libera)</option>
              {studentFees.map((f) => (
                <option key={f.id} value={f.id}>
                  {feeLabel(f)}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      )}
      <Field label="Descrizione" error={errors.description?.message} required>
        {(p) => <Input {...p} placeholder="Quota ottobre" {...form.register("description")} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Importo dovuto (€)"
          error={errors.amount?.message}
          required
          hint={selectedCycle && !payment ? `Quota 4 settimane: ${formatCurrency(selectedCycle.cycleAmount)}` : undefined}
        >
          {(p) => <Input {...p} inputMode="decimal" placeholder="120" {...form.register("amount")} />}
        </Field>
        <Field label="Scadenza" error={errors.dueDate?.message} required>
          {(p) => <Input {...p} type="date" {...form.register("dueDate")} />}
        </Field>
      </div>

      {payment ? (
        <>
          <p className="text-sm text-muted-foreground">
            Versato finora: <strong className="text-foreground">{formatCurrency(paidAmountOf(payment))}</strong>. I versamenti si
            registrano dal menu della quota.
          </p>
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="size-[18px] accent-primary" {...form.register("cancelled")} /> Quota annullata (non più
            dovuta)
          </label>
        </>
      ) : (
        <fieldset className="space-y-3 rounded-xl border border-border p-3">
          <legend className="px-1 text-[13px] font-medium">Incassato adesso (facoltativo)</legend>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Importo (€)" error={errors.payNowAmount?.message} hint="Anche solo una parte">
              {(p) => <Input {...p} inputMode="decimal" placeholder="30" {...form.register("payNowAmount")} />}
            </Field>
            <Field label="Data" error={errors.payNowDate?.message}>
              {(p) => <Input {...p} type="date" {...form.register("payNowDate")} />}
            </Field>
          </div>
          {!!payNowAmount && (
            <Field label="Metodo" error={errors.payNowMethod?.message} required>
              {(p) => (
                <NativeSelect {...p} {...form.register("payNowMethod")}>
                  <MethodOptions />
                </NativeSelect>
              )}
            </Field>
          )}
        </fieldset>
      )}

      <Field label="Note" error={errors.notes?.message}>
        {(p) => <Textarea {...p} rows={2} {...form.register("notes")} />}
      </Field>
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}

/** Registra un versamento (anche parziale, es. una lezione) e mostra lo storico dei versamenti. */
export function InstallmentDialog({
  payment,
  onOpenChange,
}: {
  payment: WithId<Payment> | null;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <SidePanel
      open={!!payment}
      onOpenChange={onOpenChange}
      title="Registra versamento"
      description={payment ? `${payment.studentName} · ${payment.description}` : undefined}
    >
      {payment && <InstallmentForm key={`${payment.id}-${paidAmountOf(payment)}`} payment={payment} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

function InstallmentForm({ payment, onDone }: { payment: WithId<Payment>; onDone: () => void }) {
  const fees = useMyFees(payment.studentId);
  const remaining = remainingOf(payment);
  // Costo a lezione della materia della quota (o dell'unico costo dello studente).
  const fee = fees.data?.find((f) => f.id === payment.feeId) ?? (fees.data?.length === 1 ? fees.data[0] : undefined);
  const lessonPrice = fee?.lessonPrice;
  const schema = useMemo(() => installmentSchema(remaining), [remaining]);
  const form = useForm<InstallmentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { amount: amountToInput(remaining), date: toInputDate(new Date()), method: payment.method ?? "cash", notes: "" },
  });
  const { errors } = form.formState;
  const amount = useWatch({ control: form.control, name: "amount" });

  const save = useStaffMutation(
    (v: InstallmentFormValues) =>
      paymentService.addInstallment(payment.id, {
        amount: parseAmount(v.amount),
        date: fromInputDate(v.date),
        method: v.method,
        notes: v.notes || undefined,
      }),
    {
      success: (_r, v) => (parseAmount(v.amount) >= remaining ? "Quota saldata" : `Versamento di ${formatCurrency(parseAmount(v.amount))} registrato`),
      invalidate: INVALIDATE,
      onSuccess: onDone,
    },
  );

  // Scorciatoie: n lezioni al costo impostato, oppure il saldo.
  const quick: { label: string; amount: number }[] = [];
  if (lessonPrice && lessonPrice < remaining) {
    for (let n = 1; n * lessonPrice < remaining && n <= 3; n++) {
      quick.push({ label: `${n} ${n === 1 ? "lezione" : "lezioni"}`, amount: Math.round(n * lessonPrice * 100) / 100 });
    }
  }
  quick.push({ label: "Saldo", amount: remaining });

  return (
    <div className="space-y-5">
      <PaymentProgress payment={payment} />
      {remaining > 0 ? (
        <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Importi rapidi">
            {quick.map((q) => {
              // Selezionato finché l'importo corrisponde alla scorciatoia (anche se digitato a mano).
              const active = !!amount && parseAmount(amount) === q.amount;
              return (
                <button
                  key={q.label}
                  type="button"
                  aria-pressed={active}
                  onClick={() => form.setValue("amount", amountToInput(q.amount), { shouldValidate: true })}
                  className={cn(
                    "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors",
                    active ? "border-primary bg-primary text-primary-foreground shadow-sm" : "border-border hover:bg-muted",
                  )}
                >
                  {active && <Check className="size-4" aria-hidden />}
                  {q.label} · {formatCurrency(q.amount)}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Importo (€)" error={errors.amount?.message} required hint={`Residuo ${formatCurrency(remaining)}`}>
              {(p) => <Input {...p} inputMode="decimal" {...form.register("amount")} />}
            </Field>
            <Field label="Data" error={errors.date?.message} required>
              {(p) => <Input {...p} type="date" {...form.register("date")} />}
            </Field>
          </div>
          <Field label="Metodo" error={errors.method?.message} required>
            {(p) => (
              <NativeSelect {...p} {...form.register("method")}>
                <MethodOptions />
              </NativeSelect>
            )}
          </Field>
          <Field label="Nota" error={errors.notes?.message}>
            {(p) => <Input {...p} placeholder="Es. lezione del 3 ottobre" {...form.register("notes")} />}
          </Field>
          <FormActions onCancel={onDone} submitting={save.isPending} submitLabel="Registra versamento" />
        </form>
      ) : (
        <p className="text-sm text-muted-foreground">
          {payment.status === "cancelled" ? "Quota annullata: nessun versamento dovuto." : "Quota saldata."}
        </p>
      )}
      <InstallmentHistory payment={payment} />
    </div>
  );
}

function InstallmentHistory({ payment }: { payment: WithId<Payment> }) {
  const [toDelete, setToDelete] = useState<Installment | null>(null);
  const remove = useStaffMutation((i: Installment) => paymentService.removeInstallment(payment.id, i.id), {
    success: "Versamento eliminato",
    invalidate: INVALIDATE,
    onSuccess: () => setToDelete(null),
  });
  const items = [...(payment.installments ?? [])].sort((a, b) => b.date.toMillis() - a.date.toMillis());
  if (!items.length) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold text-muted-foreground">Versamenti registrati</h3>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular-nums">{formatCurrency(i.amount)}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(i.date, "d MMM yyyy")} · {PAYMENT_METHOD_LABEL[i.method]}
                {i.notes && ` · ${i.notes}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setToDelete(i)}
              aria-label={`Elimina versamento di ${formatCurrency(i.amount)} del ${formatDate(i.date)}`}
              className="flex size-10 items-center justify-center rounded-full text-danger hover:bg-danger-soft"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Eliminare il versamento?"
        description="Il residuo della quota verrà ricalcolato."
        confirmLabel="Elimina"
        destructive
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
      />
    </section>
  );
}
