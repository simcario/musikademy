/**
 * Crea (o promuove) il PRIMO amministratore. Da eseguire una sola volta per progetto.
 *
 *   npm run bootstrap-admin -- --email nome@dominio.it --name Mario --surname Rossi
 *
 * Richiede credenziali Admin (GOOGLE_APPLICATION_CREDENTIALS) oppure gli emulatori attivi.
 * Stampa un link per impostare la password.
 */
import { FieldValue } from "firebase-admin/firestore";
import { initAdmin, usingEmulators } from "./lib/admin-env";

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name") ?? "Amministratore";
  const surname = arg("surname") ?? "";
  if (!email) throw new Error("Uso: npm run bootstrap-admin -- --email <email> [--name N] [--surname C]");

  const { auth, db, projectId } = initAdmin();
  console.log(`Progetto: ${projectId}${usingEmulators() ? " (EMULATORI)" : ""}`);

  const user = await auth.getUserByEmail(email).catch(() => auth.createUser({ email, displayName: `${name} ${surname}`.trim() }));
  await auth.setCustomUserClaims(user.uid, { role: "admin" });

  const now = FieldValue.serverTimestamp();
  const batch = db.batch();
  batch.set(
    db.doc(`users/${user.uid}`),
    { uid: user.uid, name, surname, email, phone: "", role: "admin", active: true, createdAt: now, updatedAt: now },
    { merge: true },
  );
  batch.set(
    db.doc(`teachers/${user.uid}`),
    { userId: user.uid, name, surname, email, courseIds: [], createdAt: now, updatedAt: now },
    { merge: true },
  );
  await batch.commit();

  const link = await auth.generatePasswordResetLink(email);
  console.log(`\n✓ ${email} è amministratore (uid ${user.uid}).`);
  console.log(`Imposta la password da qui:\n${link}\n`);
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
