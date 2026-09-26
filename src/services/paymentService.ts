import {
  Timestamp,
  addDoc,
  deleteDoc,
  getAggregateFromServer,
  orderBy,
  query,
  sum,
  updateDoc,
  where,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import type { Payment, PaymentMethod, PaymentStatus } from "@/types";
import { COLLECTIONS, clean, col, list, paginate, ref, timestamps, touched } from "./base";

export interface PaymentInput {
  studentId: string;
  studentName: string;
  description: string;
  amount: number;
  dueDate: Date;
  paidDate?: Date;
  method?: PaymentMethod;
  status: PaymentStatus;
  notes?: string;
}

export interface PaymentFilters {
  studentId?: string;
  status?: PaymentStatus | "all";
  from?: Date;
  to?: Date;
}

function toDoc(input: PaymentInput) {
  return clean({
    ...input,
    amount: Math.round(input.amount * 100) / 100,
    dueDate: Timestamp.fromDate(input.dueDate),
    paidDate: input.paidDate ? Timestamp.fromDate(input.paidDate) : undefined,
    method: input.method || undefined,
  });
}

export interface PaymentTotals {
  paid: number;
  pending: number;
  overdue: number;
}

export const paymentService = {
  /** Studente: solo lettura dei propri pagamenti. */
  listForStudent: (studentId: string) =>
    list<Payment>(COLLECTIONS.payments, where("studentId", "==", studentId), orderBy("dueDate", "desc"), limit(200)),

  page: (f: PaymentFilters, cursor: unknown | null) => {
    const c: QueryConstraint[] = [];
    if (f.studentId) c.push(where("studentId", "==", f.studentId));
    if (f.status === "overdue") {
      // "Scaduto" include anche i pending oltre la scadenza (ADR D6).
      c.push(where("status", "in", ["pending", "overdue"]), where("dueDate", "<", Timestamp.fromDate(new Date())));
    } else if (f.status && f.status !== "all") {
      c.push(where("status", "==", f.status));
    }
    if (f.from) c.push(where("dueDate", ">=", Timestamp.fromDate(f.from)));
    if (f.to) c.push(where("dueDate", "<=", Timestamp.fromDate(f.to)));
    c.push(orderBy("dueDate", "desc"));
    return paginate<Payment>(COLLECTIONS.payments, c, cursor, 25);
  },

  /** Totali via aggregazione server (nessun download dei documenti). */
  async totals(range?: { from: Date; to: Date }): Promise<PaymentTotals> {
    const base = col(COLLECTIONS.payments);
    const agg = (...c: QueryConstraint[]) =>
      getAggregateFromServer(query(base, ...c), { total: sum("amount") }).then((s) => s.data().total ?? 0);
    const from = range ? [where("dueDate", ">=", Timestamp.fromDate(range.from))] : [];
    const to = (d?: Date) => (d ? [where("dueDate", "<=", Timestamp.fromDate(d))] : []);
    const open = where("status", "in", ["pending", "overdue"]);
    const now = new Date();
    const overdueUntil = range && range.to < now ? range.to : now;

    const [paid, openTotal, overdue] = await Promise.all([
      agg(where("status", "==", "paid"), ...from, ...to(range?.to)),
      agg(open, ...from, ...to(range?.to)),
      agg(open, ...from, where("dueDate", "<", Timestamp.fromDate(overdueUntil))),
    ]);
    const pending = openTotal;
    return { paid, pending: Math.max(0, pending - overdue), overdue };
  },

  async create(input: PaymentInput, createdBy: string) {
    const r = await addDoc(col(COLLECTIONS.payments), { ...toDoc(input), createdBy, ...timestamps() });
    return r.id;
  },

  update: (id: string, input: PaymentInput) =>
    updateDoc(ref(COLLECTIONS.payments, id), {
      ...toDoc(input),
      paidDate: input.paidDate ? Timestamp.fromDate(input.paidDate) : null,
      method: input.method ?? null,
      notes: input.notes ?? "",
      ...touched(),
    }),

  markPaid: (id: string, method: PaymentMethod) =>
    updateDoc(ref(COLLECTIONS.payments, id), {
      status: "paid",
      method,
      paidDate: Timestamp.fromDate(new Date()),
      ...touched(),
    }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.payments, id)),
};
