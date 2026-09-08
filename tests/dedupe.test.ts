import { describe, expect, it } from "vitest";
import { normalizeDomain } from "../src/server/research/dedupe.js";

describe("normalizeDomain", () => {
  it("entfernt Protokoll, www. und Pfad", () => {
    expect(normalizeDomain("https://www.example.de/kontakt")).toBe("example.de");
  });

  it("akzeptiert bloße Domain ohne Protokoll", () => {
    expect(normalizeDomain("example.de")).toBe("example.de");
  });

  it("ist case-insensitiv", () => {
    expect(normalizeDomain("HTTPS://WWW.Example.DE")).toBe("example.de");
  });

  it("behandelt example.de und www.example.de als gleich", () => {
    expect(normalizeDomain("example.de")).toBe(normalizeDomain("www.example.de"));
  });

  it("gibt null fuer leeren String zurueck", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
  });

  it("gibt null fuer offensichtlich ungueltige Werte zurueck", () => {
    expect(normalizeDomain("nicht-eine-domain")).toBeNull();
  });
});
