import { z } from "zod";

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido")
  .optional()
  .or(z.literal(""));

export const lessonFormSchema = z
  .object({
    studentId: z.string().min(1, "Seleziona uno studente"),
    teacherId: z.string().min(1, "Seleziona il docente"),
    courseId: z.string().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
    startTime: time,
    endTime: time,
    title: z.string().trim().min(1, "Inserisci un titolo").max(140),
    subject: z.string().trim().max(100).optional(),
    topics: z.string().max(2000).optional(),
    notes: z.string().max(5000).optional(),
    status: z.enum(["scheduled", "completed", "cancelled"]),
  })
  .refine((v) => !v.startTime || !v.endTime || v.endTime > v.startTime, {
    path: ["endTime"],
    message: "L'orario di fine deve seguire l'inizio",
  });
export type LessonFormValues = z.infer<typeof lessonFormSchema>;

/** "Respirazione\nAppoggio" → ["Respirazione", "Appoggio"] */
export function parseTopics(text?: string): string[] {
  return (text ?? "")
    .split(/\n|•/)
    .map((t) => t.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Aggiunge un'ora a "HH:mm" (fine lezione proposta); `null` se si supera la mezzanotte. */
export function oneHourAfter(time: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) return null;
  const h = Number(m[1]) + 1;
  return h > 23 ? null : `${String(h).padStart(2, "0")}:${m[2]}`;
}
