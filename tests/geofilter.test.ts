import { describe, expect, it } from "vitest";
import { getAreaCentroid } from "../src/server/enrichment/plz-centroid.js";
import { checkAreaRadius } from "../src/server/research/geofilter.js";

const hamburg21 = getAreaCentroid("21")!;
const RADIUS_KM = 40;

describe("checkAreaRadius", () => {
  it("haelt Hamburger Firmen mit Praefix 20 und 22 im Gebiet 21", () => {
    // Der Bug aus Lauf 7: Hamburg verteilt sich auf 20/21/22, ein
    // Praefix-Vergleich warf diese korrekten Treffer weg. 20097 ist die PLZ
    // des Xortec-Bueros selbst.
    for (const plz of ["20097", "20099", "20457", "20539", "22085", "22769", "22589"]) {
      const verdict = checkAreaRadius(hamburg21, plz, RADIUS_KM);
      expect(verdict.outside, `${plz} sollte im Umkreis liegen`).toBe(false);
    }
  });

  it("haelt Umlandorte innerhalb des Radius (Norderstedt, Siek)", () => {
    expect(checkAreaRadius(hamburg21, "22846", RADIUS_KM).outside).toBe(false);
    expect(checkAreaRadius(hamburg21, "22962", RADIUS_KM).outside).toBe(false);
  });

  it("verwirft echte Ausreisser ausserhalb des Radius", () => {
    // Muenchen, Koeln, Stuttgart -- alle weit ausserhalb.
    for (const plz of ["80331", "50667", "70173"]) {
      const verdict = checkAreaRadius(hamburg21, plz, RADIUS_KM);
      expect(verdict.outside, `${plz} sollte ausserhalb liegen`).toBe(true);
      expect(verdict.distanceKm).toBeGreaterThan(RADIUS_KM);
    }
  });

  it("laesst Kandidaten ohne PLZ durch (nicht entscheidbar)", () => {
    expect(checkAreaRadius(hamburg21, null, RADIUS_KM)).toEqual({ outside: false, distanceKm: null });
  });

  it("laesst unbekannte PLZ durch (nicht im Zentroid-Datensatz)", () => {
    expect(checkAreaRadius(hamburg21, "00000", RADIUS_KM)).toEqual({ outside: false, distanceKm: null });
  });

  it("ist inaktiv, wenn kein Gebietsmittelpunkt bekannt ist", () => {
    expect(checkAreaRadius(null, "80331", RADIUS_KM)).toEqual({ outside: false, distanceKm: null });
  });
});
