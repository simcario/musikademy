/**
 * Configurazione da variabili d'ambiente. Legge anche `.env.local` della radice del progetto
 * e `whatsapp-worker/.env` (le variabili già presenti nell'ambiente hanno la precedenza).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WORKER_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvFile(path: string) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env) && m[2] !== "") process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

loadEnvFile(resolve(WORKER_DIR, ".env"));
loadEnvFile(resolve(WORKER_DIR, "..", ".env.local"));

const flag = (name: string) => {
  const v = process.env[name]?.toLowerCase();
  return v === undefined || v === "" ? undefined : ["1", "true", "yes", "si", "sì"].includes(v);
};

/** Un desktop (Windows/macOS, o Linux con display) può mostrare WhatsApp Web in una finestra. */
const hasDisplay = process.platform === "win32" || process.platform === "darwin" || !!process.env.DISPLAY;

export const config = {
  projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  useEmulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" || !!process.env.FIRESTORE_EMULATOR_HOST,
  /** Cartella della sessione WhatsApp Web (profilo del browser): non va condivisa né versionata. */
  dataDir: resolve(process.env.WHATSAPP_DATA_DIR || resolve(WORKER_DIR, ".wwebjs_auth")),
  /** Mostra la finestra di WhatsApp Web (default: sì se c'è uno schermo). */
  showBrowser: flag("WHATSAPP_SHOW_BROWSER") ?? hasDisplay,
  /** Chrome/Edge già installato da usare al posto di quello scaricato da Puppeteer. */
  chromePath: process.env.WHATSAPP_CHROME_PATH || undefined,
  /** Pausa casuale tra un invio e l'altro: ritmo "umano", riduce il rischio di blocco del numero. */
  minDelayMs: Number(process.env.WHATSAPP_MIN_DELAY_MS || 4000),
  maxDelayMs: Number(process.env.WHATSAPP_MAX_DELAY_MS || 9000),
  /** Rinnovi del QR prima di rinunciare (~20 s l'uno): poi serve "Collega" dal pannello. */
  qrMaxRetries: Number(process.env.WHATSAPP_QR_MAX_RETRIES || 9),
};

if (!config.projectId) {
  console.error("[whatsapp] NEXT_PUBLIC_FIREBASE_PROJECT_ID (o FIREBASE_PROJECT_ID) mancante.");
  process.exit(1);
}
