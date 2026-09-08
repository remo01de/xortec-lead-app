// Baut data/plz-area-places.json: zweistelliges PLZ-Praefix -> Liste
// repraesentativer Ortsnamen. Grund: eine Stufe-1-Suchanfrage wie
// "Postleitzahlengebiet 21" ist fuer die Perplexity Search API offenbar kein
// wirksames geografisches Signal (Livetest 2026-09-07: 0 von 21 Treffern lagen
// tatsaechlich in Gebiet 21). Spec Q4 verlangt eine echte Orts-/PLZ-Liste im
// Prompt -- diese hier wird aus den GeoNames-Rohdaten erzeugt (siehe
// data/plz-centroids.SOURCE.md fuer Quelle/Lizenz).
// Aufruf: node scripts/build-plz-area-places.mjs <pfad-zu-DE.txt>
import { readFileSync, writeFileSync } from "node:fs";

const MAX_PLACES_PER_AREA = 20;

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-plz-area-places.mjs <DE.txt>");
  process.exit(1);
}

const lines = readFileSync(inputPath, "utf-8").split("\n").filter(Boolean);
// "21" -> Map<placeName, occurrenceCount> -- Anzahl der PLZ, die auf diesen Ort
// verweisen, als grober Proxy fuer "grosse/zentrale Stadt zuerst nennen".
const areas = new Map();

for (const line of lines) {
  const cols = line.split("\t");
  const plz = cols[1]?.trim();
  const placeName = cols[2]?.trim();
  if (!plz || !/^\d{5}$/.test(plz) || !placeName) continue;

  const prefix = plz.slice(0, 2);
  const counts = areas.get(prefix) ?? new Map();
  counts.set(placeName, (counts.get(placeName) ?? 0) + 1);
  areas.set(prefix, counts);
}

const result = {};
for (const [prefix, counts] of [...areas.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  result[prefix] = [...counts.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_PLACES_PER_AREA)
    .map(([name]) => name);
}

writeFileSync("data/plz-area-places.json", JSON.stringify(result, null, 2) + "\n");
console.log(`${Object.keys(result).length} PLZ-Praefixe geschrieben nach data/plz-area-places.json`);
