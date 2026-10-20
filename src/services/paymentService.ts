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
  writeBatch,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Fee, Installment, Payment, PaymentMethod, PaymentStatus, StudentFee, WithId } from "@/types";
import { AppError } from "@/utils/errors";
import { cycleDueDate, cycleFee, cycleKey, cycleLabel, cycleStartAt } from "@/utils/cycles";
import { feeId, feeLabel } from "@/utils/fees";
import { paidAmountOf, remainingOf, storedPaymentStatus } from "@/utils/status";
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
  /** Costo (materia) a cui si riferisce la quota; facoltativo. */
  fee?: WithId<Fee> | null;
}

/** Il docente che registra quote e costi: sono suoi, e solo lui li vede (ADR D34). */
export interface MoneyOwner {
  uid: string;
  name: string;
}

/** Costo per docente, studente e materia (o corso, se senza materie). */
export interface FeeInput extends Omit<StudentFee, "startDate"> {
  studentId: string;
  studentName: string;
  courseId: string;
  courseName: string;
  subjectId?: string;
  subjectName?: string;
  startDate: Date;
}

export interface InstallmentInput {
  amount: number;
  date: Date;
  method: PaymentMethod;
  notes?: string;
}

export interface PaymentFilters {
  studentId?: string;
  /** Solo le quote di questo costo (materia). */
  feeId?: string;
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

export { feeId, feeLabel };

/** Quota del ciclo di un costo: ID deterministico, "Genera quote" non crea doppioni. */
export const cyclePaymentId = (fee: string, cycleStart: Date) => `cycle_${fee}_${cycleKey(cycleStart)}`;

/** Campi della quota che la legano al costo (materia) da cui deriva. */
function feeRef(fee: WithId<Fee> | null | undefined) {
  return fee ? { feeId: fee.id, courseId: fee.courseId, subjectName: fee.subjectName ?? fee.courseName } : {};
}

export const feeService = {
  /** I costi del docente (tutti i suoi studenti). */
  listMine: async (uid: string) => {
    const rows = await list<Fee>(COLLECTIONS.fees, where("teacherId", "==", uid));
    return rows.sort((a, b) => a.studentName.localeCompare(b.studentName, "it") || feeLabel(a).localeCompare(feeLabel(b), "it"));
  },

  /** Costi di uno studente: del docente (`teacherId`) o, per lo studente stesso, di tutti i suoi docenti. */
  listForStudent: (studentId: string, teacherId?: string) =>
    list<Fee>(
      COLLECTIONS.fees,
      where("studentId", "==", studentId),
      ...(teacherId ? [where("teacherId", "==", teacherId)] : []),
    ),

  /**
   * Salva il costo. Se cambia materia o corso cambia anche l'ID: il vecchio documento viene
   * eliminato (le quote già generate restano, con il loro riferimento).
   */
  async save(input: FeeInput, owner: MoneyOwner, existing?: WithId<Fee> | null) {
    const id = feeId(owner.uid, input.studentId, input.courseId, input.subjectId);
    const batch = writeBatch(firestore());
    batch.set(
      ref(COLLECTIONS.fees, id),
      clean({
        ...input,
        subjectId: input.subjectId || undefined,
        subjectName: input.subjectId ? input.subjectName : undefined,
        startDate: Timestamp.fromDate(input.startDate),
        teacherId: owner.uid,
        teacherName: owner.name,
        createdAt: existing?.id === id ? existing.createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
    if (existing && existing.id !== id) batch.delete(ref(COLLECTIONS.fees, existing.id));
    await batch.commit();
    return id;
  },

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.fees, id)),
};

export const paymentService = {
  /** Quote di uno studente: lo studente le legge tutte; il docente (`teacherId`) solo le proprie. */
  listForStudent: (studentId: string, teacherId?: string) =>
    list<Payment>(
      COLLECTIONS.payments,
      where("studentId", "==", studentId),
      ...(teacherId ? [where("teacherId", "==", teacherId)] : []),
      orderBy("dueDate", "desc"),
      limit(200),
    ),

  /** Quote del docente `uid`: ognuno, admin compreso, vede solo le proprie (ADR D34). */
  page: (f: PaymentFilters, cursor: unknown | null, uid: string) => {
    const c: QueryConstraint[] = [where("teacherId", "==", uid)];
    if (f.studentId) c.push(where("studentId", "==", f.studentId));
    if (f.feeId) c.push(where("feeId", "==", f.feeId));
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
  async totals(uid: string, range?: { from: Date; to: Date }): Promise<PaymentTotals> {
    const base = query(col(COLLECTIONS.payments), where("teacherId", "==", uid));
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
  async create(input: PaymentInput, owner: MoneyOwner, payNow?: InstallmentInput) {
    const amount = cents(input.amount);
    if (payNow && cents(payNow.amount) > amount) throw new AppError("Il versamento supera l'importo della quota.");
    const r = doc(col(COLLECTIONS.payments));
    await setDoc(
      r,
      clean({
        studentId: input.studentId,
        studentName: input.studentName,
        teacherId: owner.uid,
        teacherName: owner.name,
        ...feeRef(input.fee),
        description: input.description,
        amount,
        dueDate: Timestamp.fromDate(input.dueDate),
        notes: input.notes || undefined,
        ...settle(amount, payNow ? [toInstallment(payNow)] : [], false),
        createdBy: owner.uid,
        ...timestamps(),
      }),
    );
    return r.id;
  },

  /** Modifica il dovuto; stato e incassato si ricalcolano dai versamenti. */
  update: (id: string, input: Omit<PaymentInput, "studentId" | "studentName" | "fee">) =>
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
   * Genera, per ogni costo, la quota del ciclo di 4 settimane che contiene la data `at` (i cicli
   * partono dalla prima lezione). Il chiamante passa solo i costi degli studenti attivi.
   * ID deterministico: rilanciarla non crea doppioni né tocca le quote esistenti.
   */
  async generateCycles(fees: WithId<Fee>[], at: Date, owner: MoneyOwner) {
    const eligible = fees.filter((f) => f.teacherId === owner.uid && cycleFee(f));
    let created = 0;
    await runTransaction(firestore(), async (tx) => {
      created = 0;
      const starts = eligible.map((f) => cycleStartAt(f.startDate.toDate(), at));
      const refs = eligible.map((f, i) => ref(COLLECTIONS.payments, cyclePaymentId(f.id, starts[i])));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      eligible.forEach((fee, i) => {
        if (snaps[i].exists()) return;
        const detail = fee.lessonsPerCycle ? ` (${fee.lessonsPerCycle} lezioni)` : "";
        tx.set(refs[i], {
          studentId: fee.studentId,
          studentName: fee.studentName,
          teacherId: owner.uid,
          teacherName: owner.name,
          ...feeRef(fee),
          description: `Quota ${fee.subjectName ?? fee.courseName} ${cycleLabel(starts[i])}${detail}`,
          amount: cents(fee.cycleAmount),
          paidAmount: 0,
          installments: [],
          period: cycleKey(starts[i]),
          dueDate: Timestamp.fromDate(cycleDueDate(starts[i], fee.dueAt)),
          status: "pending",
          notes: "",
          createdBy: owner.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        created++;
      });
    });
    return { created, existing: eligible.length - created };
  },

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.payments, id)),
};
