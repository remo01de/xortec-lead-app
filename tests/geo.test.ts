import { describe, expect, it } from "vitest";
import { haversineKm } from "../src/server/util/geo.js";

describe("haversineKm", () => {
  it("liefert 0 fuer identische Punkte", () => {
    expect(haversineKm(53.55, 10.0, 53.55, 10.0)).toBeCloseTo(0, 5);
  });

  it("Hamburg -> Bremen liegt bei ca. 95-110 km Luftlinie", () => {
    // Hamburg 53.5511,9.9937 -- Bremen 53.0793,8.8017
    const km = haversineKm(53.5511, 9.9937, 53.0793, 8.8017);
    expect(km).toBeGreaterThan(90);
    expect(km).toBeLessThan(115);
  });
});
