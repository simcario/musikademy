"use client";

import { useEffect } from "react";

/** Registra il service worker (solo in produzione, per non interferire con l'HMR in sviluppo). */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => undefined);
  }, []);
  return null;
}
