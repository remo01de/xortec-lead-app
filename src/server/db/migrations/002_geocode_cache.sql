-- Dauerhafter Geocode-Cache (Pflicht der OSMF-Nutzungsrichtlinie fuer Nominatim,
-- siehe docs/spezifikation.md §2 Ebene 2). Schluessel ist die normalisierte
-- Adresse, damit mehrere Firmen an derselben Adresse nicht erneut angefragt werden.

CREATE TABLE geocode_cache (
  address_key TEXT PRIMARY KEY,
  lat REAL,
  lon REAL,
  resolved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
