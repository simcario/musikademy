import { describe, expect, it } from "vitest";
import { MANAGE_PERMISSIONS, can, homeFor, isRole, isStaff, permissionsOf, type Access } from "@/lib/auth/roles";
import { safeNext } from "@/features/auth/schemas";
import { errorMessage } from "@/utils/errors";

const student: Access = { role: "student" };
const teacher: Access = { role: "teacher" };
const admin: Access = { role: "admin" };

describe("ruoli e permessi", () => {
  it("lo studente accede solo alla propria area", () => {
    expect(can(student, "student:area")).toBe(true);
    expect(can(student, "area:payments")).toBe(true);
    for (const p of ["staff:area", "students:manage", "payments:manage", "attendance:manage", "roles:manage"] as const) {
      expect(can(student, p)).toBe(false);
    }
  });

  it("il docente gestisce la didattica ma non ruoli e impostazioni", () => {
    expect(can(teacher, "lessons:manage")).toBe(true);
    expect(can(teacher, "payments:manage")).toBe(true);
    expect(can(teacher, "roles:manage")).toBe(false);
    expect(can(teacher, "settings:manage")).toBe(false);
    expect(can(teacher, "student:area")).toBe(false);
  });

  it("l'admin ha tutti i permessi dello staff più ruoli e impostazioni", () => {
    for (const p of MANAGE_PERMISSIONS) expect(can(admin, p.id)).toBe(true);
    expect(can(admin, "roles:manage")).toBe(true);
  });

  it("i ruoli configurati concedono solo i permessi scelti e del proprio tipo (ADR D31)", () => {
    const musician: Access = { role: "student", roleId: "musicista", perms: ["area:materials", "area:playlists", "payments:manage"] };
    expect(can(musician, "area:playlists")).toBe(true);
    expect(can(musician, "area:lessons")).toBe(false);
    // Un permesso di gestione nel claim di un ruolo dell'area personale non vale.
    expect(can(musician, "payments:manage")).toBe(false);
    const office: Access = { role: "teacher", roleId: "segreteria", perms: ["payments:manage", "area:lessons"] };
    expect(permissionsOf(office)).toEqual(["staff:area", "payments:manage"]);
    expect(can(office, "lessons:manage")).toBe(false);
    expect(can({ role: "teacher", perms: [] }, "staff:area")).toBe(true);
    // L'admin ha tutto anche con un claim `perms` vuoto.
    expect(can({ role: "admin", perms: [] }, "payments:manage")).toBe(true);
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
    expect(isStaff(student)).toBe(false);
  });
});

describe("login", () => {
  it("accetta solo redirect interni (niente open redirect)", () => {
    expect(safeNext("/lessons/abc")).toBe("/lessons/abc");
    expect(safeNext("https://evil.com")).toBeNull();
    expect(safeNext("//evil.com")).toBeNull();
    expect(safeNext("/\\evil.com")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });

  it("non mostra errori tecnici Firebase all'utente", () => {
    expect(errorMessage({ code: "auth/invalid-credential" })).toBe("Accesso non riuscito. Riprova con il tuo account Google.");
    expect(errorMessage({ code: "permission-denied" })).toBe("Non hai i permessi per questa operazione.");
    expect(errorMessage(new Error("FirebaseError: internal stack trace"))).toBe("Si è verificato un errore. Riprova.");
  });
});
