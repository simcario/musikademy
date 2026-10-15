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

describe("cartelle e gruppi (ADR D26)", () => {
  const CORO = "g-coro";
  const material = { title: "M", visibility: "student", category: "altro", studentIds: [], storagePath: "x" };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, "groups", CORO), { name: "Coro" });
      await setDoc(doc(db, "groups", "g-altro"), { name: "Altro" });
      await updateDoc(doc(db, "students", ALICE), { groupIds: [CORO] });
      await setDoc(doc(db, "materialFolders", "f-coro"), { name: "Coro", studentIds: [], groupIds: [CORO], audience: [CORO] });
      await setDoc(doc(db, "materialFolders", "f-bob"), { name: "Bob", studentIds: [BOB], groupIds: [], audience: [BOB] });
      await setDoc(doc(db, "materialFolders", "f-privata"), { name: "Privata", studentIds: [], groupIds: [], audience: [] });
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
    await assertSucceeds(setDoc(doc(teacher(), "groups", "new"), { name: "Nuovo", description: "" }));
    await assertFails(setDoc(doc(teacher(), "groups", "bad"), { name: "" }));
    await assertSucceeds(updateDoc(doc(teacher(), "students", BOB), { groupIds: [CORO] }));
    await assertFails(updateDoc(doc(teacher(), "students", BOB), { groupIds: "coro" }));
    await assertSucceeds(getDoc(doc(student(BOB), "materials", "m-coro")));
    const folder = { name: "Nuova", studentIds: [], groupIds: [], audience: [] };
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

describe("playlist e video online (ADR D29, D30)", () => {
  const CORO = "g-coro";
  const material = { title: "M", visibility: "student", category: "ascolto", studentIds: [], storagePath: "x" };
  const playlist = { title: "Saggio", tracks: [], materialIds: [], studentIds: [], groupIds: [], audience: [] };

  beforeEach(async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await updateDoc(doc(db, "students", ALICE), { groupIds: [CORO] });
      await setDoc(doc(db, "playlists", "p-coro"), {
        ...playlist,
        tracks: [{ id: "t1", title: "Brano", materialIds: ["m-pl"] }],
        materialIds: ["m-pl"],
        groupIds: [CORO],
        audience: [CORO],
      });
      await setDoc(doc(db, "playlists", "p-privata"), playlist);
      // Materiale ricevuto solo tramite la playlist: `playlistAudience` confluisce in `audience`.
      await setDoc(doc(db, "materials", "m-pl"), { ...material, playlistAudience: [CORO], audience: [CORO] });
    });
  });

  it("lo studente vede solo le playlist condivise con sé o con un suo gruppo, e i loro materiali", async () => {
    await assertSucceeds(getDoc(doc(student(ALICE), "playlists", "p-coro")));
    await assertFails(getDoc(doc(student(BOB), "playlists", "p-coro")));
    await assertFails(getDoc(doc(student(ALICE), "playlists", "p-privata")));
    await assertSucceeds(
      getDocs(query(collection(student(ALICE), "playlists"), where("audience", "array-contains-any", [ALICE, CORO]))),
    );
    await assertFails(getDocs(collection(student(ALICE), "playlists")));
    await assertSucceeds(getDoc(doc(student(ALICE), "materials", "m-pl")));
    await assertFails(getDoc(doc(student(BOB), "materials", "m-pl")));
  });

  it("solo lo staff crea e modifica le playlist", async () => {
    await assertFails(updateDoc(doc(student(ALICE), "playlists", "p-coro"), { audience: [ALICE] }));
    await assertFails(setDoc(doc(student(ALICE), "playlists", "new"), playlist));
    await assertSucceeds(setDoc(doc(teacher(), "playlists", "new"), playlist));
    await assertFails(setDoc(doc(teacher(), "playlists", "bad"), { ...playlist, title: "" }));
    await assertFails(setDoc(doc(teacher(), "playlists", "bad2"), { ...playlist, tracks: "x" }));
    await assertSucceeds(updateDoc(doc(teacher(), "materials", "m-pl"), { playlistAudience: [], audience: [] }));
    await assertFails(updateDoc(doc(teacher(), "materials", "m-pl"), { playlistAudience: "tutti" }));
    await assertSucceeds(deleteDoc(doc(teacher(), "playlists", "p-privata")));
  });

  it("un video online ha solo link http(s)", async () => {
    const link = { ...material, category: "video", storagePath: "", size: 0 };
    await assertSucceeds(setDoc(doc(teacher(), "materials", "v1"), { ...link, externalUrl: "https://youtu.be/dQw4w9WgXcQ" }));
    await assertFails(setDoc(doc(teacher(), "materials", "v2"), { ...link, externalUrl: "javascript:alert(1)" }));
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
