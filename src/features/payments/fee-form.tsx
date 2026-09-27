"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { paymentService } from "@/services/paymentService";
import { studentService } from "@/services/studentService";
import type { Student, StudentFee, WithId } from "@/types";
import { formatCurrency } from "@/utils/format";
import { periodLabel, periodOf } from "@/utils/status";
import { amountToInput, feeFormSchema, parseAmount, type FeeFormValues } from "./schemas";

/** Riepilogo del costo del corso nella scheda studente, con impostazione e generazione della quota. */
export function StudentFeeCard({ student }: { student: WithId<Student> }) {
  const { uid } = useSession();
  const [editing, setEditing] = useState(false);
  const [period, setPeriod] = useState(() => periodOf(new Date()));
  const fee = student.fee;

  const generate = useStaffMutation(() => paymentService.generateMonthly([student], period, uid), {
    success: (r) => (r.created ? `Quota di ${periodLabel(period).toLowerCase()} creata` : `La quota di ${periodLabel(period).toLowerCase()} esiste già`),
    invalidate: [["payments"], ["stats"]],
  });

  return (
    <div className="card-surface flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
      <Wallet className="hidden size-6 shrink-0 text-primary sm:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">Costo del corso</p>
        {fee ? (
          <>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(fee.monthlyAmount)} / mese</p>
            <p className="text-xs text-muted-foreground">
              {fee.lessonPrice ? `${formatCurrency(fee.lessonPrice)} a lezione` : ""}
              {fee.lessonPrice && fee.lessonsPerMonth ? ` × ${fee.lessonsPerMonth} lezioni · ` : fee.lessonPrice ? " · " : ""}
              scadenza il {fee.dueDay} del mese
            </p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Non impostato: le quote mensili non verranno generate.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fee && student.status === "active" && (
          <>
            <Input
              type="month"
              value={period}
              onChange={(e) => e.target.value && setPeriod(e.target.value)}
              aria-label="Mese della quota"
              className="w-40"
            />
            <Button variant="secondary" size="sm" onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
              <CalendarPlus aria-hidden /> Genera quota
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> {fee ? "Modifica" : "Imposta costo"}
        </Button>
      </div>
      <FeeDialog open={editing} onOpenChange={setEditing} studentId={student.id} fee={fee} />
    </div>
  );
}

export function FeeDialog({
  open,
  onOpenChange,
  studentId,
  fee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  studentId: string;
  fee?: StudentFee;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Costo del corso"
      description="Base per le quote mensili. Lo studente potrà pagare anche a rate, ad esempio lezione per lezione."
    >
      <FeeForm key={String(open)} studentId={studentId} fee={fee} onDone={() => onOpenChange(false)} />
    </FormDialog>
  );
}

function FeeForm({ studentId, fee, onDone }: { studentId: string; fee?: StudentFee; onDone: () => void }) {
  const form = useForm<FeeFormValues>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: {
      lessonPrice: amountToInput(fee?.lessonPrice),
      lessonsPerMonth: fee?.lessonsPerMonth ? String(fee.lessonsPerMonth) : "",
      monthlyAmount: amountToInput(fee?.monthlyAmount),
      dueDay: String(fee?.dueDay ?? 10),
    },
  });
  const { errors } = form.formState;
  const [lessonPrice, lessonsPerMonth] = useWatch({ control: form.control, name: ["lessonPrice", "lessonsPerMonth"] });

  // Costo a lezione × lezioni al mese → quota mensile (resta modificabile, es. per uno sconto).
  const recompute = (price = lessonPrice, count = lessonsPerMonth) => {
    const p = price && /^\d+([.,]\d{1,2})?$/.test(price.trim()) ? parseAmount(price) : 0;
    const n = Number(count);
    if (p > 0 && Number.isInteger(n) && n > 0) {
      form.setValue("monthlyAmount", amountToInput(Math.round(p * n * 100) / 100), { shouldValidate: true });
    }
  };

  const save = useStaffMutation(
    (v: FeeFormValues) =>
      studentService.setFee(studentId, {
        monthlyAmount: parseAmount(v.monthlyAmount),
        lessonPrice: v.lessonPrice ? parseAmount(v.lessonPrice) : undefined,
        lessonsPerMonth: v.lessonsPerMonth ? Number(v.lessonsPerMonth) : undefined,
        dueDay: Number(v.dueDay),
      }),
    { success: "Costo del corso salvato", invalidate: [["students"]], onSuccess: onDone },
  );
  const clear = useStaffMutation(() => studentService.setFee(studentId, null), {
    success: "Costo del corso rimosso",
    invalidate: [["students"]],
    onSuccess: onDone,
  });

  const price = form.register("lessonPrice");
  const count = form.register("lessonsPerMonth");
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Costo a lezione (€)" error={errors.lessonPrice?.message}>
          {(p) => (
            <Input
              {...p}
              inputMode="decimal"
              placeholder="30"
              {...price}
              onChange={(e) => {
                price.onChange(e);
                recompute(e.target.value, lessonsPerMonth);
              }}
            />
          )}
        </Field>
        <Field label="Lezioni al mese" error={errors.lessonsPerMonth?.message}>
          {(p) => (
            <Input
              {...p}
              inputMode="numeric"
              placeholder="4"
              {...count}
              onChange={(e) => {
                count.onChange(e);
                recompute(lessonPrice, e.target.value);
              }}
            />
          )}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quota mensile (€)" error={errors.monthlyAmount?.message} required hint="Calcolata, ma modificabile">
          {(p) => <Input {...p} inputMode="decimal" placeholder="120" {...form.register("monthlyAmount")} />}
        </Field>
        <Field label="Scadenza (giorno del mese)" error={errors.dueDay?.message} required>
          {(p) => <Input {...p} inputMode="numeric" {...form.register("dueDay")} />}
        </Field>
      </div>
      {fee && (
        <Button type="button" variant="ghost" size="sm" className="text-danger" onClick={() => clear.mutate(undefined)} disabled={clear.isPending}>
          Rimuovi costo del corso
        </Button>
      )}
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}
