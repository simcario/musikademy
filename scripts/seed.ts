/**
 * Dati DEMO per lo sviluppo (§50): 1 admin, 2 studenti, 2 corsi, lezioni, presenze,
 * materiali, esercizi, pagamenti, comunicazioni. Tutti i documenti hanno `demo: true`.
 *
 * Per sicurezza gira SOLO sugli emulatori:
 *   npm run emulators          (in un terminale)
 *   npm run seed               (in un altro)
 *
 * Per un progetto remoto di sviluppo serve l'opt-in esplicito SEED_ALLOW_REMOTE=yes
 * (mai sul progetto di produzione).
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { cycleKey, cycleLabel } from "../src/utils/cycles";
import { buildKeywords } from "../src/utils/keywords";
import { initAdmin, usingEmulators } from "./lib/admin-env";

const PASSWORD = "Musikademy2026!";

function day(offset: number, h = 16, m = 30) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(h, m, 0, 0);
  return Timestamp.fromDate(d);
}

async function main() {
  // Sicuro per default: senza opt-in esplicito si scrive solo sugli emulatori locali.
  if (process.env.SEED_ALLOW_REMOTE !== "yes") {
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIREBASE_STORAGE_EMULATOR_HOST ??= "127.0.0.1:9199";
  }
  const { auth, db, projectId } = initAdmin();
  if (!usingEmulators() && process.env.SEED_ALLOW_REMOTE !== "yes") {
    throw new Error(
      "Rifiuto di scrivere dati demo su un progetto reale. Avvia gli emulatori (npm run emulators) " +
        "oppure imposta SEED_ALLOW_REMOTE=yes su un progetto di SVILUPPO.",
    );
  }
  console.log(`Seed su ${projectId}${usingEmulators() ? " (emulatori)" : " (REMOTO)"}…`);
  const now = FieldValue.serverTimestamp();
  const demo = { demo: true };

  async function account(email: string, name: string, surname: string, role: "admin" | "teacher" | "student") {
    const user = await auth.getUserByEmail(email).catch(() =>
      auth.createUser({ email, password: PASSWORD, displayName: `${name} ${surname}`, emailVerified: true }),
    );
    await auth.setCustomUserClaims(user.uid, { role });
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, name, surname, email, phone: "", role, active: true, createdAt: now, updatedAt: now, ...demo,
    });
    return user.uid;
  }

  // ── Persone ──
  const adminId = await account("admin@musikademy.test", "Marco", "Ferri", "admin");
  await db.doc(`teachers/${adminId}`).set({
    userId: adminId, name: "Marco", surname: "Ferri", email: "admin@musikademy.test", courseIds: [], createdAt: now, updatedAt: now, ...demo,
  });

  // ── Corsi ──
  const courses = [
    { id: "demo-canto-moderno", name: "Canto moderno", description: "Tecnica vocale e repertorio pop/rock" },
    { id: "demo-canto-lirico", name: "Canto lirico", description: "Impostazione classica e repertorio operistico" },
  ];
  for (const c of courses) {
    await db.doc(`courses/${c.id}`).set({ name: c.name, description: c.description, active: true, teacherIds: [adminId], createdAt: now, updatedAt: now, ...demo });
  }

  const students = [
    { email: "elena@musikademy.test", name: "Elena", surname: "Russo", courseIds: [courses[0].id], phone: "+39 333 1234567", fee: { cycleAmount: 120, lessonPrice: 30, lessonsPerCycle: 4, startDate: day(-14, 0, 0), dueAt: "end" } },
    { email: "luca@musikademy.test", name: "Luca", surname: "Bianchi", courseIds: [courses[1].id], phone: "", fee: { cycleAmount: 140, startDate: day(-5, 0, 0), dueAt: "start" } },
  ];
  const studentIds: string[] = [];
  for (const s of students) {
    const uid = await account(s.email, s.name, s.surname, "student");
    studentIds.push(uid);
    await db.doc(`students/${uid}`).set({
      userId: uid, name: s.name, surname: s.surname, email: s.email, phone: s.phone, courseIds: s.courseIds, fee: s.fee,
      enrollmentDate: day(-60), status: "active", keywords: buildKeywords(s.name, s.surname, s.email),
      createdAt: now, updatedAt: now, ...demo,
    });
    await db.doc(`studentNotes/${uid}`).set({ notes: "Nota privata demo: visibile solo ai docenti.", updatedAt: now, ...demo });
  }

  // ── Materiali (file placeholder caricati sullo Storage emulator) ──
  const bucket = getStorage().bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
  const materials = [
    { id: "demo-dispensa-respirazione", title: "Respirazione e appoggio", category: "dispensa", type: "pdf", file: "respirazione.pdf", ct: "application/pdf", visibility: "all", studentIds: [] as string[] },
    { id: "demo-vocalizzo-04", title: "Vocalizzo 04 – Agilità e staccato", category: "ascolto", type: "audio", file: "vocalizzo-04.wav", ct: "audio/wav", visibility: "student", studentIds: [studentIds[0]] },
    { id: "demo-base-caruso", title: "Base pianoforte – Caruso", category: "base", type: "audio", file: "caruso.wav", ct: "audio/wav", visibility: "course", courseId: courses[1].id, studentIds: [] },
  ];
  for (const m of materials) {
    const storagePath = `materials/${m.id}/${m.file}`;
    const body = m.type === "audio" ? silentWav(3) : minimalPdf(m.title);
    await bucket.file(storagePath).save(body, { contentType: m.ct }).catch((e) => console.warn(`  (storage) ${m.file}: ${e.message}`));
    await db.doc(`materials/${m.id}`).set({
      title: m.title, description: "Materiale demo", type: m.type, category: m.category, storagePath,
      fileName: m.file, contentType: m.ct, size: body.length, courseId: m.courseId ?? "", createdBy: adminId,
      visibility: m.visibility, studentIds: m.studentIds, keywords: buildKeywords(m.title, m.category),
      createdAt: now, updatedAt: now, ...demo,
    });
  }

  // ── Lezioni + presenze ──
  const lessons = [
    { s: 0, off: -14, title: "Valutazione iniziale e postura", status: "completed", att: "present", notes: "Registro medio ben timbrato." },
    { s: 0, off: -7, title: "Tecnica vocale – Respirazione e appoggio", status: "completed", att: "present", notes: "Ottimo controllo del fiato, curare il rilassamento della mandibola.", mats: ["demo-dispensa-respirazione", "demo-vocalizzo-04"] },
    { s: 0, off: -3, title: "Vocalizzi di riscaldamento", status: "completed", att: "excused" },
    { s: 0, off: 2, title: "Tecnica vocale & registro di petto", status: "scheduled" },
    { s: 1, off: -5, title: "Impostazione repertorio lirico", status: "completed", att: "absent" },
    { s: 1, off: 0, title: "Legato e sostegno", status: "scheduled", h: 18 },
  ] as const;
  for (const [i, l] of lessons.entries()) {
    const id = `demo-lesson-${i + 1}`;
    const s = students[l.s];
    const date = day(l.off, "h" in l ? l.h : 16);
    await db.doc(`lessons/${id}`).set({
      studentId: studentIds[l.s], studentName: `${s.name} ${s.surname}`, teacherId: adminId, teacherName: "Marco Ferri",
      courseId: s.courseIds[0], date, startTime: `${"h" in l ? l.h : 16}:30`, endTime: `${("h" in l ? l.h : 16) + 1}:20`,
      title: l.title, subject: "Canto", topics: ["Respirazione", "Appoggio", "Vocalizzi"], notes: "notes" in l ? l.notes : "",
      materialIds: "mats" in l ? l.mats : [], status: l.status, keywords: buildKeywords(l.title, s.name, s.surname),
      createdAt: now, updatedAt: now, ...demo,
    });
    if ("att" in l) {
      await db.doc(`attendance/${id}`).set({ lessonId: id, studentId: studentIds[l.s], lessonDate: date, status: l.att, createdAt: now, updatedAt: now, ...demo });
    }
  }

  // ── Esercizi ──
  const assignments = [
    { s: 0, title: "Vocalizzo 04 – Agilità e staccato", description: "10 minuti al giorno, rilassando collo e mandibola.", status: "todo", due: 3, lesson: "demo-lesson-2", mats: ["demo-vocalizzo-04"] },
    { s: 0, title: "Respirazione diaframmatica con cannuccia", description: "5 serie al giorno.", status: "in_progress", due: 5, mats: ["demo-dispensa-respirazione"] },
    { s: 0, title: "Riscaldamento posturale", description: "", status: "completed", due: -2, mats: [] },
    { s: 1, title: "Legato su vocali aperte", description: "Scale lente, 15 minuti.", status: "todo", due: 4, mats: ["demo-base-caruso"] },
  ];
  for (const [i, a] of assignments.entries()) {
    const s = students[a.s];
    await db.doc(`assignments/demo-assignment-${i + 1}`).set({
      studentId: studentIds[a.s], studentName: `${s.name} ${s.surname}`, lessonId: a.lesson ?? "", title: a.title,
      description: a.description, materialIds: a.mats, assignedAt: day(-6), dueDate: day(a.due, 23, 59), status: a.status,
      createdBy: adminId, keywords: buildKeywords(a.title, s.name, s.surname), createdAt: now, updatedAt: now, ...demo,
    });
  }

  // ── Pagamenti ──
  // Cicli di 4 settimane dalla prima lezione, versamenti anche parziali (ADR D21):
  // Elena paga lezione per lezione (scadenza a fine ciclo), Luca in anticipo ed è in ritardo.
  type Paid = { amount: number; day: number; method: string; notes?: string };
  const cycle = (s: number, startDay: number) => ({ id: `cycle_${studentIds[s]}_${cycleKey(day(startDay).toDate())}`, label: cycleLabel(day(startDay).toDate()), period: cycleKey(day(startDay).toDate()) });
  const elena = cycle(0, -14);
  const luca = cycle(1, -5);
  const payments = [
    { id: "demo-payment-1", s: 0, description: "Iscrizione annuale", amount: 50, due: -14, paid: [{ amount: 50, day: -14, method: "card" }] as Paid[] },
    { id: elena.id, period: elena.period, s: 0, description: `Quota ${elena.label} (4 lezioni)`, amount: 120, due: 13, paid: [{ amount: 30, day: -14, method: "cash", notes: "1ª lezione" }, { amount: 30, day: -7, method: "cash", notes: "2ª lezione" }] as Paid[] },
    { id: luca.id, period: luca.period, s: 1, description: `Quota ${luca.label}`, amount: 140, due: -5, paid: [] as Paid[] },
  ];
  for (const [i, p] of payments.entries()) {
    const s = students[p.s];
    const installments = p.paid.map((v, j) => ({ id: `demo-${i}-${j}`, amount: v.amount, date: day(v.day, 10), method: v.method, ...(v.notes ? { notes: v.notes } : {}) }));
    const paidAmount = p.paid.reduce((sum, v) => sum + v.amount, 0);
    const last = installments.at(-1);
    await db.doc(`payments/${p.id}`).set({
      ...(p.period ? { period: p.period } : {}),
      studentId: studentIds[p.s], studentName: `${s.name} ${s.surname}`, description: p.description, amount: p.amount,
      paidAmount, installments, dueDate: day(p.due, 0, 0), ...(last ? { paidDate: last.date, method: last.method } : {}),
      status: paidAmount >= p.amount ? "paid" : paidAmount > 0 ? "partial" : "pending",
      notes: "", createdBy: adminId, createdAt: now, updatedAt: now, ...demo,
    });
  }

  // ── Comunicazioni ──
  await db.doc("announcements/demo-ann-1").set({
    title: "Masterclass di canto moderno", content: "Aperte le iscrizioni alla masterclass intensiva. Posti limitati.",
    targetType: "all", targetId: "", createdBy: adminId, authorName: "Marco Ferri", attachments: [],
    publishedAt: day(-1, 9), keywords: buildKeywords("Masterclass di canto moderno"), createdAt: now, updatedAt: now, ...demo,
  });
  await db.doc("announcements/demo-ann-2").set({
    title: "Saggio di fine corso – Lirico", content: "Il saggio si terrà in auditorium. Portate gli spartiti.",
    targetType: "course", targetId: courses[1].id, createdBy: adminId, authorName: "Marco Ferri", attachments: [],
    publishedAt: day(-2, 9), keywords: buildKeywords("Saggio di fine corso Lirico"), createdAt: now, updatedAt: now, ...demo,
  });

  console.log(`\n✓ Dati demo creati. Password per tutti: ${PASSWORD}`);
  console.log("  admin@musikademy.test (admin) · elena@musikademy.test · luca@musikademy.test (studenti)\n");
}

/** WAV PCM mono 8kHz di silenzio (file audio valido e leggerissimo). */
function silentWav(seconds: number) {
  const rate = 8000;
  const samples = rate * seconds;
  const buf = Buffer.alloc(44 + samples);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + samples, 4);
  buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate, 28);
  buf.writeUInt16LE(1, 32);
  buf.writeUInt16LE(8, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(samples, 40);
  buf.fill(128, 44);
  return buf;
}

function minimalPdf(title: string) {
  const text = title.replace(/[()\\]/g, "");
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n` +
      `3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n` +
      `4 0 obj<</Length ${44 + text.length}>>stream\nBT /F1 24 Tf 72 760 Td (${text}) Tj ET\nendstream endobj\n` +
      `5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`,
  );
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
