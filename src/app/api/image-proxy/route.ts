import { lookup } from "node:dns/promises";
import { BlockList } from "node:net";
import { HttpError, errorResponse, requireUser } from "@/lib/auth/server";

/**
 * Scarica un'immagine esterna per conto del client (solo utenti autenticati).
 * Serve all'esportazione PDF dei Markdown: il browser non può leggere i byte di un'immagine
 * di un altro sito senza CORS, quindi passa da qui.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_REDIRECTS = 4;
const TIMEOUT_MS = 10_000;

// Indirizzi interni (rete privata, loopback, metadata del cloud): mai raggiungibili tramite il proxy.
// Gli IPv4 mappati in IPv6 (::ffff:a.b.c.d) vengono confrontati da BlockList con le regole IPv4.
const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 3],
] as const) {
  blocked.addSubnet(net, prefix, "ipv4");
}
for (const [net, prefix] of [
  ["::", 127], // :: e ::1
  ["64:ff9b::", 96], // NAT64
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(net, prefix, "ipv6");
}

const notAllowed = () => new HttpError(400, "Indirizzo dell'immagine non consentito.");
const unreachable = () => new HttpError(502, "Immagine non raggiungibile.");

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw notAllowed();
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = await lookup(host, { all: true }).catch(() => {
    throw unreachable();
  });
  if (addresses.length === 0) throw unreachable();
  for (const { address, family } of addresses) {
    if (blocked.check(address, family === 6 ? "ipv6" : "ipv4")) throw notAllowed();
  }
}

/** Segue i reindirizzamenti a mano, per ricontrollare ogni destinazione. */
async function fetchImage(start: URL): Promise<Response> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "image/*", "User-Agent": "Musikademy/1.0 (image proxy)" },
    }).catch(() => {
      throw unreachable();
    });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel();
    url = new URL(location, url);
  }
  throw unreachable();
}

async function readCapped(res: Response): Promise<Uint8Array<ArrayBuffer>> {
  const tooLarge = () => new HttpError(413, "Immagine troppo grande.");
  if (Number(res.headers.get("content-length") ?? 0) > MAX_BYTES) throw tooLarge();
  const reader = res.body?.getReader();
  if (!reader) throw unreachable();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read().catch(() => {
      throw unreachable();
    });
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BYTES) {
      await reader.cancel();
      throw tooLarge();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export async function GET(req: Request) {
  try {
    await requireUser(req);
    const raw = new URL(req.url).searchParams.get("url") ?? "";
    if (!URL.canParse(raw)) throw notAllowed();
    const res = await fetchImage(new URL(raw));
    if (!res.ok) throw unreachable();
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!type.startsWith("image/")) throw new HttpError(415, "Il collegamento non è un'immagine.");
    return new Response(await readCapped(res), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "private, max-age=3600",
        // Un SVG può contenere script: non deve mai essere eseguito sul nostro dominio.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "attachment",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
