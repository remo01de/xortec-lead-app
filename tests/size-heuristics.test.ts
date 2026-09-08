import { describe, expect, it } from "vitest";
import {
  hasMultipleLocationsOrControlRoom,
  sizeIndicatesMoreThan10Employees,
} from "../src/server/enrichment/size-heuristics.js";

describe("sizeIndicatesMoreThan10Employees", () => {
  it("null -> false", () => {
    expect(sizeIndicatesMoreThan10Employees(null)).toBe(false);
  });

  it("erkennt explizite Mitarbeiterzahl über 10", () => {
    expect(sizeIndicatesMoreThan10Employees("Wir sind ein Team von 25 Mitarbeitern")).toBe(true);
  });

  it("erkennt Zahl unter 10 NICHT als groß", () => {
    expect(sizeIndicatesMoreThan10Employees("Unser 8-köpfiges Team")).toBe(false);
  });

  it("erkennt 'mehr als 10 Mitarbeiter'-Formulierung", () => {
    expect(sizeIndicatesMoreThan10Employees("Mehr als 10 Mitarbeiter beschäftigt")).toBe(true);
  });
});

describe("hasMultipleLocationsOrControlRoom", () => {
  it("monitoring_station-Service reicht aus", () => {
    expect(hasMultipleLocationsOrControlRoom(["monitoring_station"], null)).toBe(true);
  });

  it("Freitext-Hinweis auf mehrere Standorte", () => {
    expect(hasMultipleLocationsOrControlRoom([], "Mit Niederlassungen in Hamburg und Bremen")).toBe(true);
  });

  it("kein Hinweis -> false", () => {
    expect(hasMultipleLocationsOrControlRoom(["video_surveillance"], "Familienbetrieb seit 1990")).toBe(false);
  });
});
