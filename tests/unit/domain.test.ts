import { describe, expect, it } from "vitest";
import { paymentFormSchema, parseAmount } from "@/features/payments/schemas";
import { lessonFormSchema, parseTopics } from "@/features/lessons/schemas";
import { createUserSchema, studentFormSchema } from "@/features/students/schemas";
import { checkFile, safeFileName } from "@/lib/files";
import { buildKeywords, searchToken } from "@/utils/keywords";
import { effectivePaymentStatus, summarizeAttendance } from "@/utils/status";

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

  it("un pagamento saldato richiede data e metodo", () => {
    expect(schema.safeParse({ ...ok, status: "paid" }).success).toBe(false);
    expect(schema.safeParse({ ...ok, status: "paid", paidDate: "2026-10-01", method: "cash" }).success).toBe(true);
  });

  it("un pending con scadenza passata risulta scaduto", () => {
    const now = new Date("2026-09-26T12:00:00");
    expect(effectivePaymentStatus({ status: "pending", dueDate: ts(new Date("2026-09-20")) }, now)).toBe("overdue");
    expect(effectivePaymentStatus({ status: "pending", dueDate: ts(new Date("2026-09-26")) }, now)).toBe("pending");
    expect(effectivePaymentStatus({ status: "paid", dueDate: ts(new Date("2026-09-01")) }, now)).toBe("paid");
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
