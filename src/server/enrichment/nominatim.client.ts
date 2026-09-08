import type { DatabaseSync } from "node:sqlite";
import { config } from "../config.js";
import { getCachedGeocode, setCachedGeocode } from "../db/geocode-cache.repo.js";

/**
 * Geocoding ueber die oeffentliche Nominatim-API, gedrosselt auf 1 Request/15s
 * (spec §2 Ebene 2, OSMF-Nutzungsrichtlinie: max. 4/min fuer Skripte, Caching
 * verpflichtend -- siehe geocode-cache.repo.ts).
 */

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 15_000;

let requestChain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function scheduleThrottled<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestChain.then(async () => {
    const wait = Math.max(0, lastRequestAt + MIN_INTERVAL_MS - Date.now());
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  // Folgeaufrufe warten auf diese Anfrage, unabhaengig von Erfolg/Fehler.
  requestChain = run.catch(() => undefined);
  return run;
}

export function buildAddressKey(street: string | null, postalCode: string | null, city: string | null): string {
  return [street, postalCode, city].filter(Boolean).join(", ").toLowerCase().trim();
}

export interface GeocodeResult {
  lat: number;
  lon: number;
}

async function fetchFromNominatim(addressKey: string): Promise<GeocodeResult | null> {
  if (!config.nominatimContactEmail) {
    throw new Error("NOMINATIM_CONTACT_EMAIL ist nicht gesetzt (.env) -- Pflichtangabe der OSMF-Nutzungsrichtlinie");
  }
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("format", "json");
  url.searchParams.set("q", addressKey);
  url.searchParams.set("countrycodes", "de");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      "User-Agent": `XortecLeadApp/0.1 (${config.nominatimContactEmail})`,
    },
  });

  if (!res.ok) {
    throw new Error(`Nominatim HTTP ${res.status} fuer "${addressKey}"`);
  }

  const results = (await res.json()) as Array<{ lat: string; lon: string }>;
  const first = results[0];
  if (!first) return null;
  return { lat: Number(first.lat), lon: Number(first.lon) };
}

/**
 * Loest eine Adresse auf. Nutzt permanenten Cache; fragt Nominatim nur bei
 * Cache-Miss an, gedrosselt auf 1 Request/15s ueber alle Aufrufer hinweg.
 * Wirft bei Netzwerk-/HTTP-Fehlern -- Aufrufer entscheidet ueber PLZ-Fallback.
 */
export async function geocodeAddress(
  db: DatabaseSync,
  street: string | null,
  postalCode: string | null,
  city: string | null
): Promise<GeocodeResult | null> {
  const addressKey = buildAddressKey(street, postalCode, city);
  if (!addressKey) return null;

  const cached = getCachedGeocode(db, addressKey);
  if (cached) {
    return cached.lat !== null && cached.lon !== null ? { lat: cached.lat, lon: cached.lon } : null;
  }

  const result = await scheduleThrottled(() => fetchFromNominatim(addressKey));
  setCachedGeocode(db, addressKey, result?.lat ?? null, result?.lon ?? null);
  return result;
}
