/**
 * Sessione WhatsApp Web (whatsapp-web.js + Chrome via Puppeteer).
 * La sessione è salvata in `config.dataDir` (LocalAuth): se c'è, all'avvio si ricollega da sola;
 * se manca, WhatsApp Web mostra il QR, che pubblichiamo nel pannello (e nella finestra del browser).
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";
import wweb from "whatsapp-web.js";
import { config } from "./config.ts";
import { publishSession } from "./firebase.ts";

const { Client, LocalAuth } = wweb;
type WAClient = InstanceType<typeof Client>;

export class NotOnWhatsAppError extends Error {}

let client: WAClient | null = null;
let ready = false;
const readyListeners: (() => void)[] = [];

export const isReady = () => ready;
export const onReady = (fn: () => void) => readyListeners.push(fn);

/**
 * Segnaposto scritto quando WhatsApp è davvero collegato: il profilo del browser in `dataDir`
 * esiste anche se il QR non è mai stato scansionato, quindi non basta a dire che c'è una sessione.
 */
const linkedMarker = () => join(config.dataDir, ".linked");
export const hasSavedSession = () => existsSync(linkedMarker());
function setLinked(linked: boolean) {
  try {
    if (linked) {
      mkdirSync(config.dataDir, { recursive: true });
      writeFileSync(linkedMarker(), new Date().toISOString());
    } else rmSync(linkedMarker(), { force: true });
  } catch (e) {
    console.warn("[whatsapp] Segnaposto sessione:", (e as Error).message);
  }
}

/** Avvia WhatsApp Web. Senza sessione salvata parte la procedura di collegamento con QR. */
export async function start() {
  if (client) return;
  ready = false;
  const saved = hasSavedSession();
  console.log(saved ? "[whatsapp] Sessione trovata: ricollegamento…" : "[whatsapp] Nessuna sessione: apro WhatsApp Web per il QR…");
  await publishSession({ state: "starting", qr: null, error: null, browserVisible: config.showBrowser });

  const c = new Client({
    authStrategy: new LocalAuth({ dataPath: config.dataDir }),
    qrMaxRetries: config.qrMaxRetries,
    deviceName: "Musikademy",
    browserName: "Chrome",
    puppeteer: {
      headless: !config.showBrowser,
      executablePath: config.chromePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    },
  });
  client = c;

  c.on("qr", async (qr: string) => {
    console.log("[whatsapp] QR pronto: scansionalo da WhatsApp → Dispositivi collegati (o dal pannello admin).");
    const image = await QRCode.toDataURL(qr, { margin: 1, width: 320 });
    if (client === c) await publishSession({ state: "qr", qr: image });
  });
  c.on("authenticated", () => {
    console.log("[whatsapp] Autenticato, caricamento chat…");
    void publishSession({ state: "authenticated", qr: null, error: null });
  });
  c.on("auth_failure", (msg: string) => {
    if (client !== c) return;
    console.error("[whatsapp] Autenticazione non riuscita:", msg);
    setLinked(false);
    void shutdown({ state: "error", error: "Accesso a WhatsApp non riuscito: collega di nuovo il numero." });
  });
  c.on("ready", () => {
    ready = true;
    setLinked(true);
    const phone = c.info?.wid?.user ?? null;
    console.log(`[whatsapp] Collegato come +${phone} (${c.info?.pushname ?? ""}).`);
    void publishSession({ state: "connected", qr: null, error: null, phone, pushName: c.info?.pushname ?? null });
    readyListeners.forEach((fn) => fn());
  });
  c.on("disconnected", (reason: string) => {
    if (client !== c) return; // già chiuso da noi (logout o arresto)
    console.warn("[whatsapp] Disconnesso:", reason);
    if (reason === "LOGOUT") setLinked(false);
    const error =
      reason === "LOGOUT"
        ? "Il numero è stato scollegato dal telefono."
        : /qrcode/i.test(reason)
          ? "QR non scansionato in tempo."
          : `Connessione persa (${reason}).`;
    void shutdown({ state: "stopped", error });
  });

  try {
    await c.initialize();
  } catch (e) {
    console.error("[whatsapp] Avvio non riuscito:", e);
    // Tipico dopo una chiusura forzata: il Chrome del worker precedente tiene bloccato il profilo.
    const locked = /already running/i.test((e as Error).message);
    await shutdown({
      state: "error",
      error: locked
        ? "WhatsApp Web è già aperto da un'altra istanza del worker: chiudi i processi Chrome rimasti e riavvia."
        : "Impossibile avviare WhatsApp Web. Controlla il worker.",
    });
  }
}

/** Chiude il browser mantenendo la sessione salvata (si ricollega al prossimo avvio). */
async function shutdown(patch: Record<string, unknown>) {
  const c = client;
  client = null;
  ready = false;
  await publishSession({ qr: null, ...patch });
  try {
    await c?.destroy();
  } catch {
    // browser già chiuso
  }
}

/** Scollega il numero: elimina la sessione, al prossimo "Collega" servirà un nuovo QR. */
export async function logout() {
  const c = client;
  client = null;
  ready = false;
  try {
    if (c) await c.logout();
  } catch (e) {
    console.warn("[whatsapp] Logout:", (e as Error).message);
    try {
      await c?.destroy();
    } catch {
      // ignorato
    }
  }
  setLinked(false);
  await publishSession({ state: "stopped", qr: null, phone: null, pushName: null, error: null });
  console.log("[whatsapp] Numero scollegato.");
}

/** Chiusura del processo: il browser si chiude, la sessione resta salvata. */
export async function close() {
  const c = client;
  client = null;
  ready = false;
  try {
    await c?.destroy();
  } catch {
    // ignorato
  }
}

/** Invia un messaggio di testo a un numero internazionale senza "+" (es. 393331234567). */
export async function sendText(to: string, body: string) {
  if (!client || !ready) throw new Error("WhatsApp non collegato.");
  const id = await client.getNumberId(to);
  if (!id) throw new NotOnWhatsAppError("Il numero non risulta registrato su WhatsApp.");
  await client.sendMessage(id._serialized, body);
}
