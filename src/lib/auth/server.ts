import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { adminAuth } from "@/lib/firebase/admin";
import { can, isRole, type Permission } from "@/lib/auth/roles";
import type { Role } from "@/types";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Caller {
  uid: string;
  role: Role;
  token: DecodedIdToken;
}

/** Verifica l'ID token (Authorization: Bearer): qualunque utente con un ruolo valido. */
export async function requireUser(req: Request): Promise<Caller> {
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) throw new HttpError(401, "Sessione non valida. Accedi di nuovo.");
  let token: DecodedIdToken;
  try {
    // checkRevoked: un account disattivato perde subito l'accesso alle API.
    token = await adminAuth().verifyIdToken(match[1], true);
  } catch {
    throw new HttpError(401, "Sessione scaduta. Accedi di nuovo.");
  }
  const role = token.role;
  if (!isRole(role)) throw new HttpError(403, "Non hai i permessi per questa operazione.");
  return { uid: token.uid, role, token };
}

/** Come requireUser, ma richiede anche il permesso indicato. */
export async function requireCaller(req: Request, permission: Permission): Promise<Caller> {
  const caller = await requireUser(req);
  if (!can(caller.role, permission)) throw new HttpError(403, "Non hai i permessi per questa operazione.");
  return caller;
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message }, { status: error.status });
  const code = (error as { code?: string })?.code;
  if (code === "auth/email-already-exists") {
    return Response.json({ error: "Esiste già un account con questa email." }, { status: 409 });
  }
  if (code === "auth/user-not-found") return Response.json({ error: "Utente non trovato." }, { status: 404 });
  console.error("[api/admin]", error);
  return Response.json({ error: "Operazione non riuscita. Riprova." }, { status: 500 });
}
