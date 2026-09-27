/**
 * Storage Rules — lo studente scarica un file solo se può leggere il documento `materials`
 * corrispondente (regola cross-service). Esegui con: npm run test:rules
 */
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, updateDoc } from "firebase/firestore";
import { getMetadata, ref, uploadString } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;
const ALICE = "alice"; // studente del corso "pop"
const BOB = "bob";

const file = (uid: string, materialId: string) =>
  ref(env.authenticatedContext(uid, { role: "student" }).storage(), `materials/${materialId}/file.pdf`);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-musikademy",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "students", ALICE), { courseIds: ["pop"] });
    await setDoc(doc(db, "students", BOB), { courseIds: ["lirica"] });
    const materials = {
      "m-draft": { visibility: "student", studentIds: [] },
      "m-alice": { visibility: "student", studentIds: [ALICE] },
      "m-pop": { visibility: "course", courseId: "pop", studentIds: [] },
    };
    for (const [id, m] of Object.entries(materials)) {
      await setDoc(doc(db, "materials", id), { title: id, category: "dispensa", storagePath: `materials/${id}/file.pdf`, ...m });
      await uploadString(ref(ctx.storage(), `materials/${id}/file.pdf`), "pdf", "raw", { contentType: "application/pdf" });
    }
  });
});

describe("studente: download dei materiali", () => {
  it("scarica i materiali assegnati a sé o al proprio corso", async () => {
    await assertSucceeds(getMetadata(file(ALICE, "m-alice")));
    await assertSucceeds(getMetadata(file(ALICE, "m-pop")));
    await assertFails(getMetadata(file(BOB, "m-alice")));
  });

  it("un materiale non assegnato è negato finché il docente non lo assegna", async () => {
    await assertFails(getMetadata(file(ALICE, "m-draft")));
    await env.withSecurityRulesDisabled((ctx) =>
      updateDoc(doc(ctx.firestore(), "materials", "m-draft"), { studentIds: [ALICE] }),
    );
    await assertSucceeds(getMetadata(file(ALICE, "m-draft")));
    await assertFails(getMetadata(file(BOB, "m-draft")));
  });
});
