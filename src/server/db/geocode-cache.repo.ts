import type { DatabaseSync } from "node:sqlite";

export interface CachedGeocode {
  lat: number | null;
  lon: number | null;
}

export function getCachedGeocode(db: DatabaseSync, addressKey: string): CachedGeocode | undefined {
  return db
    .prepare("SELECT lat, lon FROM geocode_cache WHERE address_key = ?")
    .get(addressKey) as CachedGeocode | undefined;
}

export function setCachedGeocode(
  db: DatabaseSync,
  addressKey: string,
  lat: number | null,
  lon: number | null
): void {
  db.prepare(
    `INSERT INTO geocode_cache (address_key, lat, lon) VALUES (?, ?, ?)
     ON CONFLICT (address_key) DO UPDATE SET lat = excluded.lat, lon = excluded.lon,
       resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run(addressKey, lat, lon);
}
