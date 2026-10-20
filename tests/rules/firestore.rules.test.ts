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
  deleteDoc,
  or,
  updateDoc,
  where,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const ALICE = "alice"; // studente del corso "pop"
const BOB = "bob"; // studente del corso "lirica"
const TEACHER = "teacher1"; // insegna "pop" (ADR D29)
const TEACHER2 = "teacher2"; // insegna "lirica"
const ADMIN = "admin1";

const as = (uid: string, role?: string) =>
  env.authenticatedContext(uid, role ? { role } : {}).firestore();
const student = (uid: string) => as(uid, "student");
const teacher = () => as(TEACHER, "teacher");
const teacher2 = () => as(TEACHER2, "teacher");
const admin = () => as(ADMIN, "admin");
/** Copia di `o` senza le chiavi indicate (Firestore rifiuta i campi `undefined`). */
const omit = (o: Record<string, unknown>, ...keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
/** Docente di ogni studente nelle fixture. */
const teacherOf = (uid: string) => (uid === ALICE ? TEACHER : TEACHER2);
const anon = () => env.unauthenticatedContext().firestore();

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-musikademy",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const date = Timestamp.fromDate(new Date());
    await setDoc(doc(db, "teachers", TEACHER), { userId: TEACHER, name: "T1", surname: "X", courseIds: ["pop"] });
    await setDoc(doc(db, "teachers", TEACHER2), { userId: TEACHER2, name: "T2", surname: "X", courseIds: ["lirica"] });
    await setDoc(doc(db, "teachers", ADMIN), { userId: ADMIN, name: "A", surname: "X", courseIds: [] });
    await setDoc(doc(db, "users", TEACHER2), { uid: TEACHER2, name: "T2", surname: "X", role: "teacher", active: true });
    for (const uid of [ALICE, BOB]) {
      const t = teacherOf(uid);
      const course = uid === ALICE ? "pop" : "lirica";
      await setDoc(doc(db, "users", uid), { uid, name: uid, surname: "X", email: `${uid}@t.it`, role: "student", active: true });
      await setDoc(doc(db, "students", uid), { userId: uid, name: uid, surname: "X", courseIds: [course], status: "active" });
      await setDoc(doc(db, "lessons", `l-${uid}`), { studentId: uid, teacherId: t, courseId: course, title: "Lezione", date, status: "scheduled", materialIds: [] });
      await setDoc(doc(db, "attendance", `l-${uid}`), { lessonId: `l-${uid}`, studentId: uid, teacherId: t, status: "present", lessonDate: date });
      await setDoc(doc(db, "payments", `p-${uid}`), { studentId: uid, teacherId: t, amount: 100, dueDate: date, status: "pending" });
      await setDoc(doc(db, "assignments", `a-${uid}`), { studentId: uid, title: "Esercizio", status: "todo", materialIds: [], createdBy: t });
    }
    await setDoc(doc(db, "studentNotes", ALICE), { notes: "privato" });
    await setDoc(doc(db, "studentNotes", BOB), { notes: "privato" });
    await setDoc(doc(db, "materials", "m-all"), { title: "Per tutti", visibility: "all", studentIds: [], storagePath: "x", createdBy: ADMIN });
    await setDoc(doc(db, "materials", "m-pop"), { title: "Pop", visibility: "course", courseId: "pop", studentIds: [], storagePath: "x", createdBy: TEACHER });
    await setDoc(doc(db, "materials", "m-lirica"), { title: "Lirica", visibility: "course", courseId: "lirica", studentIds: [], storagePath: "x", createdBy: TEACHER2 });
    await setDoc(doc(db, "materials", "m-bob"), { title: "Bob", visibility: "student", studentIds: [BOB], storagePath: "x", createdBy: TEACHER2 });
    await setDoc(doc(db, "announcements", "an-all"), { title: "T", content: "C", targetType: "all", createdBy: ADMIN });
    await setDoc(doc(db, "announcements", "an-bob"), { title: "T", content: "C", targetType: "student", targetId: BOB, createdBy: TEACHER2 });
    await setDoc(doc(db, "fees", "fee-alice"), { teacherId: TEACHER, studentId: ALICE, courseId: "pop", cycleAmount: 120, startDate: date, dueAt: "start" });
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

describe("docente: isolamento per corso (ADR D29)", () => {
  it("vede solo gli studenti dei suoi corsi, con le loro note e anagrafiche", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "students", ALICE)));
    await assertFails(getDoc(doc(teacher(), "students", BOB)));
    await assertSucceeds(getDocs(query(collection(teacher(), "students"), where("courseIds", "array-contains-any", ["pop"]))));
    await assertFails(getDocs(query(collection(teacher(), "students"), where("courseIds", "array-contains-any", ["pop", "lirica"]))));
    await assertFails(getDocs(collection(teacher(), "students")));
    await assertSucceeds(getDoc(doc(teacher(), "users", ALICE)));
    await assertFails(getDoc(doc(teacher(), "users", BOB)));
    await assertSucceeds(getDoc(doc(teacher(), "users", TEACHER2))); // i colleghi sì
    await assertSucceeds(getDoc(doc(teacher(), "studentNotes", ALICE)));
    await assertFails(getDoc(doc(teacher(), "studentNotes", BOB)));
    await assertFails(updateDoc(doc(teacher(), "users", BOB), { name: "Hack", updatedAt: serverTimestamp() }));
  });

  it("l'admin vede tutti gli studenti", async () => {
    await assertSucceeds(getDocs(collection(admin(), "students")));
    await assertSucceeds(getDoc(doc(admin(), "studentNotes", BOB)));
  });

  it("iscrive e toglie studenti solo dai propri corsi", async () => {
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), "students", ALICE), { courseIds: ["pop", "lirica"] }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { name: "Alice", courseIds: ["pop"] })); // toglie "lirica"
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { name: "Alice", courseIds: ["pop", "lirica", "jazz"] }));
    await assertSucceeds(updateDoc(doc(teacher(), "students", ALICE), { name: "Alice", courseIds: ["lirica"] })); // toglie "pop"
    await assertSucceeds(updateDoc(doc(admin(), "students", BOB), { name: "Bob", courseIds: ["pop", "lirica"] }));
  });

  it("il vecchio costo unico sugli studenti non si scrive più", async () => {
    const fee = { cycleAmount: 120, startDate: Timestamp.now(), dueAt: "start" };
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { fee }));
    await assertFails(updateDoc(doc(admin(), "students", ALICE), { fee }));
  });

  it("vede solo le proprie lezioni, presenze ed esercizi", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "lessons", `l-${ALICE}`)));
    await assertFails(getDoc(doc(teacher(), "lessons", `l-${BOB}`)));
    await assertSucceeds(getDocs(query(collection(teacher(), "lessons"), where("teacherId", "==", TEACHER))));
    await assertFails(getDocs(collection(teacher(), "lessons")));
    await assertSucceeds(getDocs(query(collection(teacher(), "attendance"), where("teacherId", "==", TEACHER))));
    await assertFails(getDoc(doc(teacher(), "attendance", `l-${BOB}`)));
    await assertSucceeds(getDocs(query(collection(teacher(), "assignments"), where("createdBy", "==", TEACHER))));
    await assertFails(getDoc(doc(teacher(), "assignments", `a-${BOB}`)));
    await assertSucceeds(getDocs(collection(admin(), "lessons")));
  });

  it("crea lezioni a proprio nome, per i suoi studenti e nei suoi corsi", async () => {
    const ok = { studentId: ALICE, teacherId: TEACHER, courseId: "pop", subjectId: "canto", subject: "Canto", title: "Nuova", date: Timestamp.now(), status: "scheduled", materialIds: [] };
    await assertSucceeds(setDoc(doc(teacher(), "lessons", "new"), ok));
    await assertSucceeds(setDoc(doc(teacher(), "lessons", "nocourse"), { ...ok, courseId: "" }));
    await assertFails(setDoc(doc(teacher(), "lessons", "other"), { ...ok, teacherId: TEACHER2 }));
    await assertFails(setDoc(doc(teacher(), "lessons", "bob"), { ...ok, studentId: BOB }));
    await assertFails(setDoc(doc(teacher(), "lessons", "lirica"), { ...ok, courseId: "lirica" }));
    await assertFails(setDoc(doc(teacher(), "lessons", "bad"), { ...ok, status: "boh" }));
    await assertFails(setDoc(doc(teacher(), "lessons", "bad2"), { ...ok, title: "" }));
    await assertFails(updateDoc(doc(teacher(), "lessons", `l-${BOB}`), { title: "Hack" }));
    await assertFails(deleteDoc(doc(teacher(), "lessons", `l-${BOB}`)));
    await assertSucceeds(setDoc(doc(admin(), "lessons", "byadmin"), { ...ok, teacherId: TEACHER2, studentId: BOB, courseId: "lirica" }));
  });

  it("registra presenze solo delle proprie lezioni", async () => {
    const att = { lessonId: `l-${ALICE}`, studentId: ALICE, teacherId: TEACHER, status: "absent" };
    await assertSucceeds(setDoc(doc(teacher(), "attendance", `l-${ALICE}`), att));
    await assertFails(setDoc(doc(teacher(), "attendance", `l-${BOB}`), { ...att, lessonId: `l-${BOB}`, studentId: BOB }));
    await assertFails(setDoc(doc(teacher(), "attendance", "x"), { ...att, lessonId: "altro" }));
    await assertFails(setDoc(doc(teacher(), "attendance", `l-${ALICE}`), { ...att, teacherId: TEACHER2 }));
  });

  it("assegna esercizi solo ai propri studenti, a proprio nome", async () => {
    const a = { studentId: ALICE, title: "Scale", status: "todo", materialIds: [], createdBy: TEACHER };
    await assertSucceeds(setDoc(doc(teacher(), "assignments", "new"), a));
    await assertFails(setDoc(doc(teacher(), "assignments", "bob"), { ...a, studentId: BOB }));
    await assertFails(setDoc(doc(teacher(), "assignments", "other"), { ...a, createdBy: TEACHER2 }));
    await assertFails(updateDoc(doc(teacher(), "assignments", `a-${BOB}`), { title: "Hack" }));
  });

  it("libreria separata: legge e modifica solo i propri materiali", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "materials", "m-pop")));
    await assertFails(getDoc(doc(teacher(), "materials", "m-lirica")));
    await assertFails(getDoc(doc(teacher(), "materials", "m-all")));
    await assertSucceeds(getDocs(query(collection(teacher(), "materials"), where("createdBy", "==", TEACHER))));
    await assertFails(getDocs(collection(teacher(), "materials")));
    await assertFails(updateDoc(doc(teacher(), "materials", "m-lirica"), { title: "Hack" }));
    await assertSucceeds(getDoc(doc(admin(), "materials", "m-lirica")));
  });

  it("non rende un materiale visibile a tutta la scuola o a corsi non suoi", async () => {
    const m = { title: "M", category: "altro", studentIds: [], storagePath: "x", createdBy: TEACHER };
    await assertSucceeds(setDoc(doc(teacher(), "materials", "s"), { ...m, visibility: "student" }));
    await assertSucceeds(setDoc(doc(teacher(), "materials", "c"), { ...m, visibility: "course", courseId: "pop" }));
    await assertFails(setDoc(doc(teacher(), "materials", "l"), { ...m, visibility: "course", courseId: "lirica" }));
    await assertFails(setDoc(doc(teacher(), "materials", "a"), { ...m, visibility: "all" }));
    await assertFails(setDoc(doc(teacher(), "materials", "o"), { ...m, visibility: "student", createdBy: TEACHER2 }));
    await assertSucceeds(setDoc(doc(admin(), "materials", "a"), { ...m, visibility: "all", createdBy: ADMIN }));
  });

  it("comunica ai suoi corsi e studenti; legge le proprie e quelle per tutti", async () => {
    const an = { title: "T", content: "C", createdBy: TEACHER };
    await assertSucceeds(getDoc(doc(teacher(), "announcements", "an-all")));
    await assertFails(getDoc(doc(teacher(), "announcements", "an-bob")));
    // Elenco del docente: le sue o quelle per tutti, in un'unica query `or`.
    await assertSucceeds(
      getDocs(query(collection(teacher(), "announcements"), or(where("createdBy", "==", TEACHER), where("targetType", "==", "all")))),
    );
    await assertFails(getDocs(collection(teacher(), "announcements")));
    await assertSucceeds(setDoc(doc(teacher(), "announcements", "c"), { ...an, targetType: "course", targetId: "pop" }));
    await assertSucceeds(setDoc(doc(teacher(), "announcements", "s"), { ...an, targetType: "student", targetId: ALICE }));
    await assertFails(setDoc(doc(teacher(), "announcements", "l"), { ...an, targetType: "course", targetId: "lirica" }));
    await assertFails(setDoc(doc(teacher(), "announcements", "b"), { ...an, targetType: "student", targetId: BOB }));
    await assertFails(setDoc(doc(teacher(), "announcements", "a"), { ...an, targetType: "all" }));
    await assertSucceeds(setDoc(doc(admin(), "announcements", "a"), { ...an, targetType: "all", createdBy: ADMIN }));
  });

  it("gestisce solo i gruppi dei suoi corsi", async () => {
    await assertSucceeds(setDoc(doc(teacher(), "groups", "g1"), { name: "Coro pop", courseId: "pop" }));
    await assertFails(setDoc(doc(teacher(), "groups", "g2"), { name: "Coro lirico", courseId: "lirica" }));
    await assertFails(setDoc(doc(teacher(), "groups", "g3"), { name: "Senza corso" }));
    await assertSucceeds(getDocs(query(collection(teacher(), "groups"), where("courseId", "in", ["pop"]))));
    await assertFails(getDocs(collection(teacher(), "groups")));
    await assertSucceeds(setDoc(doc(admin(), "groups", "g3"), { name: "Senza corso" }));
  });

  it("non crea utenti né cambia ruoli dal client", async () => {
    await assertFails(setDoc(doc(teacher(), "users", "new"), { role: "admin" }));
    await assertFails(updateDoc(doc(teacher(), "users", ALICE), { role: "admin" }));
  });

  it("corsi, materie e abilitazioni li gestisce solo l'admin", async () => {
    const c = { name: "X", active: true, teacherIds: [TEACHER], subjects: [{ id: "s1", name: "Piano", teacherIds: [TEACHER] }] };
    await assertFails(setDoc(doc(teacher(), "courses", "c"), c));
    await assertSucceeds(setDoc(doc(admin(), "courses", "c"), c));
    await assertFails(setDoc(doc(admin(), "courses", "d"), { ...c, subjects: "piano" }));
    await assertFails(updateDoc(doc(teacher(), "teachers", TEACHER), { courseIds: ["pop", "lirica"] }));
    await assertSucceeds(updateDoc(doc(admin(), "teachers", TEACHER), { courseIds: ["pop", "c"] }));
  });
});

describe("economia personale del docente (ADR D29)", () => {
  const quota = { studentId: ALICE, teacherId: TEACHER, amount: 80, dueDate: Timestamp.now(), status: "pending" };

  it("ognuno vede solo le proprie quote, admin compreso", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "payments", `p-${ALICE}`)));
    await assertFails(getDoc(doc(teacher(), "payments", `p-${BOB}`)));
    await assertFails(getDoc(doc(admin(), "payments", `p-${ALICE}`)));
    await assertSucceeds(getDocs(query(collection(teacher(), "payments"), where("teacherId", "==", TEACHER))));
    await assertFails(getDocs(collection(teacher(), "payments")));
    await assertFails(getDocs(collection(admin(), "payments")));
    await assertSucceeds(getDocs(query(collection(admin(), "payments"), where("teacherId", "==", ADMIN))));
    // Quote di uno studente nella sua scheda: solo le proprie.
    await assertSucceeds(
      getDocs(query(collection(teacher(), "payments"), where("studentId", "==", ALICE), where("teacherId", "==", TEACHER))),
    );
  });

  it("registra quote solo a proprio nome e con importi validi", async () => {
    await assertSucceeds(setDoc(doc(teacher(), "payments", "new"), quota));
    await assertFails(setDoc(doc(teacher(), "payments", "other"), { ...quota, teacherId: TEACHER2 }));
    await assertFails(setDoc(doc(teacher(), "payments", "noteacher"), omit(quota, "teacherId")));
    await assertFails(setDoc(doc(teacher(), "payments", "neg"), { ...quota, amount: -1 }));
    await assertFails(setDoc(doc(teacher(), "payments", "str"), { ...quota, amount: "80" }));
    await assertFails(updateDoc(doc(teacher(), "payments", `p-${BOB}`), { amount: 1 }));
    await assertFails(updateDoc(doc(teacher(), "payments", `p-${ALICE}`), { teacherId: TEACHER2 }));
    await assertFails(deleteDoc(doc(admin(), "payments", `p-${ALICE}`)));
    await assertSucceeds(deleteDoc(doc(teacher(), "payments", `p-${ALICE}`)));
  });

  it("registra versamenti parziali senza superare il dovuto", async () => {
    const inst = { id: "i1", amount: 30, date: Timestamp.now(), method: "cash" };
    const p = { ...quota, amount: 120, status: "partial", paidAmount: 30, installments: [inst] };
    await assertSucceeds(setDoc(doc(teacher(), "payments", "partial"), p));
    await assertFails(setDoc(doc(teacher(), "payments", "over"), { ...p, paidAmount: 150 }));
    await assertFails(setDoc(doc(teacher(), "payments", "bad"), { ...p, installments: "x" }));
  });

  it("\"Genera quote\" legge le quote non ancora create", async () => {
    await assertSucceeds(getDoc(doc(teacher(), "payments", "cycle_non_esiste")));
  });

  it("costi per materia: solo propri, nei propri corsi, con valori validi", async () => {
    const fee = {
      teacherId: TEACHER, teacherName: "T1", studentId: ALICE, studentName: "Alice", courseId: "pop", courseName: "Pop",
      subjectId: "piano", subjectName: "Pianoforte", cycleAmount: 120, lessonPrice: 30, lessonsPerCycle: 4,
      startDate: Timestamp.now(), dueAt: "start", createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    };
    await assertSucceeds(setDoc(doc(teacher(), "fees", "f1"), fee));
    // Corso senza materie, senza costo a lezione.
    const plain = omit(fee, "subjectId", "subjectName", "lessonPrice", "lessonsPerCycle");
    await assertSucceeds(setDoc(doc(teacher(), "fees", "f2"), { ...plain, dueAt: "end" }));
    await assertFails(setDoc(doc(teacher(), "fees", "f3"), { ...fee, courseId: "lirica" }));
    await assertFails(setDoc(doc(teacher(), "fees", "f4"), { ...fee, teacherId: TEACHER2 }));
    await assertFails(setDoc(doc(teacher(), "fees", "f5"), { ...fee, dueAt: "mese" }));
    await assertFails(setDoc(doc(teacher(), "fees", "f6"), { ...fee, cycleAmount: 0 }));
    await assertFails(setDoc(doc(teacher(), "fees", "f7"), { ...fee, lessonsPerCycle: 29 }));
    await assertFails(setDoc(doc(teacher(), "fees", "f8"), { ...fee, extra: true }));
    await assertFails(setDoc(doc(teacher2(), "fees", "fee-alice"), { ...fee, teacherId: TEACHER2, courseId: "lirica" }));
    await assertSucceeds(getDoc(doc(teacher(), "fees", "fee-alice")));
    await assertFails(getDoc(doc(teacher2(), "fees", "fee-alice")));
    await assertFails(getDoc(doc(admin(), "fees", "fee-alice")));
    await assertSucceeds(getDocs(query(collection(teacher(), "fees"), where("teacherId", "==", TEACHER))));
    await assertSucceeds(deleteDoc(doc(teacher(), "fees", "f1")));
  });

  it("lo studente legge i propri costi, non quelli degli altri, e non li modifica", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "fees", "fee-alice")));
    await assertSucceeds(getDocs(query(collection(student(ALICE), "fees"), where("studentId", "==", ALICE))));
    await assertFails(getDoc(doc(student(BOB), "fees", "fee-alice")));
    await assertFails(updateDoc(doc(student(ALICE), "fees", "fee-alice"), { cycleAmount: 1 }));
  });
});

describe("cartelle e gruppi (ADR D26)", () => {
  const CORO = "g-coro";
  const material = { title: "M", visibility: "student", category: "altro", studentIds: [], storagePath: "x", createdBy: TEACHER };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "groups", CORO), { name: "Coro", courseId: "pop" });
      await setDoc(doc(db, "groups", "g-altro"), { name: "Altro", courseId: "pop" });
      await updateDoc(doc(db, "students", ALICE), { groupIds: [CORO] });
      await setDoc(doc(db, "materialFolders", "f-coro"), { name: "Coro", studentIds: [], groupIds: [CORO], audience: [CORO], createdBy: TEACHER });
      await setDoc(doc(db, "materialFolders", "f-bob"), { name: "Bob", studentIds: [BOB], groupIds: [], audience: [BOB], createdBy: TEACHER2 });
      await setDoc(doc(db, "materialFolders", "f-privata"), { name: "Privata", studentIds: [], groupIds: [], audience: [], createdBy: TEACHER });
      await setDoc(doc(db, "materials", "m-coro"), { ...material, groupIds: [CORO], audience: [CORO] });
      await setDoc(doc(db, "materials", "m-f-coro"), { ...material, folderId: "f-coro", audience: [CORO] });
      await setDoc(doc(db, "materials", "m-f-bob"), { ...material, folderId: "f-bob", audience: [BOB] });
      await setDoc(doc(db, "materials", "m-f-privata"), { ...material, folderId: "f-privata", audience: [] });
    });
  });

  it("lo studente vede i materiali del proprio gruppo e delle cartelle condivise", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "materials", "m-coro")));
    await assertSucceeds(getDoc(doc(student(ALICE), "materials", "m-f-coro")));
    await assertFails(getDoc(doc(student(BOB), "materials", "m-coro")));
    await assertFails(getDoc(doc(student(BOB), "materials", "m-f-coro")));
    await assertSucceeds(getDoc(doc(student(BOB), "materials", "m-f-bob")));
    await assertFails(getDoc(doc(student(ALICE), "materials", "m-f-bob")));
    await assertFails(getDoc(doc(student(ALICE), "materials", "m-f-privata")));
  });

  it("le query della libreria passano solo con il proprio UID e i propri gruppi", async () => {
    const materials = (uid: string) => collection(student(uid), "materials");
    await assertSucceeds(getDocs(query(materials(ALICE), where("audience", "array-contains-any", [ALICE, CORO]))));
    await assertSucceeds(
      getDocs(query(materials(ALICE), where("folderId", "==", "f-coro"), where("audience", "array-contains-any", [ALICE, CORO]))),
    );
    await assertSucceeds(getDocs(query(materials(BOB), where("audience", "array-contains-any", [BOB]))));
    await assertFails(getDocs(query(materials(BOB), where("audience", "array-contains-any", [BOB, CORO]))));
    await assertFails(getDocs(query(materials(ALICE), where("folderId", "==", "f-bob"))));
  });

  it("lo studente vede solo le cartelle condivise con sé o con un suo gruppo", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "materialFolders", "f-coro")));
    await assertFails(getDoc(doc(student(ALICE), "materialFolders", "f-bob")));
    await assertFails(getDoc(doc(student(ALICE), "materialFolders", "f-privata")));
    await assertSucceeds(
      getDocs(query(collection(student(ALICE), "materialFolders"), where("audience", "array-contains-any", [ALICE, CORO]))),
    );
    await assertFails(getDocs(collection(student(ALICE), "materialFolders")));
    await assertFails(updateDoc(doc(student(ALICE), "materialFolders", "f-coro"), { audience: [ALICE] }));
  });

  it("lo studente legge solo i propri gruppi e non si aggiunge da solo", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "groups", CORO)));
    await assertFails(getDoc(doc(student(ALICE), "groups", "g-altro")));
    await assertFails(getDoc(doc(student(BOB), "groups", CORO)));
    await assertFails(getDocs(collection(student(ALICE), "groups")));
    await assertFails(updateDoc(doc(student(BOB), "students", BOB), { groupIds: [CORO] }));
    await assertFails(setDoc(doc(student(ALICE), "groups", "new"), { name: "X" }));
  });

  it("il docente gestisce gruppi, appartenenze e cartelle", async () => {
    await assertSucceeds(setDoc(doc(teacher(), "groups", "new"), { name: "Nuovo", description: "", courseId: "pop" }));
    await assertFails(setDoc(doc(teacher(), "groups", "bad"), { name: "", courseId: "pop" }));
    // Bob non frequenta i corsi del docente: lo aggiunge al gruppo l'admin.
    await assertFails(updateDoc(doc(teacher(), "students", BOB), { groupIds: [CORO] }));
    await assertSucceeds(updateDoc(doc(admin(), "students", BOB), { groupIds: [CORO] }));
    await assertFails(updateDoc(doc(teacher(), "students", ALICE), { groupIds: "coro" }));
    await assertSucceeds(getDoc(doc(student(BOB), "materials", "m-coro")));
    const folder = { name: "Nuova", studentIds: [], groupIds: [], audience: [], createdBy: TEACHER };
    await assertFails(getDoc(doc(teacher(), "materialFolders", "f-bob")));
    await assertFails(setDoc(doc(teacher(), "materialFolders", "other"), { ...folder, createdBy: TEACHER2 }));
    await assertSucceeds(setDoc(doc(teacher(), "materialFolders", "new"), folder));
    await assertFails(setDoc(doc(teacher(), "materialFolders", "bad"), { ...folder, audience: "tutti" }));
    // Sottocartella: eredita la condivisione della superiore tramite `audience`.
    await assertSucceeds(setDoc(doc(teacher(), "materialFolders", "sub"), { ...folder, parentId: "f-coro", audience: [CORO] }));
    await assertFails(setDoc(doc(teacher(), "materialFolders", "bad2"), { ...folder, parentId: 1 }));
    await assertSucceeds(getDoc(doc(student(ALICE), "materialFolders", "sub")));
    await assertFails(getDoc(doc(student("carla"), "materialFolders", "sub")));
    await assertSucceeds(updateDoc(doc(teacher(), "materials", "m-f-privata"), { folderId: "", audience: [], groupIds: [] }));
    await assertFails(updateDoc(doc(teacher(), "materials", "m-coro"), { audience: "tutti" }));
    // Testi (ADR D27): categoria `testo` e copia del testo sulla traccia associata.
    await assertSucceeds(setDoc(doc(teacher(), "materials", "t-1"), { ...material, category: "testo", content: "# Testo" }));
    await assertSucceeds(updateDoc(doc(teacher(), "materials", "m-coro"), { lyricsId: "t-1", lyrics: "# Testo" }));
    await assertFails(updateDoc(doc(teacher(), "materials", "m-coro"), { lyrics: 1 }));
    await assertFails(updateDoc(doc(student(ALICE), "materials", "m-coro"), { lyrics: "hack" }));
    await assertSucceeds(deleteDoc(doc(teacher(), "materialFolders", "f-privata")));
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

describe("WhatsApp (ADR D24)", () => {
  const admin = () => as("admin1", "admin");
  const settings = { remindersEnabled: true, reminderTime: "18:00", daysBefore: 1, reminderTemplate: "Ciao {nome}", countryCode: "39" };
  const message = (by: string) => ({
    kind: "announcement",
    studentId: ALICE,
    recipientName: "Alice X",
    body: "Ciao",
    status: "queued",
    attempts: 0,
    createdBy: by,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  it("solo l'admin imposta i promemoria, con valori validi", async () => {
    await assertSucceeds(setDoc(doc(admin(), "whatsapp", "settings"), settings));
    await assertFails(setDoc(doc(teacher(), "whatsapp", "settings"), settings));
    await assertFails(setDoc(doc(admin(), "whatsapp", "settings"), { ...settings, reminderTime: "25:00" }));
    await assertFails(setDoc(doc(admin(), "whatsapp", "settings"), { ...settings, extra: true }));
    await assertSucceeds(setDoc(doc(admin(), "whatsapp", "settings"), { ...settings, provider: "zernio" }));
    await assertFails(setDoc(doc(admin(), "whatsapp", "settings"), { ...settings, provider: "altro" }));
    // Salvataggi parziali e testi personalizzati
    await assertSucceeds(setDoc(doc(admin(), "whatsapp", "settings"), { announcementTemplate: "Ciao {nome}" }, { merge: true }));
    await assertFails(setDoc(doc(admin(), "whatsapp", "settings"), { announcementTemplate: "" }, { merge: true }));
    // I template Meta in uso li scrive solo il server
    await assertFails(
      setDoc(doc(admin(), "whatsapp", "settings"), { metaTemplates: { reminder: { name: "x", text: "y" } } }, { merge: true }),
    );
  });

  it("solo l'admin collega o scollega il numero; lo stato lo scrive solo il worker", async () => {
    const cmd = { command: "connect", status: "pending", requestedBy: "admin1", requestedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(admin(), "whatsapp", "control"), cmd));
    await assertFails(setDoc(doc(teacher(), "whatsapp", "control"), { ...cmd, requestedBy: TEACHER }));
    await assertFails(setDoc(doc(admin(), "whatsapp", "control"), { ...cmd, command: "shell" }));
    await assertFails(setDoc(doc(admin(), "whatsapp", "session"), { state: "connected" }));
  });

  it("lo staff legge stato e registro, lo studente no", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "whatsapp", "session"), { state: "connected" }));
    await assertSucceeds(getDoc(doc(teacher(), "whatsapp", "session")));
    await assertFails(getDoc(doc(student(ALICE), "whatsapp", "session")));
    await assertFails(getDocs(collection(student(ALICE), "whatsappMessages")));
  });

  it("lo staff mette in coda, ma non segna come inviato né crea promemoria", async () => {
    await assertSucceeds(setDoc(doc(teacher(), "whatsappMessages", "m1"), message(TEACHER)));
    await assertSucceeds(
      setDoc(doc(teacher(), "whatsappMessages", "m6"), { ...message(TEACHER), templateVars: { nome: "Alice", titolo: "T" } }),
    );
    await assertFails(setDoc(doc(teacher(), "whatsappMessages", "m7"), { ...message(TEACHER), templateVars: "x" }));
    await assertFails(setDoc(doc(teacher(), "whatsappMessages", "m2"), { ...message(TEACHER), status: "sent" }));
    await assertFails(setDoc(doc(teacher(), "whatsappMessages", "m3"), { ...message(TEACHER), kind: "reminder" }));
    await assertFails(setDoc(doc(teacher(), "whatsappMessages", "m4"), { ...message("altro") }));
    await assertFails(setDoc(doc(student(ALICE), "whatsappMessages", "m5"), message(ALICE)));
    await assertFails(updateDoc(doc(teacher(), "whatsappMessages", "m1"), { status: "sent" }));
    // Prova verso un numero libero: solo l'admin (ADR D29).
    const test = { ...omit(message(TEACHER), "studentId"), kind: "test", to: "393331234567" };
    await assertFails(setDoc(doc(teacher(), "whatsappMessages", "t1"), test));
    await assertSucceeds(setDoc(doc(as("admin1", "admin"), "whatsappMessages", "t2"), { ...test, createdBy: "admin1" }));
  });

  it("il docente vede solo i messaggi che ha messo in coda", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "whatsappMessages", "mine"), message(TEACHER));
      await setDoc(doc(ctx.firestore(), "whatsappMessages", "theirs"), message(TEACHER2));
    });
    await assertSucceeds(getDoc(doc(teacher(), "whatsappMessages", "mine")));
    await assertFails(getDoc(doc(teacher(), "whatsappMessages", "theirs")));
    await assertFails(deleteDoc(doc(teacher(), "whatsappMessages", "theirs")));
    await assertSucceeds(getDocs(query(collection(teacher(), "whatsappMessages"), where("createdBy", "==", TEACHER))));
    await assertFails(getDocs(collection(teacher(), "whatsappMessages")));
    await assertSucceeds(getDocs(collection(as("admin1", "admin"), "whatsappMessages")));
  });

  it("riprova solo i messaggi falliti; non elimina quelli in invio", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "whatsappMessages", "f"), { ...message(TEACHER), status: "failed", error: "x" });
      await setDoc(doc(ctx.firestore(), "whatsappMessages", "s"), { ...message(TEACHER), status: "sending" });
    });
    await assertSucceeds(updateDoc(doc(teacher(), "whatsappMessages", "f"), { status: "queued", error: "" }));
    await assertFails(updateDoc(doc(teacher(), "whatsappMessages", "s"), { status: "queued" }));
    await assertFails(deleteDoc(doc(teacher(), "whatsappMessages", "s")));
    await assertSucceeds(deleteDoc(doc(teacher(), "whatsappMessages", "f")));
  });
});
