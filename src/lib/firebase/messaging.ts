import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { firebaseApp, firestore } from "./client";

/**
 * Infrastruttura notifiche push (FCM) — opzionale nella V1 (ADR D12).
 * Attiva solo se è configurata NEXT_PUBLIC_FIREBASE_VAPID_KEY; il token viene salvato in
 * users/{uid}/fcmTokens/{token}. L'invio (nuova lezione, promemoria…) sarà affidato a una
 * Cloud Function nella V2.
 */
export const pushConfigured = () => !!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

export async function pushSupported(): Promise<boolean> {
  if (typeof window === "undefined" || !pushConfigured()) return false;
  const { isSupported } = await import("firebase/messaging");
  return isSupported();
}

export async function enablePush(uid: string): Promise<boolean> {
  if (!(await pushSupported())) return false;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;
  const { getMessaging, getToken } = await import("firebase/messaging");
  const registration = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp()), {
    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) return false;
  await setDoc(doc(firestore(), "users", uid, "fcmTokens", token), {
    token,
    userAgent: navigator.userAgent.slice(0, 200),
    createdAt: serverTimestamp(),
  });
  return true;
}
