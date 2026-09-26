import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { connectStorageEmulator, getStorage, type FirebaseStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true";

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

export function firebaseApp(): FirebaseApp {
  if (!app) {
    if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
      throw new Error("Configurazione Firebase mancante: compila .env.local (vedi .env.example).");
    }
    app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  }
  return app;
}

export function firebaseAuth(): Auth {
  if (!auth) {
    auth = getAuth(firebaseApp());
    auth.languageCode = "it";
    if (useEmulators) connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  }
  return auth;
}

export function firestore(): Firestore {
  if (!db) {
    const a = firebaseApp();
    try {
      // Cache persistente su IndexedDB: letture ripetute servite localmente (§49).
      db =
        typeof window === "undefined"
          ? getFirestore(a)
          : initializeFirestore(a, {
              localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
            });
    } catch {
      db = getFirestore(a);
    }
    if (useEmulators) connectFirestoreEmulator(db, "127.0.0.1", 8080);
  }
  return db;
}

export function firebaseStorage(): FirebaseStorage {
  if (!storage) {
    storage = getStorage(firebaseApp());
    if (useEmulators) connectStorageEmulator(storage, "127.0.0.1", 9199);
  }
  return storage;
}
