import { describe, expect, it } from "vitest";
import { lookupPlzCentroid } from "../src/server/enrichment/plz-centroid.js";

describe("lookupPlzCentroid", () => {
  it("findet eine bekannte Hamburger PLZ (22765, Altona)", () => {
    const result = lookupPlzCentroid("22765");
    expect(result).not.toBeNull();
    expect(result!.lat).toBeGreaterThan(53);
    expect(result!.lat).toBeLessThan(54);
    expect(result!.lon).toBeGreaterThan(9);
    expect(result!.lon).toBeLessThan(11);
  });

  it("gibt null fuer null zurueck", () => {
    expect(lookupPlzCentroid(null)).toBeNull();
  });

  it("gibt null fuer nicht existierende PLZ zurueck", () => {
    expect(lookupPlzCentroid("00000")).toBeNull();
  });
});
