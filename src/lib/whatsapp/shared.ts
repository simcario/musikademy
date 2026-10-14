/**
 * WhatsApp (ADR D24/D25) — logica pura condivisa tra l'app, il server e il worker (`whatsapp-worker/`).
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
  /** Impostazioni (servizio, promemoria, testi), scritte dall'admin. */
  settings: "settings",
  /** Stato interno (ultimo giorno di invio promemoria). */
  reminders: "reminders",
} as const;

/** Il worker aggiorna `heartbeatAt` con questa frequenza; oltre `WA_OFFLINE_AFTER_MS` è considerato spento. */
export const WA_HEARTBEAT_MS = 60_000;
export const WA_OFFLINE_AFTER_MS = 3 * WA_HEARTBEAT_MS;

export const WA_MESSAGE_MAX = 4000;

export const DEFAULT_COUNTRY_CODE = "39";

/**
 * Testi predefiniti, scritti per essere approvati da Meta (ADR D25): abbastanza testo fisso per ogni
 * segnaposto, nessun segnaposto all'inizio o alla fine. Si personalizzano da Admin → WhatsApp.
 */
export const DEFAULT_REMINDER_TEMPLATE =
  'Ciao {nome}, ti scriviamo dalla scuola Musikademy per ricordarti la tua prossima lezione "{titolo}", ' +
  "in programma {quando} alle {ora}. Se non puoi partecipare, avvisa il prima possibile il tuo docente. A presto!";

// Solo avviso, senza {testo}: con un segnaposto libero Meta vede un contenitore generico (tipo newsletter)
// e classifica il template come MARKETING (più caro), come è successo a v1 e v2. Avvisare di una novità
// nell'area dell'utente rientra invece nei messaggi di servizio (UTILITY). Il contenuto si legge nell'app.
export const DEFAULT_ANNOUNCEMENT_TEMPLATE =
  'Ciao {nome}, la scuola Musikademy ha pubblicato una nuova comunicazione per il tuo corso: "{titolo}". ' +
  "Puoi leggerla nella tua area dell'app Musikademy.";

/**
 * Testo del template `musikademy_comunicazione_v2`, già registrato su Meta (classificato MARKETING).
 * Resta il riferimento finché l'admin non invia il nuovo testo da Impostazioni → WhatsApp: i parametri
 * si calcolano da questo testo e devono corrispondere al template approvato.
 */
const LEGACY_ANNOUNCEMENT_TEMPLATE =
  "Ciao {nome}, ti scriviamo dalla scuola Musikademy con un aggiornamento sul tuo corso.\n\n" +
  "Oggetto: {titolo}\nDettagli: {testo}\n\nTrovi la comunicazione completa nella tua area dell'app Musikademy.";

/**
 * Servizio di invio (ADR D24/D25):
 * - `whatsapp-web`: worker con WhatsApp Web (numero collegato col QR), testo libero
 * - `zernio`: API ufficiale WhatsApp Cloud tramite Zernio, invio dal server con template approvati
 */
export const WA_PROVIDERS = ["whatsapp-web", "zernio"] as const;
export type WhatsAppProvider = (typeof WA_PROVIDERS)[number];

/** Messaggi con testo personalizzabile. */
export type MessageKind = "reminder" | "announcement";
export const MESSAGE_KINDS: MessageKind[] = ["reminder", "announcement"];

/** Template Meta registrato (Zernio): nome su Meta e testo con i segnaposto leggibili. */
export interface MetaTemplateRef {
  name: string;
  text: string;
}

/** Template Meta in uso prima di ogni personalizzazione. */
export const DEFAULT_META_TEMPLATES: Record<MessageKind, MetaTemplateRef> = {
  reminder: { name: "musikademy_promemoria_lezione_v2", text: DEFAULT_REMINDER_TEMPLATE },
  announcement: { name: "musikademy_comunicazione_v2", text: LEGACY_ANNOUNCEMENT_TEMPLATE },
};

/** Impostazioni iniziali (prima che l'admin le salvi). */
export const WA_DEFAULT_SETTINGS = {
  provider: "whatsapp-web" as WhatsAppProvider,
  remindersEnabled: false,
  reminderTime: "18:00",
  daysBefore: 1,
  /** Testi personalizzati (con WhatsApp Web si usano così; con Zernio diventano template da approvare). */
  reminderTemplate: DEFAULT_REMINDER_TEMPLATE,
  announcementTemplate: DEFAULT_ANNOUNCEMENT_TEMPLATE,
  countryCode: DEFAULT_COUNTRY_CODE,
  /** Zernio: template approvati in uso e quelli in attesa di approvazione (scritti solo dal server). */
  metaTemplates: {} as Partial<Record<MessageKind, MetaTemplateRef>>,
  metaDrafts: {} as Partial<Record<MessageKind, MetaTemplateRef>>,
};

/** Segnaposto disponibili per ogni testo: descrizione ed esempio (interfaccia, anteprima, esempi per Meta). */
export const MESSAGE_PLACEHOLDERS: Record<MessageKind, Record<string, { label: string; example: string }>> = {
  reminder: {
    nome: { label: "Nome dello studente", example: "Elena" },
    cognome: { label: "Cognome dello studente", example: "Rossi" },
    titolo: { label: "Titolo della lezione", example: "Tecnica vocale" },
    quando: { label: "oggi / domani / giorno della lezione", example: "domani" },
    data: { label: "Data della lezione", example: "giovedì 16 ottobre" },
    ora: { label: "Orario di inizio", example: "17:30" },
    docente: { label: "Nome e cognome del docente", example: "Luca Bianchi" },
  },
  announcement: {
    nome: { label: "Nome dello studente", example: "Elena" },
    cognome: { label: "Cognome dello studente", example: "Rossi" },
    titolo: { label: "Titolo della comunicazione", example: "Saggio di fine anno" },
    testo: { label: "Testo della comunicazione", example: "Il saggio si terrà sabato 14 giugno alle 18 in auditorium." },
    autore: { label: "Chi ha scritto la comunicazione", example: "Luca Bianchi" },
  },
};

export const sampleVars = (kind: MessageKind): Record<string, string> =>
  Object.fromEntries(Object.entries(MESSAGE_PLACEHOLDERS[kind]).map(([k, v]) => [k, v.example]));

/** Testo personalizzato da usare per un tipo di messaggio. */
export const messageText = (
  s: { reminderTemplate?: string; announcementTemplate?: string },
  kind: MessageKind,
): string =>
  (kind === "reminder" ? s.reminderTemplate : s.announcementTemplate) ||
  (kind === "reminder" ? DEFAULT_REMINDER_TEMPLATE : DEFAULT_ANNOUNCEMENT_TEMPLATE);

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

/** Testo libero (WhatsApp Web, registro, anteprime): segnaposto sostituiti, lunghezza limitata. */
export function renderMessage(template: string, vars: Record<string, string>): string {
  const body = renderTemplate(template, vars).trim();
  return body.length > WA_MESSAGE_MAX ? `${body.slice(0, WA_MESSAGE_MAX - 1)}…` : body;
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

/** Valori dei segnaposto di una comunicazione per uno studente. */
export function announcementVars(
  a: { title: string; content: string; authorName?: string },
  student: { name?: string; surname?: string },
): Record<string, string> {
  return {
    nome: student.name ?? "",
    cognome: student.surname ?? "",
    titolo: a.title.trim(),
    testo: markdownToWhatsApp(a.content),
    autore: a.authorName ?? "",
  };
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
// da Meta: testo fisso con variabili numerate {{1}}, {{2}}… L'admin scrive il testo con i segnaposto
// leggibili ({nome}, {titolo}…) e `transcode` lo traduce nel formato di Meta (la "trascodifica").

export const ZERNIO_LANGUAGE = "it";

/** Tipo di template usato per ogni tipo di messaggio (le prove usano quello delle comunicazioni). */
export const templateKindOf = (kind: "announcement" | "reminder" | "test"): MessageKind =>
  kind === "reminder" ? "reminder" : "announcement";

/** Parole di testo fisso richieste per ogni segnaposto (Meta rifiuta i template "troppo variabili"). */
export const META_WORDS_PER_VARIABLE = 3;
export const META_MAX_VARIABLES = 10;
const META_BODY_MAX = 1024;

export interface Transcoding {
  /** Testo nel formato di Meta: "Ciao {{1}}, …". */
  body: string;
  /** Segnaposto in ordine di variabile: order[0] → {{1}}, order[1] → {{2}}, … */
  order: string[];
  /** Segnaposto non disponibili per questo tipo di messaggio. */
  unknown: string[];
  /** Problemi che farebbero rifiutare il template da Meta (vuoto = conforme). */
  issues: string[];
}

/**
 * Trascodifica dei segnaposto: "{nome}" → "{{1}}" nell'ordine in cui compaiono.
 * Un segnaposto ripetuto riceve un nuovo numero (Meta vuole variabili consecutive).
 * Controlla anche le regole di formato che Meta applica in approvazione.
 */
export function transcode(text: string, kind: MessageKind): Transcoding {
  const allowed = MESSAGE_PLACEHOLDERS[kind];
  const order: string[] = [];
  const unknown = new Set<string>();
  const body = text.trim().replace(/\{(\w+)\}/g, (m, key: string) => {
    if (!(key in allowed)) {
      unknown.add(key);
      return m;
    }
    order.push(key);
    return `{{${order.length}}}`;
  });

  const issues: string[] = [];
  if (!body) issues.push("Il testo è vuoto.");
  if (unknown.size)
    issues.push(`Segnaposto non disponibili: ${[...unknown].map((k) => `{${k}}`).join(", ")}.`);
  if (body.length > META_BODY_MAX) issues.push(`Il testo supera i ${META_BODY_MAX} caratteri ammessi da Meta.`);
  if (/^[\s\p{P}]*\{\{\d+\}\}/u.test(body)) issues.push("Il testo non può iniziare con un segnaposto.");
  if (/\{\{\d+\}\}[\s\p{P}]*$/u.test(body)) issues.push("Il testo non può finire con un segnaposto: aggiungi una frase dopo.");
  if (/\{\{\d+\}\}[\s\p{P}]*\{\{\d+\}\}/u.test(body))
    issues.push("Due segnaposto non possono stare attaccati: separali con almeno una parola.");
  if (order.length > META_MAX_VARIABLES) issues.push(`Al massimo ${META_MAX_VARIABLES} segnaposto.`);
  const fixedWords = body
    .replace(/\{\{\d+\}\}/g, " ")
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w)).length;
  const needed = META_WORDS_PER_VARIABLE * order.length;
  if (order.length && fixedWords < needed)
    issues.push(
      `Troppi segnaposto per la lunghezza del testo: con ${order.length} segnaposto servono almeno ${needed} parole fisse (ora ${fixedWords}).`,
    );
  return { body, order, unknown: [...unknown], issues };
}

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

/** Valori per le variabili {{1}}, {{2}}… di un template, dai segnaposto del messaggio. */
export function metaParams(text: string, kind: MessageKind, vars: Record<string, string>): string[] {
  return transcode(text, kind).order.map((key) => templateParam(vars[key] ?? "", key === "testo" ? 700 : 160));
}

/** Nome univoco per un nuovo template Meta (ogni modifica del testo è un nuovo template da approvare). */
export function metaTemplateName(kind: MessageKind, now = new Date()): string {
  const stamp = now.toISOString().replace(/\D/g, "").slice(0, 14);
  return `musikademy_${kind === "reminder" ? "promemoria" : "comunicazione"}_${stamp}`;
}
