import "server-only";
import { ZERNIO_LANGUAGE, ZERNIO_TEMPLATES, type ZernioTemplateKey } from "./shared";

/**
 * Client minimo dell'API Zernio (https://zernio.com/api/v1) per WhatsApp Cloud (ADR D25).
 * Chiave: ZERNIO_API_KEY (segreto, solo server). Numero: il primo account WhatsApp collegato su Zernio,
 * oppure ZERNIO_WHATSAPP_ACCOUNT_ID se ce n'è più di uno.
 */
const BASE_URL = "https://zernio.com/api/v1";

export class ZernioError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export const zernioConfigured = () => !!process.env.ZERNIO_API_KEY;

async function zernio<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const key = process.env.ZERNIO_API_KEY;
  if (!key) throw new ZernioError("ZERNIO_API_KEY non configurata sul server.", 500, "NOT_CONFIGURED");
  const res = await fetch(`${BASE_URL}${path}`, {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string; code?: string } & T;
  if (!res.ok) throw new ZernioError(data.error || data.message || `Zernio: errore HTTP ${res.status}`, res.status, data.code);
  return data;
}

export interface ZernioAccount {
  _id: string;
  platform: string;
  displayName?: string;
  username?: string;
  isActive: boolean;
  needsReconnection?: boolean;
  metadata?: { displayPhoneNumber?: string; verifiedName?: string; messagingLimitTier?: string };
}

/** Account WhatsApp da cui inviare. `null` se su Zernio non è collegato nessun numero. */
export async function whatsappAccount(): Promise<ZernioAccount | null> {
  const { accounts } = await zernio<{ accounts: ZernioAccount[] }>("/accounts?platform=whatsapp");
  const wanted = process.env.ZERNIO_WHATSAPP_ACCOUNT_ID;
  const active = accounts.filter((a) => a.platform === "whatsapp" && a.isActive);
  return (wanted ? accounts.find((a) => a._id === wanted) : active[0]) ?? null;
}

export interface ZernioTemplate {
  id: string;
  name: string;
  status: "APPROVED" | "PENDING" | "REJECTED";
  category: string;
  language: string;
}

export async function listTemplates(accountId: string) {
  const { templates } = await zernio<{ templates: ZernioTemplate[] }>(
    `/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`,
  );
  return templates ?? [];
}

/** Invia a Meta per l'approvazione un template di Musikademy (UTILITY, italiano). */
export function createTemplate(accountId: string, key: ZernioTemplateKey) {
  const t = ZERNIO_TEMPLATES[key];
  return zernio<{ template: ZernioTemplate }>("/whatsapp/templates", {
    method: "POST",
    body: {
      accountId,
      name: t.name,
      category: "UTILITY",
      language: ZERNIO_LANGUAGE,
      components: [{ type: "body", text: t.body, example: { body_text: [t.example] } }],
    },
  });
}

/**
 * Invia un template a un numero (cifre con prefisso internazionale, senza "+").
 * Zernio apre la conversazione o riusa quella esistente.
 */
export function sendTemplate(accountId: string, to: string, key: ZernioTemplateKey, params: string[]) {
  return zernio<{ success: boolean; data?: { messageId?: string; conversationId?: string } }>("/inbox/conversations", {
    method: "POST",
    body: {
      accountId,
      participantId: to,
      templateName: ZERNIO_TEMPLATES[key].name,
      templateLanguage: ZERNIO_LANGUAGE,
      templateParams: params,
    },
  });
}
