import { describe, expect, it } from "vitest";
import { can, homeFor, isRole, isStaff, ROLE_PERMISSIONS } from "@/lib/auth/roles";
import { loginSchema, safeNext, changePasswordSchema } from "@/features/auth/schemas";
import { errorMessage } from "@/utils/errors";

describe("ruoli e permessi", () => {
  it("lo studente accede solo alla propria area", () => {
    expect(can("student", "student:area")).toBe(true);
    for (const p of ["staff:area", "students:manage", "payments:manage", "attendance:manage", "roles:manage"] as const) {
      expect(can("student", p)).toBe(false);
    }
  });

  it("il docente gestisce la didattica ma non ruoli e impostazioni", () => {
    expect(can("teacher", "lessons:manage")).toBe(true);
    expect(can("teacher", "payments:manage")).toBe(true);
    expect(can("teacher", "roles:manage")).toBe(false);
    expect(can("teacher", "settings:manage")).toBe(false);
    expect(can("teacher", "student:area")).toBe(false);
  });

  it("l'admin ha tutti i permessi dello staff più ruoli e impostazioni", () => {
    for (const p of ROLE_PERMISSIONS.teacher) expect(can("admin", p)).toBe(true);
    expect(can("admin", "roles:manage")).toBe(true);
  });

  it("ruoli sconosciuti o assenti non hanno permessi", () => {
    expect(can(null, "student:area")).toBe(false);
    expect(can(undefined, "staff:area")).toBe(false);
    expect(isRole("superadmin")).toBe(false);
    expect(isRole("admin")).toBe(true);
  });

  it("instrada ogni ruolo alla propria home", () => {
    expect(homeFor("student")).toBe("/dashboard");
    expect(homeFor("teacher")).toBe("/admin");
    expect(homeFor("admin")).toBe("/admin");
    expect(isStaff("student")).toBe(false);
  });
});

describe("login", () => {
  it("valida email e password", () => {
    expect(loginSchema.safeParse({ email: "nome@scuola.it", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "non-email", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ email: "a@b.it", password: "" }).success).toBe(false);
  });

  it("accetta solo redirect interni (niente open redirect)", () => {
    expect(safeNext("/lessons/abc")).toBe("/lessons/abc");
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it("la nuova password richiede 8 caratteri e conferma coincidente", () => {
    expect(changePasswordSchema.safeParse({ current: "a", next: "12345678", confirm: "12345678" }).success).toBe(true);
    expect(changePasswordSchema.safeParse({ current: "a", next: "1234", confirm: "1234" }).success).toBe(false);
    expect(changePasswordSchema.safeParse({ current: "a", next: "12345678", confirm: "87654321" }).success).toBe(false);
  });

  it("non mostra errori tecnici Firebase all'utente", () => {
    expect(errorMessage({ code: "auth/invalid-credential" })).toBe("Email o password non corretti.");
    expect(errorMessage({ code: "permission-denied" })).toBe("Non hai i permessi per questa operazione.");
    expect(errorMessage(new Error("FirebaseError: internal stack trace"))).toBe("Si è verificato un errore. Riprova.");
  });
});
