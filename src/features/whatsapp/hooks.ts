"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { qk } from "@/hooks/query-keys";
import { WA_OFFLINE_AFTER_MS } from "@/lib/whatsapp/shared";
import { whatsappService } from "@/services/whatsappService";
import type { WhatsAppMessage, WhatsAppSession, WithId } from "@/types";

type Live<T> = { data: T | undefined; error: Error | null; loading: boolean };

/** Sottoscrizione in tempo reale (onSnapshot) con stato loading/error uniforme. */
function useLive<T>(subscribe: (onData: (d: T) => void, onError: (e: Error) => void) => () => void, key: string): Live<T> {
  const [state, setState] = useState<Live<T> & { key: string }>({ data: undefined, error: null, loading: true, key });
  // Reset quando cambia la sottoscrizione (pattern "state from props" senza effetto).
  if (state.key !== key) setState({ data: undefined, error: null, loading: true, key });
  useEffect(
    () =>
      subscribe(
        (data) => setState({ data, error: null, loading: false, key }),
        (error) => setState((s) => ({ ...s, error, loading: false })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` identifica la sottoscrizione
    [key],
  );
  return state;
}

/** Il worker risponde? Ricalcolato ogni 30 s confrontando l'ultimo heartbeat. */
function useWorkerOnline(session: WhatsAppSession | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  if (!session || session.online === false) return false;
  const beat = session.heartbeatAt?.toMillis?.() ?? 0;
  // Timestamp del server ancora in scrittura (null in locale): appena aggiornato.
  return !session.heartbeatAt || now - beat < WA_OFFLINE_AFTER_MS;
}

export function useWhatsAppSession() {
  const live = useLive<WhatsAppSession | null>(whatsappService.watchSession, "session");
  const online = useWorkerOnline(live.data);
  return { ...live, session: live.data ?? null, online, connected: online && live.data?.state === "connected" };
}

export function useWhatsAppMessages(max = 30) {
  return useLive<WithId<WhatsAppMessage>[]>((on, err) => whatsappService.watchRecent(max, on, err), `recent-${max}`);
}

export function useWhatsAppSettings() {
  return useQuery({ queryKey: qk.whatsappSettings(), queryFn: whatsappService.getSettings });
}

/** Stato di Zernio (numero, template in uso e in approvazione): solo con il servizio Zernio attivo. */
export function useZernioStatus(enabled: boolean) {
  return useQuery({ queryKey: ["whatsapp", "zernio"], queryFn: whatsappService.zernioStatus, enabled });
}
