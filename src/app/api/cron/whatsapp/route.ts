import { timingSafeEqual } from "node:crypto";
import { dispatchWhatsApp } from "@/lib/whatsapp/dispatch";

/**
 * Job pianificato (Cloud Scheduler, ogni 15 minuti) per Zernio (ADR D25): genera i promemoria
 * all'orario impostato e invia i messaggi rimasti in coda. Protetto da CRON_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
  const ok =
    !!secret && given.length === secret.length && timingSafeEqual(Buffer.from(given), Buffer.from(secret));
  if (!ok) return Response.json({ error: "Non autorizzato." }, { status: 401 });
  try {
    return Response.json(await dispatchWhatsApp({ reminders: true }));
  } catch (e) {
    console.error("[cron/whatsapp]", e);
    return Response.json({ error: "Invio non riuscito." }, { status: 500 });
  }
}
