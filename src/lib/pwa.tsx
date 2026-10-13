"use client";

import { useEffect, useSyncExternalStore } from "react";
import { BUILD_ID } from "@/lib/build-info";

/**
 * Registra il service worker (solo in produzione, per non interferire con l'HMR in sviluppo).
 * Il numero di build nell'URL fa installare un nuovo worker, con cache nuova, a ogni rilascio.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(BUILD_ID)}`, { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/**
 * - "prompt": il browser (Chrome/Edge/Android) ha reso disponibile il popup nativo di installazione.
 * - "ios": Safari su iOS non ha un popup, si installa da Condividi → Aggiungi a schermata Home.
 * - null: app già installata oppure browser senza supporto.
 */
export type InstallMode = "prompt" | "ios" | null;

let deferredPrompt: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

// Listener a livello di modulo: l'evento può arrivare prima che React monti i componenti.
// Senza preventDefault il browser resta libero di mostrare anche il proprio invito automatico.
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    deferredPrompt = event as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    installed = true;
    notify();
  });
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos() {
  // iPadOS si presenta come Mac: lo si distingue dal touch.
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

// Su iOS non si può sapere se l'app è già installata: l'utente può nascondere la voce per sempre.
const IOS_HINT_HIDDEN_KEY = "musikademy:install-hint-hidden";

function iosHintHidden() {
  try {
    return localStorage.getItem(IOS_HINT_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** Nasconde definitivamente (su questo dispositivo) la voce di installazione per iOS. */
export function hideIosInstallHint() {
  try {
    localStorage.setItem(IOS_HINT_HIDDEN_KEY, "1");
  } catch {
    // Storage non disponibile (es. navigazione privata): la voce resta visibile.
  }
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getInstallMode(): InstallMode {
  if (installed || isStandalone()) return null;
  if (deferredPrompt) return "prompt";
  return isIos() && !iosHintHidden() ? "ios" : null;
}

/** Modalità di installazione disponibile: null quando l'app è già installata o non installabile. */
export function useInstallMode(): InstallMode {
  return useSyncExternalStore(subscribe, getInstallMode, () => null);
}

/** Apre il popup nativo di installazione; true se l'utente ha accettato. */
export async function promptInstall(): Promise<boolean> {
  const event = deferredPrompt;
  if (!event) return false;
  await event.prompt();
  const { outcome } = await event.userChoice;
  // L'evento è monouso: se l'utente rifiuta, il browser ne emetterà uno nuovo più avanti.
  deferredPrompt = null;
  notify();
  return outcome === "accepted";
}
