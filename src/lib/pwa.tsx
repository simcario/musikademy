"use client";

import { useEffect, useSyncExternalStore } from "react";
import { toast } from "sonner";
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
 * - "manual": Android senza popup disponibile (browser diverso da Chrome, popup non ancora concesso
 *   o app già installata): si installa dal menu del browser.
 * - null: app aperta come app installata, oppure desktop senza supporto.
 */
export type InstallMode = "prompt" | "ios" | "manual" | null;

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

// Senza popup nativo non si può sapere se l'app è già installata: l'utente può nascondere la voce del menu.
const HINT_HIDDEN_KEY = "musikademy:install-hint-hidden";

function hintHidden() {
  try {
    return localStorage.getItem(HINT_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function hideInstallHint() {
  try {
    localStorage.setItem(HINT_HIDDEN_KEY, "1");
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
  if (isIos()) return "ios";
  return /android/i.test(navigator.userAgent) ? "manual" : null;
}

function getMenuInstallMode(): InstallMode {
  const mode = getInstallMode();
  return mode !== "prompt" && hintHidden() ? null : mode;
}

/**
 * Modalità di installazione disponibile; null quando l'app è aperta come app installata o non è installabile.
 * Con `respectHidden` le istruzioni manuali spariscono dopo "Non mostrare più" (voce del menu profilo).
 */
export function useInstallMode({ respectHidden = false } = {}): InstallMode {
  return useSyncExternalStore(subscribe, respectHidden ? getMenuInstallMode : getInstallMode, () => null);
}

/** Avvia l'installazione: popup nativo se disponibile, altrimenti le istruzioni per il browser in uso. */
export function startInstall(mode: InstallMode, { dismissible = false } = {}) {
  if (mode === "prompt") {
    const event = deferredPrompt;
    if (!event) return;
    // L'evento è monouso: se l'utente rifiuta, il browser ne emetterà uno nuovo più avanti.
    void event
      .prompt()
      .then(() => event.userChoice)
      .finally(() => {
        deferredPrompt = null;
        notify();
      });
    return;
  }
  if (!mode) return;
  toast.info("Installa Musikademy", {
    description:
      mode === "ios"
        ? "Tocca Condividi nel browser, poi «Aggiungi a schermata Home»."
        : "Apri il menu ⋮ del browser e scegli «Installa app» o «Aggiungi a schermata Home».",
    duration: 12_000,
    action: dismissible ? { label: "Non mostrare più", onClick: hideInstallHint } : undefined,
  });
}
