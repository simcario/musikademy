import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  INVITE_TTL_DAYS,
  inviteExpiry,
  inviteMessage,
  inviteState,
  inviteUrl,
  isInviteToken,
  whatsappLink,
} from "@/lib/auth/invite-token";

describe("inviti", () => {
  it("accetta solo token nel formato generato dal server", () => {
    expect(isInviteToken(randomBytes(32).toString("base64url"))).toBe(true);
    expect(isInviteToken("")).toBe(false);
    expect(isInviteToken("abc")).toBe(false);
    expect(isInviteToken(`${randomBytes(32).toString("base64url")}x`)).toBe(false);
    expect(isInviteToken("a".repeat(42) + "/")).toBe(false);
    expect(isInviteToken(123)).toBe(false);
  });

  it(`scade dopo ${INVITE_TTL_DAYS} giorni e vale una sola volta`, () => {
    const created = new Date("2026-09-01T10:00:00Z");
    const expiresAt = inviteExpiry(created);
    expect(expiresAt.toISOString()).toBe("2026-09-08T10:00:00.000Z");
    expect(inviteState({ expiresAt }, new Date("2026-09-08T09:59:59Z"))).toBe("valid");
    expect(inviteState({ expiresAt }, new Date("2026-09-08T10:00:00Z"))).toBe("expired");
    expect(inviteState({ expiresAt, acceptedAt: created }, created)).toBe("accepted");
  });

  it("mette il token nel frammento dell'URL (mai inviato al server)", () => {
    expect(inviteUrl("https://app.example.it/", "TOKEN")).toBe("https://app.example.it/invite#TOKEN");
  });

  it("prepara il messaggio e il link WhatsApp", () => {
    const text = inviteMessage("Elena", "https://x/invite#t", new Date("2026-10-03T12:00:00Z"));
    expect(text).toContain("Ciao Elena!");
    expect(text).toContain("3 ottobre");
    expect(text).toContain("https://x/invite#t");
    expect(whatsappLink("333 123 4567", "ciao")).toBe("https://wa.me/393331234567?text=ciao");
    expect(whatsappLink("+39 333-1234567", "a b")).toBe("https://wa.me/393331234567?text=a%20b");
    expect(whatsappLink("0041 79 123 45 67", "x")).toBe("https://wa.me/41791234567?text=x");
    expect(whatsappLink(undefined, "x")).toBe("https://wa.me/?text=x");
  });
});
