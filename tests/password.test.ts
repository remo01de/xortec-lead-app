import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../src/server/auth/password.js";

describe("hashPassword / verifyPassword", () => {
  it("akzeptiert das richtige Passwort", async () => {
    const hash = await hashPassword("korrekt-pferd-batterie");
    expect(await verifyPassword("korrekt-pferd-batterie", hash)).toBe(true);
  });

  it("lehnt ein falsches Passwort ab", async () => {
    const hash = await hashPassword("korrekt-pferd-batterie");
    expect(await verifyPassword("falsch", hash)).toBe(false);
  });

  it("erzeugt bei gleichem Passwort unterschiedliche Hashes (zufaelliger Salt)", async () => {
    const a = await hashPassword("gleiches-passwort");
    const b = await hashPassword("gleiches-passwort");
    expect(a).not.toBe(b);
    expect(await verifyPassword("gleiches-passwort", a)).toBe(true);
    expect(await verifyPassword("gleiches-passwort", b)).toBe(true);
  });

  it("lehnt kaputte oder leere Hash-Werte ab, statt zu werfen", async () => {
    for (const broken of ["", "kein-hash", "scrypt:nur-ein-teil", "bcrypt:aa:bb"]) {
      expect(await verifyPassword("egal", broken), broken).toBe(false);
    }
  });

  it("lehnt einen Hash mit falscher Schluessellaenge ab", async () => {
    expect(await verifyPassword("egal", "scrypt:aabb:ccdd")).toBe(false);
  });
});
