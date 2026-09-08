import { lookupPlzCentroid } from "../enrichment/plz-centroid.js";
import { haversineKm } from "../util/geo.js";

export interface GeofilterVerdict {
  outside: boolean;
  /** null = nicht entscheidbar (keine PLZ, PLZ nicht im Zentroid-Datensatz, kein Gebietsmittelpunkt). */
  distanceKm: number | null;
}

/**
 * Harter Geofilter (spec Q4) als Umkreis um den Gebietsmittelpunkt.
 *
 * Ersetzt bewusst den PLZ-Praefix-Vergleich aus spec Q7: Hamburg verteilt sich
 * auf die Praefixe 20, 21 und 22, weshalb ein Praefix-Filter in Lauf 7 neunzehn
 * von sechsundzwanzig korrekten Treffern verwarf -- darunter Firmen in derselben
 * PLZ wie das Xortec-Buero (20097), bei 0 km Entfernung.
 *
 * Nicht entscheidbare Faelle gelten als "drin": ohne Adresse kann der Filter
 * nichts belegen, und das Datenqualitaets-Scoring (spec §5) stuft solche Leads
 * ohnehin herab.
 */
export function checkAreaRadius(
  areaCentroid: { lat: number; lon: number } | null,
  postalCode: string | null,
  radiusKm: number
): GeofilterVerdict {
  if (!areaCentroid) return { outside: false, distanceKm: null };

  const candidateCentroid = lookupPlzCentroid(postalCode);
  if (!candidateCentroid) return { outside: false, distanceKm: null };

  const distanceKm = haversineKm(
    areaCentroid.lat,
    areaCentroid.lon,
    candidateCentroid.lat,
    candidateCentroid.lon
  );
  return { outside: distanceKm > radiusKm, distanceKm };
}
