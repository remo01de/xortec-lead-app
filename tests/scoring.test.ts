import { describe, expect, it } from "vitest";
import {
  computeScores,
  derivePriority,
  scoreDatenqualitaet,
  scoreFachlichkeit,
  scorePotenzial,
  type ScoringInput,
} from "../src/server/enrichment/scoring.js";

const baseInput: ScoringInput = {
  services: [],
  certifications: [],
  targetSegments: [],
  referenceProjectsCount: 0,
  sizeIndicatesMoreThan10Employees: false,
  hasMultipleLocationsOrControlRoom: false,
  independentSourcesCount: 0,
  websiteReachable: false,
  geocodeSource: "none",
  hasPhone: false,
};

describe("scoreFachlichkeit", () => {
  it("gibt 0 ohne Belege", () => {
    expect(scoreFachlichkeit(baseInput)).toBe(0);
  });

  it("zaehlt Videoueberwachung, Planung+Installation, Wartung, VMS-Komponente, Zutritt, Zertifizierung -> 100", () => {
    expect(
      scoreFachlichkeit({
        services: [
          "video_surveillance",
          "planning_design",
          "installation",
          "maintenance_service",
          "network_poe",
          "access_control",
        ],
        certifications: ["vds"],
      })
    ).toBe(100);
  });

  it("Planung ohne Installation zaehlt nicht als Planung+Installation", () => {
    expect(
      scoreFachlichkeit({
        services: ["planning_design"],
        certifications: [],
      })
    ).toBe(0);
  });

  it("deckelt bei 100 trotz mehrfacher Treffer in einer Kategorie", () => {
    expect(
      scoreFachlichkeit({
        services: [
          "video_surveillance",
          "planning_design",
          "installation",
          "maintenance_service",
          "remote_maintenance",
          "video_management_system",
          "network_poe",
          "access_control",
          "intrusion_alarm",
        ],
        certifications: ["vds", "bhe", "din_14675"],
      })
    ).toBe(100);
  });
});

describe("scorePotenzial", () => {
  it("deckelt Segmente bei 45 trotz 5 moeglicher Treffer", () => {
    expect(
      scorePotenzial({
        targetSegments: ["industry", "logistics", "retail", "public_sector", "critical_infrastructure"],
        referenceProjectsCount: 0,
        sizeIndicatesMoreThan10Employees: false,
        hasMultipleLocationsOrControlRoom: false,
      })
    ).toBe(45);
  });

  it("ignoriert Segmente ausserhalb der Potenzial-Liste (z.B. private_customers)", () => {
    expect(
      scorePotenzial({
        targetSegments: ["private_customers", "small_business"],
        referenceProjectsCount: 0,
        sizeIndicatesMoreThan10Employees: false,
        hasMultipleLocationsOrControlRoom: false,
      })
    ).toBe(0);
  });

  it("summiert alle vier Kriterien korrekt", () => {
    expect(
      scorePotenzial({
        targetSegments: ["industry"],
        referenceProjectsCount: 2,
        sizeIndicatesMoreThan10Employees: true,
        hasMultipleLocationsOrControlRoom: true,
      })
    ).toBe(15 + 25 + 20 + 10);
  });
});

describe("scoreDatenqualitaet", () => {
  it("volle Punktzahl bei allen vier Kriterien", () => {
    expect(
      scoreDatenqualitaet({
        independentSourcesCount: 3,
        websiteReachable: true,
        geocodeSource: "nominatim",
        hasPhone: true,
      })
    ).toBe(100);
  });

  it("PLZ-Zentroid-Fallback zaehlt NICHT als 'per Geocoder aufloesbar'", () => {
    expect(
      scoreDatenqualitaet({
        independentSourcesCount: 0,
        websiteReachable: false,
        geocodeSource: "plz_centroid",
        hasPhone: false,
      })
    ).toBe(0);
  });

  it("eine einzelne Quelle zaehlt nicht als 'zwei oder mehr'", () => {
    expect(
      scoreDatenqualitaet({
        independentSourcesCount: 1,
        websiteReachable: false,
        geocodeSource: "none",
        hasPhone: false,
      })
    ).toBe(0);
  });
});

describe("derivePriority", () => {
  it("A: Fachlichkeit >= 70 UND Potenzial >= 50", () => {
    expect(derivePriority(70, 50)).toBe("A");
    expect(derivePriority(100, 100)).toBe("A");
  });

  it("B: Fachlichkeit >= 70 aber Potenzial < 50", () => {
    expect(derivePriority(70, 49)).toBe("B");
  });

  it("B: Fachlichkeit >= 50 und Potenzial >= 50, aber Fachlichkeit < 70", () => {
    expect(derivePriority(50, 50)).toBe("B");
  });

  it("C: alles andere", () => {
    expect(derivePriority(49, 100)).toBe("C");
    expect(derivePriority(0, 0)).toBe("C");
  });
});

describe("computeScores", () => {
  it("Datenqualitaet < 45 -> unverified", () => {
    const result = computeScores({
      ...baseInput,
      independentSourcesCount: 1,
      hasPhone: true, // 15 Punkte, unter 45
    });
    expect(result.scoreDatenqualitaet).toBe(15);
    expect(result.verificationStatus).toBe("unverified");
  });

  it("Datenqualitaet >= 45 -> verified", () => {
    const result = computeScores({
      ...baseInput,
      independentSourcesCount: 2, // 40
      hasPhone: true, // +15 = 55
    });
    expect(result.verificationStatus).toBe("verified");
  });

  it("Fachlichkeit < 35 -> hiddenLowFachlichkeit", () => {
    const result = computeScores({
      ...baseInput,
      services: ["video_surveillance"], // 25, unter 35
    });
    expect(result.hiddenLowFachlichkeit).toBe(true);
  });

  it("Fachlichkeit >= 35 -> nicht versteckt", () => {
    const result = computeScores({
      ...baseInput,
      services: ["video_surveillance", "maintenance_service"], // 25 + 15 = 40
    });
    expect(result.hiddenLowFachlichkeit).toBe(false);
  });
});
