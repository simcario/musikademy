/**
 * Inviti di accesso (ADR D20). Il token viaggia solo nel frammento dell'URL (`/invite#<token>`),
 * quindi non finisce nei log del server; in Firestore se ne salva solo l'hash SHA-256.
 */
export const INVITE_TTL_DAYS = 7;

/** Risposta delle API che creano un invito. */
export interface InviteInfo {
  token: string;
  expiresAt: string;
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/; // 32 byte in base64url

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function inviteExpiry(from: Date = new Date()): Date {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export type InviteState = "valid" | "expired" | "accepted";

export function inviteState(invite: { expiresAt: Date; acceptedAt?: Date | null }, now: Date = new Date()): InviteState {
  if (invite.acceptedAt) return "accepted";
  return invite.expiresAt.getTime() <= now.getTime() ? "expired" : "valid";
}

export function inviteUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/invite#${token}`;
}

/** Testo pronto da inviare allo studente (WhatsApp, email, condivisione nativa). */
export function inviteMessage(name: string, url: string, expiresAt: Date): string {
  const until = expiresAt.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
  return (
    `Ciao ${name}! Sei stato invitato sull'app Musikademy.\n` +
    `Apri questo link e accedi con il tuo account Google (valido fino al ${until}):\n${url}`
  );
}

/** Link WhatsApp con testo precompilato. Numeri senza prefisso internazionale = Italia (+39). */
export function whatsappLink(phone: string | undefined, text: string): string {
  let digits = (phone ?? "").trim().replace(/^\+|^00/, "+").replace(/[^\d+]/g, "");
  if (digits && !digits.startsWith("+")) digits = `39${digits}`;
  digits = digits.replace("+", "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
