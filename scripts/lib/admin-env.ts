/**
 * Inizializzazione Admin SDK per gli script CLI (seed, bootstrap).
 * Legge .env.local; con FIRESTORE_EMULATOR_HOST/FIREBASE_AUTH_EMULATOR_HOST usa gli emulatori.
 */
import { existsSync, readFileSync } from "node:fs";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export function loadEnvLocal() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env) && m[2] !== "") process.env[m[1]] = m[2];
  }
}

export function usingEmulators() {
  return !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;
}

export function initAdmin() {
  loadEnvLocal();
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error("NEXT_PUBLIC_FIREBASE_PROJECT_ID mancante (.env.local)");
  if (!getApps().length) {
    initializeApp(usingEmulators() ? { projectId } : { credential: applicationDefault(), projectId });
  }
  return { auth: getAuth(), db: getFirestore(), projectId };
}
