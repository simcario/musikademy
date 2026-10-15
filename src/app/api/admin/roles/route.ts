import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { permissionsForKind, type Permission } from "@/lib/auth/roles";
import { roleFormSchema } from "@/features/roles/schemas";

/** Nuovo ruolo dell'organizzazione (ADR D31). Solo l'amministratore. */
export async function POST(req: Request) {
  try {
    await requireCaller(req, "roles:manage");
    const parsed = roleFormSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Dati non validi.");
    const input = parsed.data;
    const allowed = permissionsForKind(input.kind);
    const ref = adminDb().collection("roles").doc();
    const now = FieldValue.serverTimestamp();
    await ref.set({
      name: input.name,
      description: input.description ?? "",
      kind: input.kind,
      permissions: input.permissions.filter((p): p is Permission => allowed.includes(p as Permission)),
      createdAt: now,
      updatedAt: now,
    });
    return Response.json({ id: ref.id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
