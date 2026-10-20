"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarPlus, Pencil, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { FormActions, SidePanel } from "@/components/shared/dialogs";
import { Field } from "@/components/shared/form";
import { ErrorState, ListSkeleton } from "@/components/shared/states";
import { useMoneyOwner, useMyFees, useStaffMutation, useStaffScope } from "@/features/admin/hooks";
import { subjectsFor, useSelectableCourses } from "@/features/admin/pickers";
import { qk } from "@/hooks/query-keys";
import { lessonService } from "@/services/lessonService";
import { feeLabel, feeService, paymentService } from "@/services/paymentService";
import type { Fee, Student, WithId } from "@/types";
import { cycleFee, cycleKey, cycleLabel, cycleStartAt, shiftCycle } from "@/utils/cycles";
import { AppError } from "@/utils/errors";
import { formatCurrency, formatDate, fromInputDate, fullName, toInputDate } from "@/utils/format";
import { amountToInput, feeFormSchema, parseAmount, type FeeFormValues } from "./schemas";

export const DUE_AT_LABEL = { start: "a inizio ciclo", end: "a fine ciclo" } as const;

/**
 * I costi del docente per lo studente (ADR D29), uno per materia (o per corso, se non ha materie):
 * personali, li vede solo lui. Da qui si generano le quote dei cicli.
 */
export function StudentFeesCard({ student }: { student: WithId<Student> }) {
  const fees = useMyFees(student.id);
  const [editing, setEditing] = useState<WithId<Fee> | "new" | null>(null);
  return (
    <section className="card-surface space-y-3 p-4" aria-labelledby="student-fees">
      <div className="flex items-center gap-3">
        <Wallet className="size-5 shrink-0 text-primary" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="student-fees" className="text-sm font-semibold">
            I tuoi costi
          </h3>
          <p className="text-xs text-muted-foreground">Per materia, a cicli di 4 settimane. Li vedi solo tu (e lo studente).</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
          <Plus aria-hidden /> Aggiungi
        </Button>
      </div>
      {fees.isPending ? (
        <ListSkeleton rows={1} />
      ) : fees.isError ? (
        <ErrorState error={fees.error} onRetry={() => fees.refetch()} />
      ) : fees.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nessun costo impostato: le quote non verranno generate.</p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border">
          {fees.data.map((f) => (
            <FeeRow key={f.id} fee={f} active={student.status === "active"} onEdit={() => setEditing(f)} />
          ))}
        </ul>
      )}
      <FeeDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        student={student}
        fee={editing === "new" ? null : editing}
      />
    </section>
  );
}

function FeeRow({ fee: saved, active, onEdit }: { fee: WithId<Fee>; active: boolean; onEdit: () => void }) {
  const owner = useMoneyOwner();
  const fee = cycleFee(saved);
  const first = fee ? cycleStartAt(fee.startDate.toDate(), fee.startDate.toDate()) : null;
  const current = fee ? cycleStartAt(fee.startDate.toDate(), new Date()) : null;
  // Ciclo scelto per la generazione: precedente, in corso o successivo.
  const cycles = current && first ? [-1, 0, 1].map((n) => ({ n, start: shiftCycle(current, n) })).filter((c) => c.start >= first) : [];
  const [chosen, setChosen] = useState(0);
  const target = cycles.find((c) => c.n === chosen)?.start ?? current;

  const generate = useStaffMutation(() => paymentService.generateCycles([saved], target!, owner), {
    success: (r) => (r.created ? `Quota ${cycleLabel(target!)} creata` : `La quota ${cycleLabel(target!)} esiste già`),
    invalidate: [["payments"], ["stats"]],
  });

  return (
    <li className="flex flex-col gap-2 px-3 py-3 lg:flex-row lg:items-center">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{feeLabel(saved)}</p>
        <p className="font-bold tabular-nums">{formatCurrency(saved.cycleAmount)} ogni 4 settimane</p>
        <p className="text-xs text-muted-foreground">
          {saved.lessonPrice
            ? `${formatCurrency(saved.lessonPrice)} a lezione${saved.lessonsPerCycle ? ` × ${saved.lessonsPerCycle}` : ""} · `
            : ""}
          cicli dal {formatDate(saved.startDate, "d MMM yyyy")} · scadenza {DUE_AT_LABEL[saved.dueAt]}
        </p>
        {current && <p className="text-xs font-medium">Ciclo in corso: {cycleLabel(current)}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {fee && active && cycles.length > 0 && (
          <>
            <NativeSelect
              value={String(chosen)}
              onChange={(e) => setChosen(Number(e.target.value))}
              aria-label={`Ciclo della quota di ${feeLabel(saved)}`}
              className="w-auto"
            >
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
        <Button variant="outline" size="sm" onClick={onEdit} aria-label={`Modifica il costo di ${feeLabel(saved)}`}>
          <Pencil aria-hidden /> Modifica
        </Button>
      </div>
    </li>
  );
}

export function FeeDialog({
  open,
  onOpenChange,
  student,
  fee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  student: WithId<Student>;
  fee: WithId<Fee> | null;
}) {
  const scope = useStaffScope();
  // Nuovo costo: la data di inizio si propone dalla prima lezione dello studente con questo docente.
  const first = useQuery({
    queryKey: qk.lessons({ first: student.id }),
    queryFn: () => lessonService.firstForStudent(student.id, scope!),
    enabled: open && !fee && !!scope,
  });
  return (
    <SidePanel
      open={open}
      onOpenChange={onOpenChange}
      title={fee ? "Modifica costo" : "Nuovo costo"}
      description={`${fullName(student)} · si paga a cicli di 4 settimane dalla prima lezione, anche a rate.`}
    >
      {open && !fee && first.isPending ? (
        <ListSkeleton rows={2} />
      ) : (
        open && (
          <FeeForm
            key={fee?.id ?? "new"}
            student={student}
            fee={fee}
            firstLesson={first.data?.date.toDate()}
            onDone={() => onOpenChange(false)}
          />
        )
      )}
    </SidePanel>
  );
}

function FeeForm({
  student,
  fee,
  firstLesson,
  onDone,
}: {
  student: WithId<Student>;
  fee: WithId<Fee> | null;
  firstLesson?: Date;
  onDone: () => void;
}) {
  const owner = useMoneyOwner();
  // Corsi che il docente insegna e lo studente frequenta.
  const courses = useSelectableCourses(owner.uid);
  const options = courses.data.filter((c) => student.courseIds.includes(c.id) || c.id === fee?.courseId);
  const form = useForm<FeeFormValues>({
    resolver: zodResolver(feeFormSchema),
    defaultValues: {
      courseId: fee?.courseId ?? (options.length === 1 ? options[0].id : ""),
      subjectId: fee?.subjectId ?? "",
      lessonPrice: amountToInput(fee?.lessonPrice),
      lessonsPerCycle: fee?.lessonsPerCycle ? String(fee.lessonsPerCycle) : "",
      cycleAmount: amountToInput(fee?.cycleAmount),
      startDate: toInputDate(fee?.startDate ?? firstLesson ?? new Date()),
      dueAt: fee?.dueAt ?? "start",
    },
  });
  const { errors } = form.formState;
  const [courseId, lessonPrice, lessonsPerCycle, startDate] = useWatch({
    control: form.control,
    name: ["courseId", "lessonPrice", "lessonsPerCycle", "startDate"],
  });
  const course = options.find((c) => c.id === courseId);
  const subjects = subjectsFor(course, owner.uid);

  // Costo a lezione × lezioni per ciclo → quota (resta modificabile, es. per uno sconto).
  const recompute = (price = lessonPrice, count = lessonsPerCycle) => {
    const p = price && /^\d+([.,]\d{1,2})?$/.test(price.trim()) ? parseAmount(price) : 0;
    const n = Number(count);
    if (p > 0 && Number.isInteger(n) && n > 0) {
      form.setValue("cycleAmount", amountToInput(Math.round(p * n * 100) / 100), { shouldValidate: true });
    }
  };

  const save = useStaffMutation(
    (v: FeeFormValues) => {
      const c = options.find((x) => x.id === v.courseId);
      if (!c) throw new AppError("Scegli il corso.");
      const subject = subjectsFor(c, owner.uid).find((s) => s.id === v.subjectId);
      if (!subject && subjectsFor(c, owner.uid).length) throw new AppError("Scegli la materia.");
      return feeService.save(
        {
          studentId: student.id,
          studentName: fullName(student),
          courseId: c.id,
          courseName: c.name,
          subjectId: subject?.id,
          subjectName: subject?.name,
          cycleAmount: parseAmount(v.cycleAmount),
          lessonPrice: v.lessonPrice ? parseAmount(v.lessonPrice) : undefined,
          lessonsPerCycle: v.lessonsPerCycle ? Number(v.lessonsPerCycle) : undefined,
          startDate: fromInputDate(v.startDate),
          dueAt: v.dueAt,
        },
        owner,
        fee,
      );
    },
    { success: "Costo salvato", invalidate: [["fees"]], onSuccess: onDone },
  );
  const clear = useStaffMutation(() => feeService.remove(fee!.id), {
    success: "Costo rimosso",
    invalidate: [["fees"]],
    onSuccess: onDone,
  });

  if (!courses.isPending && options.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {fullName(student)} non frequenta nessuno dei corsi a cui sei abilitato: iscrivilo prima a un tuo corso.
      </p>
    );
  }

  const price = form.register("lessonPrice");
  const count = form.register("lessonsPerCycle");
  const validStart = /^\d{4}-\d{2}-\d{2}$/.test(startDate ?? "");
  return (
    <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Corso" error={errors.courseId?.message} required>
          {(p) => (
            <NativeSelect {...p} {...form.register("courseId", { onChange: () => form.setValue("subjectId", "") })}>
              <option value="">Seleziona corso</option>
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
        <Field label="Materia" error={errors.subjectId?.message} required={subjects.length > 0}>
          {(p) => (
            <NativeSelect {...p} {...form.register("subjectId")} disabled={subjects.length === 0}>
              <option value="">{subjects.length ? "Seleziona materia" : "Corso senza materie"}</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          )}
        </Field>
      </div>
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
          Rimuovi questo costo
        </Button>
      )}
      <FormActions onCancel={onDone} submitting={save.isPending} />
    </form>
  );
}
