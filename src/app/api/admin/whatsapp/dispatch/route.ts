import { errorResponse, requireCaller } from "@/lib/auth/server";
import { dispatchWhatsApp } from "@/lib/whatsapp/dispatch";

/** Lo staff ha messo in coda dei messaggi: con Zernio partono subito (ADR D25). */
export async function POST(req: Request) {
  try {
    await requireCaller(req, "announcements:manage");
    return Response.json(await dispatchWhatsApp({ reminders: false }));
  } catch (e) {
    return errorResponse(e);
  }
}
