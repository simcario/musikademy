"use client";

import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { useActiveStudents, useStaffMutation } from "@/features/admin/hooks";
import { StudentSelect } from "@/features/admin/pickers";
import { useSession } from "@/features/auth/auth-provider";
import { paymentService } from "@/services/paymentService";
import { PAYMENT_METHODS, type Payment, type WithId } from "@/types";
import { parseAmount, paymentFormSchema, type PaymentFormValues } from "./schemas";
import { fromInputDate, fullName, toInputDate } from "@/utils/format";
import { PAYMENT_META, PAYMENT_METHOD_LABEL } from "@/utils/status";

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
    <FormDialog open={open} onOpenChange={onOpenChange} title={payment ? "Modifica pagamento" : "Registra pagamento"}>
      <PaymentForm key={payment?.id ?? "new"} payment={payment} defaultStudentId={defaultStudentId} onDone={() => onOpenChange(false)} />
    </FormDialog>
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
  const { uid } = useSession();
  const students = useActiveStudents();
  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: {
      studentId: payment?.studentId ?? defaultStudentId ?? "",
      description: payment?.description ?? "",
      amount: payment ? String(payment.amount).replace(".", ",") : "",
      dueDate: toInputDate(payment?.dueDate ?? new Date()),
      paidDate: toInputDate(payment?.paidDate),
      method: payment?.method ?? "",
      status: payment?.status ?? "pending",
      notes: payment?.notes ?? "",
    },
  });
  const { errors } = form.formState;
  const status = useWatch({ control: form.control, name: "status" });

  const save = useStaffMutation(
    async (v: PaymentFormValues) => {
      const student = students.data?.find((s) => s.id === v.studentId);
      const input = {
        studentId: v.studentId,
        studentName: student ? fullName(student) : (payment?.studentName ?? ""),
        description: v.description,
        amount: parseAmount(v.amount),
        dueDate: fromInputDate(v.dueDate),
        paidDate: v.status === "paid" && v.paidDate ? fromInputDate(v.paidDate) : undefined,
        method: v.method || undefined,
        status: v.status,
        notes: v.notes || undefined,
      };
      return payment ? paymentService.update(payment.id, input) : paymentService.create(input, uid);
    },
    { success: payment ? "Pagamento aggiornato" : "Pagamento registrato", invalidate: [["payments"], ["stats"]], onSuccess: onDone },
  );

  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field label="Studente" error={errors.studentId?.message} required>
        {(p) => <StudentSelect {...p} {...form.register("studentId")} disabled={!!payment} />}
      </Field>
      <Field label="Descrizione" error={errors.description?.message} required>
        {(p) => <Input {...p} placeholder="Quota ottobre" {...form.register("description")} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importo (€)" error={errors.amount?.message} required>
          {(p) => <Input {...p} inputMode="decimal" placeholder="80,00" {...form.register("amount")} />}
        </Field>
        <Field label="Scadenza" error={errors.dueDate?.message} required>
          {(p) => <Input {...p} type="date" {...form.register("dueDate")} />}
        </Field>
      </div>
      <Field label="Stato">
        {(p) => (
          <NativeSelect {...p} {...form.register("status")}>
            {(["pending", "paid", "overdue", "cancelled"] as const).map((s) => (
              <option key={s} value={s}>
                {PAYMENT_META[s].label}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      {status === "paid" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Data pagamento" error={errors.paidDate?.message} required>
            {(p) => <Input {...p} type="date" {...form.register("paidDate")} />}
          </Field>
          <Field label="Metodo" error={errors.method?.message} required>
            {(p) => (
              <NativeSelect {...p} {...form.register("method")}>
                <option value="">Seleziona</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>
        </div>
      )}
      <Field label="Note" error={errors.notes?.message}>
        {(p) => <Textarea {...p} rows={2} {...form.register("notes")} />}
      </Field>
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}
