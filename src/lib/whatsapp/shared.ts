/**
 * WhatsApp (ADR D24) — logica pura condivisa tra l'app e il worker (`whatsapp-worker/`).
 * Nessun import: il worker la carica direttamente con il type stripping di Node.
 */

/** Fuso orario della scuola: orario dei promemoria e giorno delle lezioni. */
export const WHATSAPP_TIMEZONE = "Europe/Rome";

/** Documenti in `whatsapp/{id}`. */
export const WA_DOC = {
  /** Stato della sessione, scritto solo dal worker. */
  session: "session",
  /** Comando per il worker (collega/disconnetti), scritto dall'admin. */
  control: "control",
  /** Impostazioni dei promemoria, scritte dall'admin. */
  settings: "settings",
  /** Stato interno del worker (ultimo giorno di invio promemoria). */
  reminders: "reminders",
} as const;

/** Il worker aggiorna `heartbeatAt` con questa frequenza; oltre `WA_OFFLINE_AFTER_MS` è considerato spento. */
export const WA_HEARTBEAT_MS = 60_000;
export const WA_OFFLINE_AFTER_MS = 3 * WA_HEARTBEAT_MS;

export const WA_MESSAGE_MAX = 4000;

export const DEFAULT_COUNTRY_CODE = "39";

export const DEFAULT_REMINDER_TEMPLATE =
  "Ciao {nome}! 🎵 Ti ricordo la lezione \"{titolo}\" {quando} alle {ora} con {docente}. A presto!";

/**
 * Servizio di invio (ADR D24/D25):
 * - `whatsapp-web`: worker con WhatsApp Web (numero personale/aziendale collegato col QR)
 * - `zernio`: API ufficiale WhatsApp Cloud tramite Zernio, invio dal server con template approvati
 */
export const WA_PROVIDERS = ["whatsapp-web", "zernio"] as const;
export type WhatsAppProvider = (typeof WA_PROVIDERS)[number];

/** Impostazioni iniziali dei promemoria (prima che l'admin le salvi). */
export const WA_DEFAULT_SETTINGS = {
  provider: "whatsapp-web" as WhatsAppProvider,
  remindersEnabled: false,
  reminderTime: "18:00",
  daysBefore: 1,
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  countryCode: DEFAULT_COUNTRY_CODE,
};

/** Segnaposto disponibili nel testo del promemoria (mostrati nell'interfaccia). */
export const REMINDER_PLACEHOLDERS: Record<string, string> = {
  nome: "Nome dello studente",
  cognome: "Cognome dello studente",
  titolo: "Titolo della lezione",
  quando: "oggi / domani / il giorno della lezione",
  data: "Data della lezione (es. martedì 14 ottobre)",
  ora: "Orario di inizio",
  docente: "Nome del docente",
};

/**
 * Numero in formato internazionale senza "+" (es. "393331234567"), `null` se non valido.
 * Senza prefisso internazionale (+ o 00) viene aggiunto `countryCode`.
 */
export function normalizePhone(raw: string | null | undefined, countryCode = DEFAULT_COUNTRY_CODE): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits = trimmed.replace(/[^\d]/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // già internazionale
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const cc = countryCode.replace(/[^\d]/g, "") || DEFAULT_COUNTRY_CODE;
    // Numeri nazionali con lo 0 iniziale del prefisso di rete (es. UK 07…): lo 0 cade.
    // In Italia lo 0 dei fissi fa parte del numero e resta.
    if (cc !== "39" && digits.startsWith("0")) digits = digits.slice(1);
    digits = cc + digits;
  }
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

/** "Ciao {nome}" + { nome: "Elena" } → "Ciao Elena". I segnaposto sconosciuti restano invariati. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? vars[key] : match));
}

/** Markdown essenziale → formattazione WhatsApp (*grassetto*, _corsivo_, ~barrato~). */
export function markdownToWhatsApp(md: string): string {
  return md
    .replace(/\r\n/g, "\n")
    // Il grassetto passa da un segnaposto, altrimenti il passaggio del corsivo lo trasformerebbe.
    .replace(/^#{1,6}\s+(.+)$/gm, "\u0000$1\u0000")
    .replace(/\*\*(.+?)\*\*/g, "\u0000$1\u0000")
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, "$1_$2_")
    .replace(/\u0000/g, "*")
    .replace(/__(.+?)__/g, "*$1*")
    .replace(/~~(.+?)~~/g, "~$1~")
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/^\s*[-+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Testo WhatsApp di una comunicazione. */
export function announcementMessage(a: { title: string; content: string; authorName?: string }): string {
  const body = `*${a.title.trim()}*\n\n${markdownToWhatsApp(a.content)}${a.authorName ? `\n\n— ${a.authorName}` : ""}`;
  return body.length > WA_MESSAGE_MAX ? `${body.slice(0, WA_MESSAGE_MAX - 1)}…` : body;
}

// ─────────────── Date nel fuso della scuola ───────────────

/** Data (`YYYY-MM-DD`) e ora (`HH:mm`) di un istante nel fuso indicato. */
export function zonedParts(instant: Date, timeZone = WHATSAPP_TIMEZONE): { date: string; time: string } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/** `YYYY-MM-DD` + n giorni (calendario, indipendente dal fuso). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Istante della mezzanotte di `date` nel fuso indicato (gestisce l'ora legale). */
export function zonedDayStart(date: string, timeZone = WHATSAPP_TIMEZONE): Date {
  const [y, m, d] = date.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Differenza tra l'ora locale del fuso e UTC in quel momento; due passaggi per i cambi d'ora.
  const offset = (t: number) => {
    const p = zonedParts(new Date(t), timeZone);
    const [hh, mm] = p.time.split(":").map(Number);
    const [py, pm, pd] = p.date.split("-").map(Number);
    return Date.UTC(py, pm - 1, pd, hh, mm) - t;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return new Date(t);
}

/** "oggi" / "domani" / "martedì 14 ottobre" rispetto a `today` (`YYYY-MM-DD`). */
export function relativeLessonDay(lessonDate: string, today: string, timeZone = WHATSAPP_TIMEZONE): string {
  if (lessonDate === today) return "oggi";
  if (lessonDate === addDays(today, 1)) return "domani";
  return longItalianDate(lessonDate, timeZone);
}

export function longItalianDate(date: string, timeZone = WHATSAPP_TIMEZONE): string {
  return new Intl.DateTimeFormat("it-IT", { timeZone, weekday: "long", day: "numeric", month: "long" }).format(
    zonedDayStart(date, timeZone),
  );
}

/** Promemoria: quando inviarli e quanti giorni prima della lezione. */
export interface ReminderSchedule {
  remindersEnabled: boolean;
  /** `HH:mm` nel fuso della scuola. */
  reminderTime: string;
  /** 0 = il giorno stesso, 1 = il giorno prima, … */
  daysBefore: number;
}

/** Il giro dei promemoria di oggi va eseguito ora? (una sola volta al giorno, anche in ritardo). */
export function reminderRunDue(now: { date: string; time: string }, s: ReminderSchedule, lastRunDate?: string | null) {
  return s.remindersEnabled && /^\d{2}:\d{2}$/.test(s.reminderTime) && now.time >= s.reminderTime && lastRunDate !== now.date;
}

/** ID deterministico: un solo promemoria per lezione e giorno, anche se il worker riparte. */
export const reminderMessageId = (lessonId: string, lessonDate: string) => `reminder_${lessonId}_${lessonDate}`;

// ─────────────── Template WhatsApp Cloud (Zernio, ADR D25) ───────────────
// Con l'API ufficiale i messaggi inviati per primi dalla scuola devono usare un template approvato
// da Meta: testo fisso, variabili {{n}} riempite all'invio. Lingua italiana, categoria UTILITY.

export const ZERNIO_LANGUAGE = "it";

export const ZERNIO_TEMPLATES = {
  reminder: {
    name: "musikademy_promemoria_lezione",
    body: 'Ciao {{1}}, ti ricordiamo la lezione "{{2}}" {{3}} alle {{4}} con {{5}}. A presto!',
    example: ["Elena", "Tecnica vocale", "domani", "17:30", "Luca Bianchi"],
  },
  announcement: {
    name: "musikademy_comunicazione",
    body: "Nuova comunicazione da Musikademy: {{1}}\n\n{{2}}\n\nTrovi tutti i dettagli nell'app Musikademy.",
    example: ["Saggio di fine anno", "Il saggio si terrà sabato 14 giugno alle 18 in auditorium."],
  },
} as const;
export type ZernioTemplateKey = keyof typeof ZERNIO_TEMPLATES;

/** Template usato per ogni tipo di messaggio (le prove usano quello delle comunicazioni). */
export const templateForKind = (kind: "announcement" | "reminder" | "test"): ZernioTemplateKey =>
  kind === "reminder" ? "reminder" : "announcement";

/**
 * Valore di una variabile di template: Meta rifiuta a capo, tabulazioni e più di 4 spazi di fila.
 * Il testo viene messo su una riga e accorciato a `max` caratteri.
 */
export function templateParam(text: string, max = 700): string {
  const flat = text
    .replace(/\r?\n+/g, " · ")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/^( · )+|( · )+$/g, "")
    .trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat || "—";
}

/** Variabili del template delle comunicazioni: titolo e testo (Markdown → WhatsApp, su una riga). */
export function announcementParams(a: { title: string; content: string }): string[] {
  return [templateParam(a.title, 140), templateParam(markdownToWhatsApp(a.content))];
}

/** Variabili del template dei promemoria, nell'ordine di ZERNIO_TEMPLATES.reminder. */
export function reminderParams(v: { nome: string; titolo: string; quando: string; ora: string; docente: string }): string[] {
  return [v.nome, v.titolo, v.quando, v.ora, v.docente || "il tuo docente"].map((x) => templateParam(x, 100));
}

/** Testo leggibile di un template con le variabili inserite (registro invii, anteprime). */
export function fillTemplate(key: ZernioTemplateKey, params: string[]): string {
  return ZERNIO_TEMPLATES[key].body.replace(/\{\{(\d+)\}\}/g, (m, n: string) => params[Number(n) - 1] ?? m);
}
