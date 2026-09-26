import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { createUserSchema } from "@/features/students/schemas";
import { createInvite } from "@/lib/auth/invites";
import { buildKeywords } from "@/utils/keywords";

/**
 * Crea un account (studente, docente o admin).
 * - studente: richiede `students:manage` (docente o admin)
 * - docente/admin: richiede `roles:manage` (solo admin)
 * Lo studente riceve un link d'invito per collegare il proprio account Google (ADR D20);
 * lo staff imposta la password tramite il link di reset (nessuna password custom, §56).
 */
export async function POST(req: Request) {
  try {
    const parsed = createUserSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Dati non validi.");
    const input = parsed.data;
    const caller = await requireCaller(req, input.role === "student" ? "students:manage" : "roles:manage");

    const auth = adminAuth();
    const user = await auth.createUser({
      email: input.email,
      displayName: `${input.name} ${input.surname}`,
      emailVerified: false,
      disabled: false,
    });

    try {
      await auth.setCustomUserClaims(user.uid, { role: input.role });
      const db = adminDb();
      const now = FieldValue.serverTimestamp();
      const batch = db.batch();
      batch.set(db.doc(`users/${user.uid}`), {
        uid: user.uid,
        name: input.name,
        surname: input.surname,
        email: input.email,
        phone: input.phone ?? "",
        role: input.role,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      if (input.role === "student") {
        batch.set(db.doc(`students/${user.uid}`), {
          userId: user.uid,
          name: input.name,
          surname: input.surname,
          email: input.email,
          phone: input.phone ?? "",
          courseIds: input.courseIds,
          enrollmentDate: input.enrollmentDate ? Timestamp.fromDate(new Date(input.enrollmentDate)) : now,
          status: "active",
          inviteStatus: "pending",
          keywords: buildKeywords(input.name, input.surname, input.email),
          createdAt: now,
          updatedAt: now,
        });
        if (input.notes) batch.set(db.doc(`studentNotes/${user.uid}`), { notes: input.notes, updatedAt: now });
      } else {
        batch.set(db.doc(`teachers/${user.uid}`), {
          userId: user.uid,
          name: input.name,
          surname: input.surname,
          email: input.email,
          courseIds: input.courseIds,
          createdAt: now,
          updatedAt: now,
        });
      }
      await batch.commit();
    } catch (e) {
      // Nessun account "a metà": rollback dell'utente Auth.
      await auth.deleteUser(user.uid).catch(() => undefined);
      throw e;
    }

    if (input.role === "student") {
      const invite = await createInvite(user.uid, caller.uid);
      return Response.json({ uid: user.uid, invite }, { status: 201 });
    }
    const resetLink = await auth.generatePasswordResetLink(input.email).catch(() => undefined);
    return Response.json({ uid: user.uid, resetLink }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
