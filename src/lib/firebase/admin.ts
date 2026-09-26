import "server-only";
import { applicationDefault, getApp, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Admin SDK — SOLO server. Credenziali:
 * - Firebase App Hosting / Cloud Run: Application Default Credentials automatiche.
 * - Locale: GOOGLE_APPLICATION_CREDENTIALS=percorso/service-account.json
 * - Emulatori: FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST impostati.
 */
function adminApp(): App {
  if (getApps().length) return getApp();
  // Stesso flag del client: con gli emulatori attivi anche l'Admin SDK li usa.
  if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
    process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
  }
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const usingEmulators = !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
  return initializeApp(usingEmulators ? { projectId } : { credential: applicationDefault(), projectId });
}

export const adminAuth = () => getAuth(adminApp());
export const adminDb = () => getFirestore(adminApp());
