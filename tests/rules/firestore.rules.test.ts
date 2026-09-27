/**
 * Security Rules — verifica che l'isolamento dei dati regga anche interrogando Firestore
 * direttamente (§39). Esegui con: npm run test:rules  (richiede Java 11+ per l'emulatore)
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const ALICE = "alice"; // studente del corso "pop"
const BOB = "bob"; // altro studente
const TEACHER = "teacher1";

const as = (uid: string, role?: string) =>
  env.authenticatedContext(uid, role ? { role } : {}).firestore();
const student = (uid: string) => as(uid, "student");
const teacher = () => as(TEACHER, "teacher");
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-vocalia",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const date = Timestamp.fromDate(new Date());
    for (const uid of [ALICE, BOB]) {
      await setDoc(doc(db, "users", uid), { uid, name: uid, surname: "X", email: `${uid}@t.it`, role: "student", active: true });
      await setDoc(doc(db, "students", uid), { userId: uid, name: uid, surname: "X", courseIds: uid === ALICE ? ["pop"] : ["lirica"], status: "active" });
      await setDoc(doc(db, "lessons", `l-${uid}`), { studentId: uid, teacherId: TEACHER, title: "Lezione", date, status: "scheduled", materialIds: [] });
      await setDoc(doc(db, "attendance", `l-${uid}`), { lessonId: `l-${uid}`, studentId: uid, status: "present", lessonDate: date });
      await setDoc(doc(db, "payments", `p-${uid}`), { studentId: uid, amount: 100, dueDate: date, status: "pending" });
      await setDoc(doc(db, "assignments", `a-${uid}`), { studentId: uid, title: "Esercizio", status: "todo", materialIds: [] });
    }
    await setDoc(doc(db, "studentNotes", ALICE), { notes: "privato" });
    await setDoc(doc(db, "materials", "m-all"), { title: "Per tutti", visibility: "all", studentIds: [], storagePath: "x" });
    await setDoc(doc(db, "materials", "m-pop"), { title: "Pop", visibility: "course", courseId: "pop", studentIds: [], storagePath: "x" });
    await setDoc(doc(db, "materials", "m-lirica"), { title: "Lirica", visibility: "course", courseId: "lirica", studentIds: [], storagePath: "x" });
    await setDoc(doc(db, "materials", "m-bob"), { title: "Bob", visibility: "student", studentIds: [BOB], storagePath: "x" });
    await setDoc(doc(db, "announcements", "an-all"), { title: "T", content: "C", targetType: "all" });
    await setDoc(doc(db, "announcements", "an-bob"), { title: "T", content: "C", targetType: "student", targetId: BOB });
  });
});

describe("accesso non autenticato", () => {
  it("non legge nulla", async () => {
    await assertFails(getDoc(doc(anon(), "lessons", `l-${ALICE}`)));
    await assertFails(getDoc(doc(anon(), "materials", "m-all")));
  });
});

describe("studente: isolamento dei dati", () => {
  it("legge il proprio profilo ma non quello degli altri", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "users", ALICE)));
    await assertSucceeds(getDoc(doc(student(ALICE), "students", ALICE)));
    await assertFails(getDoc(doc(student(ALICE), "users", BOB)));
    await assertFails(getDoc(doc(student(ALICE), "students", BOB)));
  });

  it("non può elencare tutti gli studenti", async () => {
    await assertFails(getDocs(collection(student(ALICE), "students")));
  });

  it("non legge le note private del docente", async () => {
    await assertFails(getDoc(doc(student(ALICE), "studentNotes", ALICE)));
  });

  it("legge solo le proprie lezioni (anche via query)", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "lessons", `l-${ALICE}`)));
    await assertFails(getDoc(doc(student(ALICE), "lessons", `l-${BOB}`)));
    await assertSucceeds(getDocs(query(collection(student(ALICE), "lessons"), where("studentId", "==", ALICE))));
    await assertFails(getDocs(collection(student(ALICE), "lessons")));
  });

  it("non modifica le lezioni", async () => {
    await assertFails(updateDoc(doc(student(ALICE), "lessons", `l-${ALICE}`), { title: "Hack" }));
  });

  it("legge ma non modifica le proprie presenze", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "attendance", `l-${ALICE}`)));
    await assertFails(getDoc(doc(student(ALICE), "attendance", `l-${BOB}`)));
    await assertFails(updateDoc(doc(student(ALICE), "attendance", `l-${ALICE}`), { status: "present" }));
  });

  it("legge solo i propri pagamenti e non li modifica", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "payments", `p-${ALICE}`)));
    await assertFails(getDoc(doc(student(ALICE), "payments", `p-${BOB}`)));
    await assertFails(getDocs(collection(student(ALICE), "payments")));
    await assertFails(updateDoc(doc(student(ALICE), "payments", `p-${ALICE}`), { status: "paid" }));
    await assertFails(
      setDoc(doc(student(ALICE), "payments", "fake"), { studentId: ALICE, amount: 0, dueDate: Timestamp.now(), status: "paid" }),
    );
  });

  it("cambia solo lo stato dei propri esercizi", async () => {
    await assertSucceeds(updateDoc(doc(student(ALICE), "assignments", `a-${ALICE}`), { status: "completed", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(student(ALICE), "assignments", `a-${ALICE}`), { title: "Altro" }));
    await assertFails(updateDoc(doc(student(ALICE), "assignments", `a-${ALICE}`), { status: "fatto" }));
    await assertFails(updateDoc(doc(student(ALICE), "assignments", `a-${BOB}`), { status: "completed" }));
  });

  it("vede i materiali per tutti, del proprio corso e assegnati a sé", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "materials", "m-all")));
    await assertSucceeds(getDoc(doc(student(ALICE), "materials", "m-pop")));
    await assertFails(getDoc(doc(student(ALICE), "materials", "m-lirica")));
    await assertFails(getDoc(doc(student(ALICE), "materials", "m-bob")));
    await assertSucceeds(getDoc(doc(student(BOB), "materials", "m-bob")));
    await assertSucceeds(getDocs(query(collection(student(ALICE), "materials"), where("visibility", "==", "all"))));
    await assertFails(getDocs(collection(student(ALICE), "materials")));
  });

  it("non crea materiali", async () => {
    await assertFails(
      setDoc(doc(student(ALICE), "materials", "new"), { title: "X", visibility: "all", category: "altro", studentIds: [], storagePath: "x" }),
    );
  });

  it("legge le comunicazioni pertinenti", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "announcements", "an-all")));
    await assertFails(getDoc(doc(student(ALICE), "announcements", "an-bob")));
    await assertSucceeds(getDoc(doc(student(BOB), "announcements", "an-bob")));
  });

  it("modifica il proprio profilo ma non ruolo, email o stato", async () => {
    await assertSucceeds(updateDoc(doc(student(ALICE), "users", ALICE), { name: "Alice", updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(student(ALICE), "users", ALICE), { role: "admin" }));
    await assertFails(updateDoc(doc(student(ALICE), "users", ALICE), { email: "x@y.it" }));
    await assertFails(updateDoc(doc(student(ALICE), "users", ALICE), { active: false }));
    await assertFails(updateDoc(doc(student(ALICE), "users", BOB), { name: "Hack" }));
  });

  it("un utente senza ruolo non accede ai dati staff", async () => {
    await assertFails(getDocs(collection(as("nobody"), "students")));
  });
});

describe("docente", () => {
  it("legge studenti, pagamenti e note", async () => {
    await assertSucceeds(getDocs(collection(teacher(), "students")));
    await assertSucceeds(getDocs(collection(teacher(), "payments")));
    await assertSucceeds(getDoc(doc(teacher(), "studentNotes", ALICE)));
  });

  it("crea lezioni valide e rifiuta quelle malformate", async () => {
    const ok = { studentId: ALICE, teacherId: TEACHER, title: "Nuova", date: Timestamp.now(), status: "scheduled", materialIds: [] };
    await assertSucceeds(setDoc(doc(teacher(), "lessons", "new"), ok));
    await assertFails(setDoc(doc(teacher(), "lessons", "bad"), { ...ok, status: "boh" }));
    await assertFails(setDoc(doc(teacher(), "lessons", "bad2"), { ...ok, title: "" }));
  });

  it("registra presenze", async () => {
    await assertSucceeds(
      setDoc(doc(teacher(), "attendance", `l-${BOB}`), { lessonId: `l-${BOB}`, studentId: BOB, status: "absent" }),
    );
    await assertFails(setDoc(doc(teacher(), "attendance", "x"), { lessonId: "altro", studentId: BOB, status: "absent" }));
  });

  it("registra pagamenti con importi validi", async () => {
    const p = { studentId: ALICE, amount: 80, dueDate: Timestamp.now(), status: "pending" };
    await assertSucceeds(setDoc(doc(teacher(), "payments", "new"), p));
    await assertFails(setDoc(doc(teacher(), "payments", "neg"), { ...p, amount: -1 }));
    await assertFails(setDoc(doc(teacher(), "payments", "str"), { ...p, amount: "80" }));
  });

  it("registra versamenti parziali senza superare il dovuto", async () => {
    const inst = { id: "i1", amount: 30, date: Timestamp.now(), method: "cash" };
    const p = { studentId: ALICE, amount: 120, dueDate: Timestamp.now(), status: "partial", paidAmount: 30, installments: [inst] };
    await assertSucceeds(setDoc(doc(teacher(), "payments", "partial"), p));
    await assertFails(setDoc(doc(teacher(), "payments", "over"), { ...p, paidAmount: 150 }));
    await assertFails(setDoc(doc(teacher(), "payments", "bad"), { ...p, installments: "x" }));
  });

  it("imposta il costo del corso con valori validi", async () => {
    const ok = { cycleAmount: 120, lessonPrice: 30, lessonsPerCycle: 4, startDate: Timestamp.now(), dueAt: "start" };
    await assertSucceeds(updateDoc(doc(teacher(), "students", ALICE), { fee: ok }));
    await assertSucceeds(updateDoc(doc(teacher(), "students", ALICE), { fee: { cycleAmount: 90, startDate: Timestamp.now(), dueAt: "end" } }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { fee: { ...ok, dueAt: "mese" } }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { fee: { ...ok, cycleAmount: -1 } }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { fee: { ...ok, extra: true } }));
    await assertFails(updateDoc(doc(student(ALICE), "students", ALICE), { fee: ok }));
  });

  it("con un costo nel vecchio formato mensile l'anagrafica resta modificabile", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "students", BOB), { fee: { monthlyAmount: 120, dueDay: 10 } }));
    await assertSucceeds(updateDoc(doc(teacher(), "students", BOB), { name: "Roberto" }));
    await assertFails(updateDoc(doc(teacher(), "students", BOB), { fee: { monthlyAmount: 130, dueDay: 10 } }));
    await assertSucceeds(
      updateDoc(doc(teacher(), "students", BOB), { fee: { cycleAmount: 120, startDate: Timestamp.now(), dueAt: "end" } }),
    );
  });

  it("non crea utenti né cambia ruoli dal client", async () => {
    await assertFails(setDoc(doc(teacher(), "users", "new"), { role: "admin" }));
    await assertFails(updateDoc(doc(teacher(), "users", ALICE), { role: "admin" }));
  });

  it("non gestisce i corsi (solo admin)", async () => {
    await assertFails(setDoc(doc(teacher(), "courses", "c"), { name: "X", active: true, teacherIds: [] }));
    await assertSucceeds(setDoc(doc(as("admin1", "admin"), "courses", "c"), { name: "X", active: true, teacherIds: [] }));
  });
});

describe("inviti", () => {
  it("nessun client legge o scrive gli inviti, nemmeno l'admin", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "invites", "h1"), { uid: ALICE, acceptedAt: null }));
    for (const db of [anon(), student(ALICE), teacher(), as("admin1", "admin")]) {
      await assertFails(getDoc(doc(db, "invites", "h1")));
      await assertFails(getDocs(query(collection(db, "invites"), where("uid", "==", ALICE))));
      await assertFails(setDoc(doc(db, "invites", "h2"), { uid: ALICE, acceptedAt: null }));
    }
  });

  it("lo studente non può segnare da solo l'invito come accettato", async () => {
    await assertFails(updateDoc(doc(student(ALICE), "students", ALICE), { inviteStatus: "accepted" }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { inviteStatus: "accepted" }));
  });
});
