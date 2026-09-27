import { describe, expect, it } from "vitest";
import { amountToInput, feeFormSchema, installmentSchema, paymentFormSchema, parseAmount } from "@/features/payments/schemas";
import { lessonFormSchema, parseTopics } from "@/features/lessons/schemas";
import { createUserSchema, studentFormSchema } from "@/features/students/schemas";
import { checkFile, safeFileName } from "@/lib/files";
import { buildKeywords, searchToken } from "@/utils/keywords";
import {
  effectivePaymentStatus,
  monthlyDueDate,
  paidAmountOf,
  periodLabel,
  periodOf,
  remainingOf,
  storedPaymentStatus,
  summarizeAttendance,
} from "@/utils/status";

const ts = (d: Date) => ({ toDate: () => d }) as unknown as import("firebase/firestore").Timestamp;

describe("lezioni", () => {
  const base = {
    studentId: "s1",
    teacherId: "t1",
    date: "2026-09-26",
    title: "Tecnica vocale",
    status: "scheduled" as const,
  };

  it("richiede studente, docente, titolo e data validi", () => {
    expect(lessonFormSchema.safeParse(base).success).toBe(true);
    expect(lessonFormSchema.safeParse({ ...base, studentId: "" }).success).toBe(false);
    expect(lessonFormSchema.safeParse({ ...base, title: "  " }).success).toBe(false);
    expect(lessonFormSchema.safeParse({ ...base, date: "26/09/2026" }).success).toBe(false);
  });

  it("l'orario di fine deve seguire l'inizio", () => {
    expect(lessonFormSchema.safeParse({ ...base, startTime: "16:30", endTime: "17:20" }).success).toBe(true);
    expect(lessonFormSchema.safeParse({ ...base, startTime: "16:30", endTime: "16:00" }).success).toBe(false);
    expect(lessonFormSchema.safeParse({ ...base, startTime: "25:00" }).success).toBe(false);
  });

  it("converte gli argomenti in elenco", () => {
    expect(parseTopics("Respirazione\n- Appoggio\n\n• Vocalizzi")).toEqual(["Respirazione", "Appoggio", "Vocalizzi"]);
  });
});

describe("presenze", () => {
  it("calcola totali e percentuale escludendo le lezioni annullate", () => {
    const s = summarizeAttendance(["present", "present", "absent", "excused", "makeup", "cancelled"]);
    expect(s.total).toBe(5);
    expect(s.present).toBe(3); // il recupero conta come presenza
    expect(s.absent).toBe(1);
    expect(s.excused).toBe(1);
    expect(s.rate).toBe(60);
  });

  it("gestisce l'assenza di dati", () => {
    expect(summarizeAttendance([]).rate).toBe(0);
  });
});

describe("pagamenti", () => {
  const schema = paymentFormSchema;
  const ok = { studentId: "s1", description: "Quota ottobre", amount: "80,50", dueDate: "2026-10-05", status: "pending" as const };

  it("valida importi in formato italiano", () => {
    expect(schema.safeParse(ok).success).toBe(true);
    expect(parseAmount("80,50")).toBe(80.5);
    expect(schema.safeParse({ ...ok, amount: "0" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, amount: "-5" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, amount: "12,345" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, amount: "abc" }).success).toBe(false);
  });

  it("un versamento immediato richiede data e metodo e non supera la quota", () => {
    expect(schema.safeParse({ ...ok, payNowAmount: "30" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, payNowAmount: "30", payNowDate: "2026-10-01", payNowMethod: "cash" }).success).toBe(true);
    expect(schema.safeParse({ ...ok, payNowAmount: "90", payNowDate: "2026-10-01", payNowMethod: "cash" }).success).toBe(false);
  });

  it("un versamento non supera il residuo", () => {
    const s = installmentSchema(90);
    const v = { amount: "30", date: "2026-10-01", method: "cash" };
    expect(s.safeParse(v).success).toBe(true);
    expect(s.safeParse({ ...v, amount: "90" }).success).toBe(true);
    expect(s.safeParse({ ...v, amount: "90,01" }).success).toBe(false);
  });

  it("calcola incassato, residuo e stato dai versamenti", () => {
    expect(paidAmountOf({ amount: 120, paidAmount: 60, status: "partial" })).toBe(60);
    expect(remainingOf({ amount: 120, paidAmount: 60, status: "partial" })).toBe(60);
    expect(remainingOf({ amount: 120, paidAmount: 0, status: "cancelled" })).toBe(0);
    // Documenti precedenti ai versamenti: "paid" senza paidAmount vale l'intero importo.
    expect(paidAmountOf({ amount: 80, status: "paid" })).toBe(80);
    expect(remainingOf({ amount: 80, status: "pending" })).toBe(80);
    expect(storedPaymentStatus(120, 0)).toBe("pending");
    expect(storedPaymentStatus(120, 30)).toBe("partial");
    expect(storedPaymentStatus(120, 120)).toBe("paid");
    expect(storedPaymentStatus(0.3, 0.1 + 0.2)).toBe("paid");
  });

  it("una quota non saldata con scadenza passata risulta scaduta", () => {
    const now = new Date("2026-09-26T12:00:00");
    expect(effectivePaymentStatus({ status: "pending", dueDate: ts(new Date("2026-09-20")) }, now)).toBe("overdue");
    expect(effectivePaymentStatus({ status: "partial", dueDate: ts(new Date("2026-09-20")) }, now)).toBe("overdue");
    expect(effectivePaymentStatus({ status: "partial", dueDate: ts(new Date("2026-09-30")) }, now)).toBe("partial");
    expect(effectivePaymentStatus({ status: "pending", dueDate: ts(new Date("2026-09-26")) }, now)).toBe("pending");
    expect(effectivePaymentStatus({ status: "paid", dueDate: ts(new Date("2026-09-01")) }, now)).toBe("paid");
  });

  it("costo del corso e quote mensili", () => {
    const fee = { lessonPrice: "30", lessonsPerMonth: "4", monthlyAmount: "120", dueDay: "10" };
    expect(feeFormSchema.safeParse(fee).success).toBe(true);
    expect(feeFormSchema.safeParse({ ...fee, lessonPrice: "", lessonsPerMonth: "" }).success).toBe(true);
    expect(feeFormSchema.safeParse({ ...fee, dueDay: "31" }).success).toBe(false);
    expect(feeFormSchema.safeParse({ ...fee, monthlyAmount: "" }).success).toBe(false);
    expect(periodOf(new Date(2026, 0, 15))).toBe("2026-01");
    expect(periodLabel("2026-10")).toBe("Ottobre 2026");
    const due = monthlyDueDate("2026-02", 10);
    expect([due.getFullYear(), due.getMonth(), due.getDate()]).toEqual([2026, 1, 10]);
    expect(amountToInput(80.5)).toBe("80,50");
    expect(amountToInput(120)).toBe("120");
  });
});

describe("studenti", () => {
  it("valida l'anagrafica", () => {
    const v = { name: "Elena", surname: "Russo", email: "ELENA@Scuola.it ", courseIds: [], enrollmentDate: "2026-09-01" };
    const r = studentFormSchema.safeParse(v);
    expect(r.success && r.data.email).toBe("elena@scuola.it");
    expect(studentFormSchema.safeParse({ ...v, phone: "abc" }).success).toBe(false);
  });

  it("l'API rifiuta ruoli non previsti", () => {
    const base = { name: "A", surname: "B", email: "a@b.it" };
    expect(createUserSchema.safeParse({ ...base, role: "student" }).success).toBe(true);
    expect(createUserSchema.safeParse({ ...base, role: "superadmin" }).success).toBe(false);
  });
});

describe("file e ricerca", () => {
  it("valida formato e dimensione dei file", () => {
    expect(checkFile({ name: "a.pdf", size: 1000, type: "application/pdf" })).toMatchObject({ ok: true, type: "pdf" });
    expect(checkFile({ name: "v.m4a", size: 1000, type: "" })).toMatchObject({ ok: true, type: "audio", contentType: "audio/mp4" });
    expect(checkFile({ name: "x.exe", size: 1000, type: "application/x-msdownload" }).ok).toBe(false);
    expect(checkFile({ name: "big.pdf", size: 51 * 1024 * 1024, type: "application/pdf" }).ok).toBe(false);
    expect(checkFile({ name: "empty.png", size: 0, type: "image/png" }).ok).toBe(false);
  });

  it("normalizza i nomi file", () => {
    expect(safeFileName("Vocalizzo n°4 (è).MP3")).toBe("Vocalizzo-n-4-e.mp3");
  });

  it("genera keyword con prefissi e senza accenti", () => {
    const k = buildKeywords("Vocalità", "Élena Russo");
    expect(k).toContain("vo");
    expect(k).toContain("vocalita");
    expect(k).toContain("elena");
    expect(k).toContain("ru");
    expect(searchToken("  Vocàl ")).toBe("vocal");
    expect(searchToken("a")).toBeNull();
  });
});
