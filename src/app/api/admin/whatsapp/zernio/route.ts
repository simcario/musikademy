import { z } from "zod";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import {
  createMissingDefaults,
  loadSettings,
  resolveTemplates,
  submitTemplate,
} from "@/lib/whatsapp/meta-templates";
import { MESSAGE_KINDS, transcode } from "@/lib/whatsapp/shared";
import { ZernioError, whatsappAccount, zernioConfigured } from "@/lib/whatsapp/zernio";

async function status() {
  const base = { configured: zernioConfigured(), cronConfigured: !!process.env.CRON_SECRET };
  if (!base.configured) return { ...base, account: null, templates: [] };
  try {
    const account = await whatsappAccount();
    if (!account) return { ...base, account: null, templates: [] };
    const templates = await resolveTemplates(account._id, await loadSettings());
    return {
      ...base,
      account: {
        id: account._id,
        name: account.metadata?.verifiedName || account.displayName || "WhatsApp",
        // `username` è il numero in formato leggibile (es. "+39 331 …").
        phone: (account.metadata?.displayPhoneNumber || account.username || "").replace(/\D/g, "") || undefined,
        needsReconnection: account.needsReconnection,
      },
      templates: MESSAGE_KINDS.map((k) => templates[k]),
    };
  } catch (e) {
    return { ...base, account: null, templates: [], error: (e as Error).message };
  }
}

/** Stato di Zernio: numero collegato e template (in uso / in approvazione) per tipo di messaggio. */
export async function GET(req: Request) {
  try {
    await requireCaller(req, "staff:area");
    return Response.json(await status());
  } catch (e) {
    return errorResponse(e);
  }
}

const bodySchema = z.union([
  z.object({ action: z.literal("create-defaults") }),
  z.object({ action: z.literal("submit"), kind: z.enum(["reminder", "announcement"]), text: z.string().trim().min(1).max(1024) }),
]);

/**
 * - `create-defaults`: crea su Meta i template predefiniti mancanti
 * - `submit`: invia a Meta un testo personalizzato (resta in uso il precedente finché non è approvato)
 */
export async function POST(req: Request) {
  try {
    await requireCaller(req, "settings:manage");
    const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) throw new HttpError(400, "Dati non validi.");
    const account = await whatsappAccount();
    if (!account) throw new HttpError(409, "Collega prima un numero WhatsApp su Zernio.");

    if (parsed.data.action === "create-defaults") {
      await createMissingDefaults(account._id, await loadSettings());
    } else {
      const { kind, text } = parsed.data;
      const issues = transcode(text, kind).issues;
      if (issues.length) throw new HttpError(400, issues.join(" "));
      await submitTemplate(account._id, kind, text);
    }
    return Response.json(await status());
  } catch (e) {
    if (e instanceof ZernioError) return Response.json({ error: `Zernio: ${e.message}` }, { status: 502 });
    return errorResponse(e);
  }
}
