// Baut data/plz-areas.json: die Liste der PLZ-Praefixe im Vertriebsgebiet
// (Hamburg, Niedersachsen, Bremen, NRW -- spec §1) als Abarbeitungsreihenfolge
// fuer den Nacht-Cron (spec Q13, offener Punkt §8.3).
//
// ACHTUNG zur Reihenfolge: Die Spec schlaegt "nach Betriebsdichte" vor. Diese
// Zahl gibt es in den GeoNames-Postleitzahldaten nicht. Sortiert wird deshalb
// nach der Anzahl der Postleitzahlen je Praefix, die im Zielgebiet liegen --
// ein grober Stadt-vor-Land-Proxy, KEINE echte Betriebsdichte. Die Datei ist
// bewusst editierbar: Reihenfolge nach eigener Marktkenntnis umsortieren.
//
// Aufruf: node scripts/build-plz-areas.mjs <pfad-zu-DE.txt>
import { readFileSync, writeFileSync } from "node:fs";

// GeoNames fuehrt einige Bundeslaender deutsch UND englisch.
const ZIELGEBIET = new Set([
  "Hamburg",
  "Bremen",
  "Niedersachsen",
  "Lower Saxony",
  "Nordrhein-Westfalen",
  "North Rhine-Westphalia",
]);

const inputPath = process.argv[2];
if (!inputPath) {
  console.error("Usage: node scripts/build-plz-areas.mjs <DE.txt>");
  process.exit(1);
}

// Einzelne GeoNames-Zeilen tragen ein falsches Bundesland (dieselbe Datenmacke
// wie bei firmeneigenen Grosskunden-PLZ). Ein Praefix nur deshalb aufzunehmen,
// weil ein bis zwei Zeilen "Hamburg" behaupten, holte sonst Berlin, Leipzig,
// Frankfurt und Muenchen ins Vertriebsgebiet. Deshalb zaehlen wir pro Praefix
// auch die Gesamtzahl der PLZ und verlangen einen Mindestanteil im Zielgebiet.
const MIN_ANTEIL_IM_ZIELGEBIET = 0.25;

const areas = new Map(); // praefix -> { plz:Set, alle:Set, laender:Map<land,count>, orte:Map<name,count> }

for (const line of readFileSync(inputPath, "utf-8").split("\n")) {
  if (!line) continue;
  const cols = line.split("\t");
  const plz = cols[1]?.trim();
  const ort = cols[2]?.trim();
  const land = cols[3]?.trim();
  if (!plz || !/^\d{5}$/.test(plz)) continue;

  const prefix = plz.slice(0, 2);
  const entry =
    areas.get(prefix) ?? { plz: new Set(), alle: new Set(), laender: new Map(), orte: new Map() };
  entry.alle.add(plz);

  if (land && ZIELGEBIET.has(land)) {
    entry.plz.add(plz);
    entry.laender.set(land, (entry.laender.get(land) ?? 0) + 1);
    if (ort) entry.orte.set(ort, (entry.orte.get(ort) ?? 0) + 1);
  }
  areas.set(prefix, entry);
}

const NORMALISIERT = { "Lower Saxony": "Niedersachsen", "North Rhine-Westphalia": "Nordrhein-Westfalen" };

const verworfen = [];
const liste = [];

for (const [prefix, e] of areas) {
  if (e.plz.size === 0) continue;
  const anteil = e.plz.size / e.alle.size;
  const eintrag = {
    areaCode: prefix,
    hauptort: [...e.orte.entries()].sort(([, a], [, b]) => b - a)[0]?.[0] ?? null,
    // Nur Bundeslaender, die mehr als eine Streuzeile beisteuern -- sonst taucht
    // z.B. Koeln als "Hamburg/Nordrhein-Westfalen" auf.
    bundeslaender: [
      ...new Set(
        [...e.laender.entries()]
          .filter(([, count]) => count > 1)
          .map(([l]) => NORMALISIERT[l] ?? l)
      ),
    ].sort(),
    plzImZielgebiet: e.plz.size,
    anteilImZielgebiet: Math.round(anteil * 100) / 100,
  };
  if (anteil >= MIN_ANTEIL_IM_ZIELGEBIET) liste.push(eintrag);
  else verworfen.push(eintrag);
}

liste.sort((a, b) => b.plzImZielgebiet - a.plzImZielgebiet || a.areaCode.localeCompare(b.areaCode));

writeFileSync(
  "data/plz-areas.json",
  JSON.stringify(
    {
      hinweis:
        "Abarbeitungsreihenfolge des Nacht-Cron. Sortiert nach Anzahl PLZ im Zielgebiet " +
        "(grober Stadt-vor-Land-Proxy, keine echte Betriebsdichte). Reihenfolge darf " +
        "nach Marktkenntnis umsortiert werden -- der Cron arbeitet das Array von oben nach unten ab.",
      quelle: "GeoNames DE.zip (CC BY 4.0), siehe data/plz-centroids.SOURCE.md",
      gebiete: liste,
    },
    null,
    2
  ) + "\n"
);

console.log(`${liste.length} PLZ-Gebiete geschrieben nach data/plz-areas.json`);
console.log("Top 10:", liste.slice(0, 10).map((a) => `${a.areaCode} (${a.hauptort}, ${a.plzImZielgebiet})`).join(", "));
if (verworfen.length > 0) {
  console.log(
    `\nWegen zu geringem Anteil verworfen (< ${MIN_ANTEIL_IM_ZIELGEBIET * 100} %):`,
    verworfen
      .sort((a, b) => b.anteilImZielgebiet - a.anteilImZielgebiet)
      .map((a) => `${a.areaCode} (${a.hauptort ?? "?"}, ${Math.round(a.anteilImZielgebiet * 100)} %)`)
      .join(", ")
  );
}
