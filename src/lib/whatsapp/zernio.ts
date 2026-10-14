import "server-only";
import { ZERNIO_LANGUAGE, sampleVars, transcode, type MessageKind } from "./shared";

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
  const data = (await res.json().catch(() => ({}))) as ZernioErrorBody & T;
  if (!res.ok) throw new ZernioError(errorMessage(data, res.status), res.status, data.code);
  return data;
}

interface ZernioErrorBody {
  error?: string;
  message?: string;
  code?: string;
  /** Errore di Meta passato da Zernio: il dettaglio utile è spesso solo qui. */
  platformError?: {
    code?: number | string;
    error_subcode?: number | string;
    message?: string;
    error_user_msg?: string;
    error_data?: { details?: unknown };
  };
}

/** Messaggio di Zernio + dettaglio di Meta (codice e `error_data.details`), se presenti. */
function errorMessage(data: ZernioErrorBody, status: number) {
  const base = data.error || data.message || `Zernio: errore HTTP ${status}`;
  const p = data.platformError;
  if (!p) return base;
  const details = p.error_data?.details;
  const extra = [
    p.code !== undefined && `codice Meta ${p.code}${p.error_subcode ? `/${p.error_subcode}` : ""}`,
    p.error_user_msg,
    typeof details === "string" ? details : details && JSON.stringify(details),
  ].filter(Boolean);
  return extra.length ? `${base} (${extra.join(" — ")})` : base;
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
  rejected_reason?: string;
}

export async function listTemplates(accountId: string) {
  const { templates } = await zernio<{ templates: ZernioTemplate[] }>(
    `/whatsapp/templates?accountId=${encodeURIComponent(accountId)}`,
  );
  return templates ?? [];
}

/**
 * Invia a Meta per l'approvazione un template (UTILITY, italiano) a partire dal testo con i segnaposto
 * leggibili: la trascodifica produce il corpo {{1}}, {{2}}… e gli esempi richiesti da Meta.
 */
export function createTemplate(accountId: string, name: string, kind: MessageKind, text: string) {
  const t = transcode(text, kind);
  if (t.issues.length) throw new ZernioError(t.issues.join(" "), 400, "INVALID_TEMPLATE");
  const examples = sampleVars(kind);
  const components: unknown[] = [{ type: "body", text: t.body }];
  if (t.order.length) (components[0] as Record<string, unknown>).example = { body_text: [t.order.map((k) => examples[k])] };
  return zernio<{ template: ZernioTemplate }>("/whatsapp/templates", {
    method: "POST",
    body: { accountId, name, category: "UTILITY", language: ZERNIO_LANGUAGE, components },
  });
}

/** Invia un template a un numero (cifre con prefisso internazionale, senza "+"). */
export function sendTemplate(accountId: string, to: string, templateName: string, params: string[]) {
  return zernio<{ success: boolean; data?: { messageId?: string; conversationId?: string } }>("/inbox/conversations", {
    method: "POST",
    body: {
      accountId,
      participantId: to,
      templateName,
      templateLanguage: ZERNIO_LANGUAGE,
      templateParams: params,
    },
  });
}
