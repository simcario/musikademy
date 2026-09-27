import {
  Timestamp,
  deleteDoc,
  doc,
  getAggregateFromServer,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  sum,
  where,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Installment, Payment, PaymentMethod, PaymentStatus, Student, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { fullName } from "@/utils/format";
import { monthlyDueDate, paidAmountOf, periodLabel, remainingOf, storedPaymentStatus } from "@/utils/status";
import { COLLECTIONS, clean, col, list, paginate, ref, timestamps, touched } from "./base";

/** Dati della quota (il dovuto). I versamenti si gestiscono a parte. */
export interface PaymentInput {
  studentId: string;
  studentName: string;
  description: string;
  amount: number;
  dueDate: Date;
  cancelled?: boolean;
  notes?: string;
}

export interface InstallmentInput {
  amount: number;
  date: Date;
  method: PaymentMethod;
  notes?: string;
}

export interface PaymentFilters {
  studentId?: string;
  status?: PaymentStatus | "all";
  from?: Date;
  to?: Date;
}

export interface PaymentTotals {
  paid: number;
  pending: number;
  overdue: number;
}

const OPEN_STATUSES: PaymentStatus[] = ["pending", "partial", "overdue"];
const cents = (n: number) => Math.round(n * 100) / 100;
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

function toInstallment(input: InstallmentInput): Installment {
  return clean({
    id: newId(),
    amount: cents(input.amount),
    date: Timestamp.fromDate(input.date),
    method: input.method,
    notes: input.notes || undefined,
  }) as Installment;
}

/** Campi derivati dai versamenti: incassato, stato, data e metodo dell'ultimo versamento. */
function settle(amount: number, installments: Installment[], cancelled: boolean) {
  const paid = cents(installments.reduce((s, i) => s + i.amount, 0));
  const last = [...installments].sort((a, b) => a.date.toMillis() - b.date.toMillis()).at(-1);
  return {
    installments,
    paidAmount: paid,
    status: (cancelled ? "cancelled" : storedPaymentStatus(amount, paid)) as PaymentStatus,
    paidDate: last?.date ?? null,
    method: last?.method ?? null,
  };
}

/** Versamenti di un documento, convertendo le quote "pagate" precedenti ai versamenti (ADR D21). */
function installmentsOf(p: Payment): Installment[] {
  if (p.installments) return p.installments;
  const paid = paidAmountOf(p);
  if (paid <= 0) return [];
  return [{ id: "legacy", amount: paid, date: p.paidDate ?? p.dueDate, method: p.method ?? "other" }];
}

/** Legge, modifica e riscrive una quota in transazione (i versamenti sono un array). */
function mutate(id: string, fn: (p: Payment) => Record<string, unknown>) {
  return runTransaction(firestore(), async (tx) => {
    const r = ref(COLLECTIONS.payments, id);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new AppError("Quota non trovata: forse è stata eliminata.");
    tx.update(r, { ...fn(snap.data() as Payment), ...touched() });
  });
}

export const monthlyPaymentId = (studentId: string, period: string) => `monthly_${studentId}_${period}`;

export const paymentService = {
  /** Studente: solo lettura dei propri pagamenti. */
  listForStudent: (studentId: string) =>
    list<Payment>(COLLECTIONS.payments, where("studentId", "==", studentId), orderBy("dueDate", "desc"), limit(200)),

  page: (f: PaymentFilters, cursor: unknown | null) => {
    const c: QueryConstraint[] = [];
    if (f.studentId) c.push(where("studentId", "==", f.studentId));
    if (f.status === "overdue") {
      // "Scaduto" include le quote non saldate oltre la scadenza (ADR D6).
      c.push(where("status", "in", OPEN_STATUSES), where("dueDate", "<", Timestamp.fromDate(new Date())));
    } else if (f.status && f.status !== "all") {
      c.push(where("status", "==", f.status));
    }
    if (f.from) c.push(where("dueDate", ">=", Timestamp.fromDate(f.from)));
    if (f.to) c.push(where("dueDate", "<=", Timestamp.fromDate(f.to)));
    c.push(orderBy("dueDate", "desc"));
    return paginate<Payment>(COLLECTIONS.payments, c, cursor, 25);
  },

  /** Totali via aggregazione server (nessun download dei documenti). Filtrati per scadenza della quota. */
  async totals(range?: { from: Date; to: Date }): Promise<PaymentTotals> {
    const base = col(COLLECTIONS.payments);
    const agg = (...c: QueryConstraint[]) =>
      getAggregateFromServer(query(base, ...c), { due: sum("amount"), paid: sum("paidAmount") }).then((s) => ({
        due: s.data().due ?? 0,
        paid: s.data().paid ?? 0,
      }));
    const from = range ? [where("dueDate", ">=", Timestamp.fromDate(range.from))] : [];
    const to = (d?: Date) => (d ? [where("dueDate", "<=", Timestamp.fromDate(d))] : []);
    const open = where("status", "in", OPEN_STATUSES);
    const now = new Date();
    const overdueUntil = range && range.to < now ? range.to : now;

    const [all, openTotal, overdue] = await Promise.all([
      agg(...from, ...to(range?.to)),
      agg(open, ...from, ...to(range?.to)),
      agg(open, ...from, where("dueDate", "<", Timestamp.fromDate(overdueUntil))),
    ]);
    const openResidual = cents(openTotal.due - openTotal.paid);
    const overdueResidual = cents(overdue.due - overdue.paid);
    return { paid: cents(all.paid), pending: Math.max(0, cents(openResidual - overdueResidual)), overdue: overdueResidual };
  },

  /** Nuova quota; `payNow` registra subito un versamento (es. lezione pagata sul momento). */
  async create(input: PaymentInput, createdBy: string, payNow?: InstallmentInput) {
    const amount = cents(input.amount);
    if (payNow && cents(payNow.amount) > amount) throw new AppError("Il versamento supera l'importo della quota.");
    const r = doc(col(COLLECTIONS.payments));
    await setDoc(
      r,
      clean({
        studentId: input.studentId,
        studentName: input.studentName,
        description: input.description,
        amount,
        dueDate: Timestamp.fromDate(input.dueDate),
        notes: input.notes || undefined,
        ...settle(amount, payNow ? [toInstallment(payNow)] : [], false),
        createdBy,
        ...timestamps(),
      }),
    );
    return r.id;
  },

  /** Modifica il dovuto; stato e incassato si ricalcolano dai versamenti. */
  update: (id: string, input: Omit<PaymentInput, "studentId" | "studentName">) =>
    mutate(id, (p) => {
      const amount = cents(input.amount);
      const installments = installmentsOf(p);
      if (paidAmountOf(p) > amount) {
        throw new AppError("L'importo non può essere inferiore a quanto già versato: elimina prima qualche versamento.");
      }
      return {
        description: input.description,
        amount,
        dueDate: Timestamp.fromDate(input.dueDate),
        notes: input.notes ?? "",
        ...settle(amount, installments, !!input.cancelled),
      };
    }),

  addInstallment: (id: string, input: InstallmentInput) =>
    mutate(id, (p) => {
      if (p.status === "cancelled") throw new AppError("La quota è annullata: riattivala prima di registrare versamenti.");
      if (cents(input.amount) > remainingOf(p)) throw new AppError("Il versamento supera il residuo da pagare.");
      return settle(p.amount, [...installmentsOf(p), toInstallment(input)], false);
    }),

  removeInstallment: (id: string, installmentId: string) =>
    mutate(id, (p) =>
      settle(p.amount, installmentsOf(p).filter((i) => i.id !== installmentId), p.status === "cancelled"),
    ),

  /** Salda il residuo con un unico versamento in data odierna. */
  markPaid: (id: string, method: PaymentMethod) =>
    mutate(id, (p) => {
      const rest = remainingOf(p);
      if (rest <= 0) return {};
      return settle(p.amount, [...installmentsOf(p), toInstallment({ amount: rest, date: new Date(), method })], false);
    }),

  /**
   * Genera le quote mensili del periodo `YYYY-MM` per gli studenti con un costo impostato.
   * ID deterministico: rilanciarla non crea doppioni né tocca le quote esistenti.
   */
  async generateMonthly(students: WithId<Student>[], period: string, createdBy: string) {
    const eligible = students.filter((s) => s.status === "active" && (s.fee?.monthlyAmount ?? 0) > 0);
    let created = 0;
    await runTransaction(firestore(), async (tx) => {
      created = 0;
      const refs = eligible.map((s) => ref(COLLECTIONS.payments, monthlyPaymentId(s.id, period)));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      eligible.forEach((s, i) => {
        if (snaps[i].exists()) return;
        const fee = s.fee!;
        const amount = cents(fee.monthlyAmount);
        const detail = fee.lessonPrice && fee.lessonsPerMonth ? ` (${fee.lessonsPerMonth} lezioni)` : "";
        tx.set(refs[i], {
          studentId: s.id,
          studentName: fullName(s),
          description: `Quota ${periodLabel(period).toLowerCase()}${detail}`,
          amount,
          paidAmount: 0,
          installments: [],
          period,
          dueDate: Timestamp.fromDate(monthlyDueDate(period, fee.dueDay)),
          status: "pending",
          notes: "",
          createdBy,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        created++;
      });
    });
    return { created, existing: eligible.length - created, withoutFee: students.length - eligible.length };
  },

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.payments, id)),
};
