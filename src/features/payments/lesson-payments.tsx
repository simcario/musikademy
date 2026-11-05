"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BadgeEuro, CircleCheck, Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { SidePanel } from "@/components/shared/dialogs";
import { DateInput } from "@/components/shared/date-time-input";
import { CheckList, Field } from "@/components/shared/form";
import { Pill } from "@/components/shared/status-badge";
import { useMoneyOwner, useMyFees, useStaffMutation, useStaffScope } from "@/features/admin/hooks";
import { useSession } from "@/features/auth/auth-provider";
import { qk } from "@/hooks/query-keys";
import { can } from "@/lib/auth/roles";
import { lessonService } from "@/services/lessonService";
import { feeId, feeLabel, paymentService } from "@/services/paymentService";
import { PAYMENT_METHODS, type Fee, type Lesson, type Payment, type PaymentMethod, type WithId } from "@/types";
import { addDays } from "date-fns";
import { CYCLE_DAYS } from "@/utils/cycles";
import { formatCurrency, formatDate, fromInputDate, toInputDate } from "@/utils/format";
import { PAYMENT_METHOD_LABEL, remainingOf } from "@/utils/status";
import { amountToInput, parseAmount } from "./schemas";

/**
 * Pagamento delle lezioni: ogni versamento indica le lezioni che paga (`Installment.lessonIds`),
 * la quota ne tiene l'unione (`Payment.lessonIds`). Le quote sono del docente (ADR D34): una
 * lezione risulta pagata solo a chi l'ha tenuta.
 */

const INVALIDATE = [["payments"], ["stats"]];

/** I campi della lezione che servono per registrarne il pagamento. */
export type PayableLesson = Pick<
  WithId<Lesson>,
  "id" | "studentId" | "studentName" | "teacherId" | "courseId" | "subjectId" | "date" | "title" | "startTime"
>;

/** Chi può registrare il pagamento: solo il docente della lezione, con il permesso Pagamenti. */
export function useCanRecordPayment() {
  const { uid, access } = useSession();
  return (lesson: Pick<Lesson, "teacherId">) => lesson.teacherId === uid && can(access, "payments:manage");
}

/** Lezioni pagate tra quelle indicate (solo le quote del docente): lezione → quota. */
export function usePaidLessons(lessonIds: string[], enabled = true) {
  const { uid } = useSession();
  return useQuery({
    queryKey: qk.payments({ paidLessons: lessonIds }),
    queryFn: () => paymentService.paidLessons(lessonIds, uid),
    enabled: enabled && lessonIds.length > 0,
  });
}

/** Le quote del docente per lo studente, con le lezioni già pagate. */
function useStudentPayments(studentId: string) {
  const { uid } = useSession();
  return useQuery({
    queryKey: qk.payments({ student: studentId, teacher: uid }),
    queryFn: () => paymentService.listForStudent(studentId, uid),
    enabled: !!studentId,
  });
}

/** Le lezioni dello studente tenute dal docente (anche per l'admin, che altrimenti le vedrebbe tutte). */
function useMyLessonsOf(studentId: string) {
  const scope = useStaffScope();
  return useQuery({
    queryKey: qk.lessons({ student: studentId, teacher: scope?.uid }),
    queryFn: async () => {
      const rows = await lessonService.listForStudent(studentId, scope!);
      return rows.filter((l) => l.teacherId === scope!.uid && l.status !== "cancelled");
    },
    enabled: !!scope && !!studentId,
  });
}

/** Lezione → quota che la paga, dalle quote dello studente. */
function paidMap(payments: WithId<Payment>[] | undefined) {
  const map = new Map<string, WithId<Payment>>();
  payments?.forEach((p) => p.lessonIds?.forEach((id) => map.set(id, p)));
  return map;
}

/** La lezione appartiene al costo (stesso corso e, se c'è, stessa materia); le lezioni senza corso valgono per tutti. */
function matchesFee(lesson: Pick<Lesson, "courseId" | "subjectId">, fee: Pick<Fee, "courseId" | "subjectId"> | undefined) {
  if (!fee || !lesson.courseId) return true;
  return lesson.courseId === fee.courseId && (!fee.subjectId || lesson.subjectId === fee.subjectId);
}

const lessonLabel = (l: Pick<Lesson, "date" | "startTime">) =>
  `${formatDate(l.date, "EEE d MMM yyyy")}${l.startTime ? ` · ${l.startTime}` : ""}`;

/** Lezioni non ancora pagate di uno studente, per collegarle a un versamento. */
export function useUnpaidLessons(studentId: string, fee?: Pick<Fee, "courseId" | "subjectId">) {
  const lessons = useMyLessonsOf(studentId);
  const payments = useStudentPayments(studentId);
  const paid = paidMap(payments.data);
  // Fino a due mesi avanti: si può pagare in anticipo, ma non tutto il calendario.
  const horizon = addDays(new Date(), 60).getTime();
  const unpaid = (lessons.data ?? [])
    .filter((l) => !paid.has(l.id) && matchesFee(l, fee) && l.date.toMillis() <= horizon)
    .sort((a, b) => a.date.toMillis() - b.date.toMillis());
  return { unpaid, all: lessons.data ?? [], paid, isPending: lessons.isPending || payments.isPending };
}

/** Lezioni di una quota pagata a cicli: quelle del ciclo, non ancora pagate. */
export function lessonsInPeriod(lessons: PayableLesson[], period?: string) {
  if (!period) return [];
  const start = fromInputDate(period).getTime();
  const end = addDays(fromInputDate(period), CYCLE_DAYS).getTime();
  return lessons.filter((l) => l.date.toMillis() >= start && l.date.toMillis() < end).map((l) => l.id);
}

/** Scelta delle lezioni pagate da un versamento. */
export function LessonChecklist({
  lessons,
  selected,
  onChange,
  loading,
  label = "Lezioni pagate con questo versamento",
}: {
  lessons: PayableLesson[];
  selected: string[];
  onChange: (ids: string[]) => void;
  loading?: boolean;
  label?: string;
}) {
  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Carico le lezioni…
      </p>
    );
  }
  return (
    <CheckList
      label={label}
      items={lessons.map((l) => ({ id: l.id, label: lessonLabel(l), sub: l.title }))}
      selected={selected}
      onChange={onChange}
      emptyText="Nessuna lezione da pagare: sono già tutte pagate."
      maxHeight="max-h-48"
    />
  );
}

/** "Pagata" nelle righe delle lezioni. */
export function LessonPaidBadge({ paid }: { paid: boolean }) {
  return paid ? (
    <Pill tone="success">
      <BadgeEuro className="size-3.5" aria-hidden /> Pagata
    </Pill>
  ) : (
    <Pill tone="warning">
      <BadgeEuro className="size-3.5" aria-hidden /> Da pagare
    </Pill>
  );
}

/** Cosa apre il pannello: la domanda "ha pagato?" o direttamente "segna come pagata" su una quota esistente. */
export type LessonPaymentMode = "ask" | "link";

/** Pannello "La lezione è stata pagata?" aperto da elenco, calendario e modifica lezione. */
export function LessonPaymentDialog({
  lesson,
  mode = "ask",
  onOpenChange,
}: {
  lesson: PayableLesson | null;
  mode?: LessonPaymentMode;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <SidePanel
      open={!!lesson}
      onOpenChange={onOpenChange}
      title={mode === "link" ? "Segna come pagata" : "Pagamento della lezione"}
      description={lesson ? `${lesson.studentName} · ${lessonLabel(lesson)}` : undefined}
    >
      {lesson && <LessonPaymentPrompt key={`${lesson.id}-${mode}`} lesson={lesson} mode={mode} onDone={() => onOpenChange(false)} />}
    </SidePanel>
  );
}

/** Quote dello studente in ordine di pertinenza: stessa materia della lezione, ciclo che la contiene, poi le più vecchie. */
function rankPayments(payments: WithId<Payment>[], lesson: PayableLesson, fee?: WithId<Fee>) {
  const lessonTime = lesson.date.toMillis();
  return payments
    .filter((p) => p.status !== "cancelled")
    .map((p) => {
      const sameFee = !!fee && p.feeId === fee.id;
      const inCycle =
        !!p.period && lessonTime >= fromInputDate(p.period).getTime() && lessonTime < addDays(fromInputDate(p.period), CYCLE_DAYS).getTime();
      return { p, rank: (sameFee ? 2 : 0) + (inCycle ? 1 : 0) };
    })
    .sort((a, b) => b.rank - a.rank || a.p.dueDate.toMillis() - b.p.dueDate.toMillis())
    .map((x) => x.p);
}

const NEW_PAYMENT = "new";

/**
 * Domanda dopo che la lezione è stata segnata come svolta: lo studente ha pagato?
 * Sì → versamento su una quota aperta (proposta quella della materia e del ciclo della lezione) o su una nuova quota.
 */
export function LessonPaymentPrompt({
  lesson,
  mode = "ask",
  onDone,
}: {
  lesson: PayableLesson;
  mode?: LessonPaymentMode;
  onDone: () => void;
}) {
  const owner = useMoneyOwner();
  const payments = useStudentPayments(lesson.studentId);
  const fees = useMyFees(lesson.studentId);
  const [answer, setAnswer] = useState<"ask" | "yes" | "link">(mode);

  const ownFees = fees.data ?? [];
  const fee =
    (lesson.courseId ? ownFees.find((f) => f.id === feeId(owner.uid, lesson.studentId, lesson.courseId!, lesson.subjectId)) : undefined) ??
    (ownFees.length === 1 ? ownFees[0] : undefined);
  const paidBy = paidMap(payments.data).get(lesson.id);

  if (payments.isPending || fees.isPending) {
    return (
      <p className="flex min-h-24 items-center justify-center gap-2 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Controllo i pagamenti…
      </p>
    );
  }

  if (paidBy) return <LessonPaidInfo lesson={lesson} payment={paidBy} onDone={onDone} />;

  if (answer === "link") {
    return (
      <LessonLinkForm
        lesson={lesson}
        fee={fee}
        payments={payments.data ?? []}
        onPayInstead={() => setAnswer("yes")}
        onDone={onDone}
      />
    );
  }

  if (answer === "ask") {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-indigo-soft text-brand-ink">
            <BadgeEuro className="size-5" aria-hidden />
          </span>
          <span>
            <span className="block font-semibold">{lesson.studentName} ha pagato questa lezione?</span>
            <span className="block text-sm text-muted-foreground">
              {fee?.lessonPrice ? `Costo a lezione: ${formatCurrency(fee.lessonPrice)}` : "Puoi registrare anche un importo parziale."}
            </span>
          </span>
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onDone}>
            No, non ancora
          </Button>
          <Button onClick={() => setAnswer("yes")}>Sì, ha pagato</Button>
        </div>
        <Button variant="ghost" className="w-full" onClick={() => setAnswer("link")}>
          <CircleCheck aria-hidden /> Già pagata con una quota registrata
        </Button>
      </div>
    );
  }

  return <LessonPaymentForm lesson={lesson} fee={fee} payments={payments.data ?? []} onDone={onDone} />;
}

function LessonPaymentForm({
  lesson,
  fee,
  payments,
  onDone,
}: {
  lesson: PayableLesson;
  fee?: WithId<Fee>;
  payments: WithId<Payment>[];
  onDone: () => void;
}) {
  const owner = useMoneyOwner();
  // Quote aperte: prima quella della materia della lezione e del ciclo che la contiene, poi le più vecchie.
  const open = rankPayments(payments, lesson, fee).filter((p) => remainingOf(p) > 0);
  const best = open.find((p) => !fee || !p.feeId || p.feeId === fee.id);

  const [target, setTarget] = useState(best?.id ?? NEW_PAYMENT);
  const chosen = open.find((p) => p.id === target);
  const suggested = fee?.lessonPrice ?? (chosen ? remainingOf(chosen) : undefined);
  const [amount, setAmount] = useState(amountToInput(chosen && suggested ? Math.min(suggested, remainingOf(chosen)) : suggested));
  const [date, setDate] = useState(toInputDate(new Date()));
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  const changeTarget = (id: string) => {
    setTarget(id);
    const p = open.find((x) => x.id === id);
    if (p && amount && parseAmount(amount) > remainingOf(p)) setAmount(amountToInput(remainingOf(p)));
  };

  const save = useStaffMutation(
    async () => {
      const value = parseAmount(amount);
      const installment = {
        amount: value,
        date: fromInputDate(date),
        method,
        notes: `Lezione del ${formatDate(lesson.date, "d MMM")}`,
        lessonIds: [lesson.id],
      };
      if (chosen) return paymentService.addInstallment(chosen.id, installment);
      return paymentService.create(
        {
          studentId: lesson.studentId,
          studentName: lesson.studentName,
          description: `Lezione del ${formatDate(lesson.date, "d MMMM yyyy")}`,
          amount: value,
          dueDate: lesson.date.toDate(),
          fee: fee ?? null,
        },
        owner,
        installment,
      );
    },
    { success: "Pagamento registrato", invalidate: INVALIDATE, onSuccess: onDone },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d+([.,]\d{1,2})?$/.test(amount.trim()) || parseAmount(amount) <= 0) return setError("Importo non valido (es. 30 o 30,50)");
    if (chosen && parseAmount(amount) > remainingOf(chosen) + 0.001) {
      return setError(`Supera il residuo della quota (${formatCurrency(remainingOf(chosen))})`);
    }
    if (!date) return setError("Indica la data del pagamento");
    setError(null);
    save.mutate(undefined);
  };

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <Field label="Su quale quota" hint={fee ? `Materia: ${feeLabel(fee)}` : undefined}>
        {(p) => (
          <NativeSelect {...p} value={target} onChange={(e) => changeTarget(e.target.value)}>
            {open.map((q) => (
              <option key={q.id} value={q.id}>
                {q.description} · residuo {formatCurrency(remainingOf(q))}
              </option>
            ))}
            <option value={NEW_PAYMENT}>Nuova quota per questa lezione</option>
          </NativeSelect>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importo (€)" error={error ?? undefined} required>
          {(p) => <Input {...p} inputMode="decimal" placeholder="30" value={amount} onChange={(e) => setAmount(e.target.value)} />}
        </Field>
        <Field label="Data" required>
          {(p) => <DateInput {...p} value={date} onChange={setDate} />}
        </Field>
      </div>
      <Field label="Metodo" required>
        {(p) => (
          <NativeSelect {...p} value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={save.isPending}>
          Annulla
        </Button>
        <Button type="submit" disabled={save.isPending}>
          {save.isPending && <Loader2 className="animate-spin" aria-hidden />}
          Registra pagamento
        </Button>
      </div>
    </form>
  );
}

/** La lezione risulta pagata: da quale quota, con la possibilità di correggere un collegamento sbagliato. */
function LessonPaidInfo({ lesson, payment, onDone }: { lesson: PayableLesson; payment: WithId<Payment>; onDone: () => void }) {
  const unlink = useStaffMutation(() => paymentService.unlinkLesson(payment.id, lesson.id), {
    success: "Lezione segnata come non pagata",
    invalidate: INVALIDATE,
    onSuccess: onDone,
  });
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-success-soft p-3 text-sm font-medium text-success">
        Lezione pagata con la quota «{payment.description}».
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={unlink.isPending} onClick={() => unlink.mutate(undefined)}>
          {unlink.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />} Non è pagata
        </Button>
        <Button onClick={onDone}>Chiudi</Button>
      </div>
      <p className="text-xs text-muted-foreground">«Non è pagata» toglie solo il collegamento: gli importi incassati sulla quota restano.</p>
    </div>
  );
}

const paymentOptionLabel = (p: WithId<Payment>) => {
  const rest = remainingOf(p);
  const n = p.lessonIds?.length ?? 0;
  return `${p.description} · ${rest > 0 ? `residuo ${formatCurrency(rest)}` : "saldata"}${n ? ` · ${n} ${n === 1 ? "lezione" : "lezioni"}` : ""}`;
};

/**
 * "Segna come pagata": collega la lezione (e, volendo, altre lezioni dello studente) a una quota
 * già registrata, senza nuovo versamento. Serve per le lezioni tenute prima che i versamenti
 * indicassero le lezioni pagate, o pagate con una quota saldata in un'unica volta.
 */
function LessonLinkForm({
  lesson,
  fee,
  payments,
  onPayInstead,
  onDone,
}: {
  lesson: PayableLesson;
  fee?: WithId<Fee>;
  payments: WithId<Payment>[];
  onPayInstead: () => void;
  onDone: () => void;
}) {
  const ranked = rankPayments(payments, lesson, fee);
  const [target, setTarget] = useState(ranked[0]?.id ?? "");
  const chosen = ranked.find((p) => p.id === target);
  const { unpaid, isPending } = useUnpaidLessons(lesson.studentId, fee);
  const choices: PayableLesson[] = unpaid.some((l) => l.id === lesson.id) ? unpaid : [lesson, ...unpaid];
  const [selected, setSelected] = useState<string[]>([lesson.id]);
  const inCycle = lessonsInPeriod(choices, chosen?.period);

  const link = useStaffMutation(() => paymentService.linkLessons(target, selected), {
    success: selected.length === 1 ? "Lezione segnata come pagata" : `${selected.length} lezioni segnate come pagate`,
    invalidate: INVALIDATE,
    onSuccess: onDone,
  });

  if (ranked.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Non ci sono quote registrate per {lesson.studentName}. Registra il pagamento: verrà creata una quota per questa lezione.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onDone}>
            Annulla
          </Button>
          <Button onClick={onPayInstead}>
            <BadgeEuro aria-hidden /> Registra pagamento
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (chosen && selected.length) link.mutate(undefined);
      }}
      noValidate
    >
      <p className="text-sm text-muted-foreground">
        Collega la lezione a una quota già registrata: nessun nuovo incasso, l&apos;importo resta quello della quota.
      </p>
      <Field
        label="Pagata con la quota"
        hint={chosen ? `Incassato ${formatCurrency(chosen.paidAmount ?? 0)} di ${formatCurrency(chosen.amount)}` : undefined}
      >
        {(p) => (
          <NativeSelect {...p} value={target} onChange={(e) => setTarget(e.target.value)}>
            {ranked.map((q) => (
              <option key={q.id} value={q.id}>
                {paymentOptionLabel(q)}
              </option>
            ))}
          </NativeSelect>
        )}
      </Field>
      <LessonChecklist
        lessons={choices}
        selected={selected}
        onChange={setSelected}
        loading={isPending}
        label="Lezioni pagate con questa quota"
      />
      {inCycle.length > 0 && !inCycle.every((id) => selected.includes(id)) && (
        <Button type="button" variant="outline" size="sm" onClick={() => setSelected([...new Set([...selected, ...inCycle])])}>
          Aggiungi le lezioni del ciclo ({inCycle.length})
        </Button>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" onClick={onDone} disabled={link.isPending}>
          Annulla
        </Button>
        <Button type="submit" disabled={link.isPending || !chosen || selected.length === 0}>
          {link.isPending ? <Loader2 className="animate-spin" aria-hidden /> : <CircleCheck aria-hidden />}
          Segna come pagata
        </Button>
      </div>
    </form>
  );
}
