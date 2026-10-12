import { errorResponse, requireCaller } from "@/lib/auth/server";
import { ZERNIO_TEMPLATES, type ZernioTemplateKey } from "@/lib/whatsapp/shared";
import { ZernioError, createTemplate, listTemplates, whatsappAccount, zernioConfigured } from "@/lib/whatsapp/zernio";

const KEYS = Object.keys(ZERNIO_TEMPLATES) as ZernioTemplateKey[];

async function status() {
  const base = { configured: zernioConfigured(), cronConfigured: !!process.env.CRON_SECRET };
  if (!base.configured) return { ...base, account: null, templates: [] };
  try {
    const account = await whatsappAccount();
    if (!account) return { ...base, account: null, templates: [] };
    const existing = await listTemplates(account._id);
    return {
      ...base,
      account: {
        id: account._id,
        name: account.metadata?.verifiedName || account.displayName || "WhatsApp",
        // `username` è il numero in formato leggibile (es. "+39 331 …"); platformUserId sono ID Meta.
        phone: (account.metadata?.displayPhoneNumber || account.username || "").replace(/\D/g, "") || undefined,
        needsReconnection: account.needsReconnection,
      },
      templates: KEYS.map((key) => {
        const t = existing.find((x) => x.name === ZERNIO_TEMPLATES[key].name);
        return { key, name: ZERNIO_TEMPLATES[key].name, status: t?.status ?? "MISSING", category: t?.category };
      }),
    };
  } catch (e) {
    return { ...base, account: null, templates: [], error: (e as Error).message };
  }
}

/** Stato di Zernio: numero collegato e approvazione dei template (ADR D25). */
export async function GET(req: Request) {
  try {
    await requireCaller(req, "staff:area");
    return Response.json(await status());
  } catch (e) {
    return errorResponse(e);
  }
}

/** Invia a Meta per l'approvazione i template mancanti (o rifiutati da ricreare). */
export async function POST(req: Request) {
  try {
    await requireCaller(req, "settings:manage");
    const account = await whatsappAccount();
    if (!account) return Response.json({ error: "Collega prima un numero WhatsApp su Zernio." }, { status: 409 });
    const existing = await listTemplates(account._id);
    for (const key of KEYS) {
      if (!existing.some((t) => t.name === ZERNIO_TEMPLATES[key].name)) await createTemplate(account._id, key);
    }
    return Response.json(await status());
  } catch (e) {
    if (e instanceof ZernioError) return Response.json({ error: `Zernio: ${e.message}` }, { status: 502 });
    return errorResponse(e);
  }
}
