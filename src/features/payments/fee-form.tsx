"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Pencil, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormActions, FormDialog } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { ListSkeleton } from "@/components/shared/states";
import { useStaffMutation } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { qk } from "@/hooks/query-keys";
import { lessonService } from "@/services/lessonService";
import { paymentService } from "@/services/paymentService";
import { studentService } from "@/services/studentService";
import type { Student, StudentFee, WithId } from "@/types";
import { cycleFee, cycleKey, cycleLabel, cycleStartAt, shiftCycle, type LegacyFee } from "@/utils/cycles";
import { formatCurrency, formatDate, fromInputDate, toInputDate } from "@/utils/format";
import { amountToInput, feeFormSchema, parseAmount, type FeeFormValues } from "./schemas";

export const DUE_AT_LABEL = { start: "a inizio ciclo", end: "a fine ciclo" } as const;

/** Riepilogo del costo del corso nella scheda studente, con impostazione e generazione della quota. */
export function StudentFeeCard({ student }: { student: WithId<Student> }) {
  const { uid } = useSession();
  const [editing, setEditing] = useState(false);
  const saved = student.fee;
  const fee = cycleFee(saved);
  // Costo salvato dalla prima versione (quota mensile, senza data di inizio): va reimpostato.
  const outdated = !!saved && !fee;
  const current = fee ? cycleStartAt(fee.startDate.toDate(), new Date()) : null;
  // Ciclo scelto per la generazione: precedente, in corso o successivo.
  const cycles = current
    ? [-1, 0, 1]
        .map((n) => ({ n, start: shiftCycle(current, n) }))
        .filter((c) => c.start >= cycleStartAt(fee!.startDate.toDate(), fee!.startDate.toDate()))
    : [];
  const [chosen, setChosen] = useState(0);
  const target = cycles.find((c) => c.n === chosen)?.start ?? current;

  const generate = useStaffMutation(
    () => paymentService.generateCycles([student], target!, uid),
    {
      success: (r) => (r.created ? `Quota ${cycleLabel(target!)} creata` : `La quota ${cycleLabel(target!)} esiste già`),
      invalidate: [["payments"], ["stats"]],
    },
  );

  return (
    <div className="card-surface flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
      <Wallet className="hidden size-6 shrink-0 text-primary lg:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted-foreground">Costo del corso</p>
        {fee ? (
          <>
            <p className="text-lg font-bold tabular-nums">{formatCurrency(fee.cycleAmount)} ogni 4 settimane</p>
            <p className="text-xs text-muted-foreground">
              {fee.lessonPrice ? `${formatCurrency(fee.lessonPrice)} a lezione${fee.lessonsPerCycle ? ` × ${fee.lessonsPerCycle}` : ""} · ` : ""}
              cicli dal {formatDate(fee.startDate, "d MMM yyyy")} · scadenza {DUE_AT_LABEL[fee.dueAt]}
            </p>
            {current && <p className="text-xs font-medium">Ciclo in corso: {cycleLabel(current)}</p>}
          </>
        ) : outdated ? (
          <p className="text-sm font-medium text-warning">
            Da aggiornare: ora le quote seguono cicli di 4 settimane dalla prima lezione. Premi «Aggiorna» e indica la data
            della prima lezione.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Non impostato: le quote non verranno generate.</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fee && student.status === "active" && cycles.length > 0 && (
          <>
            <NativeSelect value={String(chosen)} onChange={(e) => setChosen(Number(e.target.value))} aria-label="Ciclo della quota" className="w-auto">
              {cycles.map((c) => (
                <option key={cycleKey(c.start)} value={c.n}>
                  {c.n === 0 ? "In corso" : c.n < 0 ? "Precedente" : "Prossimo"} · {cycleLabel(c.start)}
                </option>
              ))}
            </NativeSelect>
            <Button variant="secondary" size="sm" onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
              <CalendarPlus aria-hidden /> Genera quota
            </Button>
          </>
        )}
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          <Pencil aria-hidden /> {fee ? "Modifica" : outdated ? "Aggiorna" : "Imposta costo"}
        </Button>
      </div>
      <FeeDialog open={editing} onOpenChange={setEditing} studentId={student.id} fee={saved} />
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
  // Senza data di inizio salvata, la si propone dalla prima lezione dello studente.
  const needsStart = !cycleFee(fee);
  const first = useQuery({
    queryKey: qk.lessons({ first: studentId }),
    queryFn: () => lessonService.firstForStudent(studentId),
    enabled: open && needsStart,
  });
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Costo del corso"
      description="Si paga a cicli di 4 settimane che partono dalla prima lezione, anche a rate (es. lezione per lezione)."
    >
      {open && needsStart && first.isPending ? (
        <ListSkeleton rows={2} />
      ) : (
        <FeeForm
          key={String(open)}
          studentId={studentId}
          fee={fee}
          firstLesson={first.data?.date.toDate()}
          onDone={() => onOpenChange(false)}
        />
      )}
    </FormDialog>
  );
}

function FeeForm({
  studentId,
  fee,
  firstLesson,
  onDone,
}: {
  studentId: string;
  fee?: StudentFee;
  firstLesson?: Date;
  onDone: () => void;
}) {
  // Il vecchio formato mensile precompila importo e lezioni.
  const legacy = (fee ?? {}) as LegacyFee;
  const valid = cycleFee(fee);
  const lessons = fee?.lessonsPerCycle ?? legacy.lessonsPerMonth;
  const form = useForm<FeeFormValues>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: {
      lessonPrice: amountToInput(fee?.lessonPrice),
      lessonsPerCycle: lessons ? String(lessons) : "",
      cycleAmount: amountToInput(fee?.cycleAmount ?? legacy.monthlyAmount),
      startDate: toInputDate(valid?.startDate ?? firstLesson ?? new Date()),
      dueAt: valid?.dueAt ?? "start",
    },
  });
  const { errors } = form.formState;
  const [lessonPrice, lessonsPerCycle, startDate] = useWatch({
    control: form.control,
    name: ["lessonPrice", "lessonsPerCycle", "startDate"],
  });

  // Costo a lezione × lezioni per ciclo → quota (resta modificabile, es. per uno sconto).
  const recompute = (price = lessonPrice, count = lessonsPerCycle) => {
    const p = price && /^\d+([.,]\d{1,2})?$/.test(price.trim()) ? parseAmount(price) : 0;
    const n = Number(count);
    if (p > 0 && Number.isInteger(n) && n > 0) {
      form.setValue("cycleAmount", amountToInput(Math.round(p * n * 100) / 100), { shouldValidate: true });
    }
  };

  const save = useStaffMutation(
    (v: FeeFormValues) =>
      studentService.setFee(studentId, {
        cycleAmount: parseAmount(v.cycleAmount),
        lessonPrice: v.lessonPrice ? parseAmount(v.lessonPrice) : undefined,
        lessonsPerCycle: v.lessonsPerCycle ? Number(v.lessonsPerCycle) : undefined,
        startDate: fromInputDate(v.startDate),
        dueAt: v.dueAt,
      }),
    { success: "Costo del corso salvato", invalidate: [["students"]], onSuccess: onDone },
  );
  const clear = useStaffMutation(() => studentService.setFee(studentId, null), {
    success: "Costo del corso rimosso",
    invalidate: [["students"]],
    onSuccess: onDone,
  });

  const price = form.register("lessonPrice");
  const count = form.register("lessonsPerCycle");
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "");
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <Field
        label="Prima lezione (inizio dei cicli)"
        error={errors.startDate?.message}
        required
        hint={
          validStart
            ? `Primo ciclo: ${cycleLabel(fromInputDate(startDate))}${firstLesson && !fee ? " · proposta dalla prima lezione in calendario" : ""}`
            : undefined
        }
      >
        {(p) => <Input {...p} type="date" {...form.register("startDate")} />}
      </Field>
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
                recompute(e.target.value, lessonsPerCycle);
              }}
            />
          )}
        </Field>
        <Field label="Lezioni ogni 4 settimane" error={errors.lessonsPerCycle?.message}>
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
        <Field label="Quota 4 settimane (€)" error={errors.cycleAmount?.message} required hint="Calcolata, ma modificabile">
          {(p) => <Input {...p} inputMode="decimal" placeholder="120" {...form.register("cycleAmount")} />}
        </Field>
        <Field label="Scadenza della quota" error={errors.dueAt?.message} required>
          {(p) => (
            <NativeSelect {...p} {...form.register("dueAt")}>
              <option value="start">Inizio ciclo (anticipato)</option>
              <option value="end">Fine ciclo (es. paga a lezione)</option>
            </NativeSelect>
          )}
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
