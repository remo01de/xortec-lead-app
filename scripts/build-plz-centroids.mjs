// Einmaliger Konvertierungsschritt: GeoNames DE.txt (tab-getrennt, mehrere
// Zeilen pro PLZ, CC BY 4.0, https://download.geonames.org/export/zip/DE.zip)
// -> data/plz-centroids.csv (eine Zeile pro PLZ, gemittelte Koordinaten).
// Aufruf: node scripts/build-plz-centroids.mjs <pfad-zu-DE.txt>
import { readFileSync, writeFileSync } from "node:fs";

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-plz-centroids.mjs <DE.txt>");
  process.exit(1);
}

const lines = readFileSync(inputPath, "utf-8").split("\n").filter(Boolean);
const sums = new Map(); // plz -> {latSum, lonSum, count}

for (const line of lines) {
  const cols = line.split("\t");
  const plz = cols[1]?.trim();
  const lat = Number(cols[9]);
  const lon = Number(cols[10]);
  if (!plz || !/^\d{5}$/.test(plz) || Number.isNaN(lat) || Number.isNaN(lon)) continue;

  const entry = sums.get(plz) ?? { latSum: 0, lonSum: 0, count: 0 };
  entry.latSum += lat;
  entry.lonSum += lon;
  entry.count += 1;
  sums.set(plz, entry);
}

const rows = [...sums.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([plz, { latSum, lonSum, count }]) => `${plz},${(latSum / count).toFixed(6)},${(lonSum / count).toFixed(6)}`);

writeFileSync("data/plz-centroids.csv", rows.join("\n") + "\n");
console.log(`${rows.length} PLZ-Zentroide geschrieben nach data/plz-centroids.csv`);
