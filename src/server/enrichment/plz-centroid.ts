import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Offline-Fallback fuer nicht auflösbare Adressen (spec §2 Ebene 2: "PLZ-Mittelpunkt
 * aus Offline-Datensatz (±5 km)"). CSV-Format: plz,lat,lon (kein Header).
 *
 * data/plz-centroids.csv: 10.813 PLZ, aggregiert aus GeoNames DE.zip
 * (CC BY 4.0, siehe data/plz-centroids.SOURCE.md fuer Quelle/Lizenz/Erzeugung).
 */

const CSV_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../data/plz-centroids.csv");

let cache: Map<string, { lat: number; lon: number }> | null = null;
let warnedMissing = false;

function loadData(): Map<string, { lat: number; lon: number }> {
  if (cache) return cache;
  cache = new Map();

  if (!existsSync(CSV_PATH)) {
    if (!warnedMissing) {
      console.warn(`[plz-centroid] ${CSV_PATH} fehlt -- PLZ-Fallback liefert keine Treffer.`);
      warnedMissing = true;
    }
    return cache;
  }

  const raw = readFileSync(CSV_PATH, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [plz, lat, lon] = trimmed.split(",");
    if (!plz || !lat || !lon) continue;
    cache.set(plz.trim(), { lat: Number(lat), lon: Number(lon) });
  }
  return cache;
}

export function lookupPlzCentroid(postalCode: string | null): { lat: number; lon: number } | null {
  if (!postalCode) return null;
  return loadData().get(postalCode) ?? null;
}

/**
 * Mittelpunkt eines zweistelligen PLZ-Praefix-Gebiets (Mittelwert aller
 * darunterliegenden PLZ-Zentroide). Fuer die Finder-Call-Instruktionen (Q4:
 * Radius-Framing statt reinem PLZ-Text, siehe run-orchestrator.ts).
 */
export function getAreaCentroid(areaCode: string): { lat: number; lon: number } | null {
  const all = loadData();
  let latSum = 0;
  let lonSum = 0;
  let count = 0;
  for (const [plz, { lat, lon }] of all) {
    if (plz.startsWith(areaCode)) {
      latSum += lat;
      lonSum += lon;
      count++;
    }
  }
  return count > 0 ? { lat: latSum / count, lon: lonSum / count } : null;
}

/** Nur fuer Tests: erzwingt Neuladen der CSV. */
export function resetPlzCentroidCache(): void {
  cache = null;
  warnedMissing = false;
}
