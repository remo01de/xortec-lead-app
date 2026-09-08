import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Reihenfolge, in der der Nacht-Cron die PLZ-Gebiete abarbeitet (spec Q13,
 * offener Punkt §8.3). Die Liste steht in data/plz-areas.json und ist von Hand
 * umsortierbar; erzeugt wird sie mit scripts/build-plz-areas.mjs.
 *
 * Welche Gebiete als naechstes drankommen, wird NICHT als eigener Zeiger
 * gespeichert, sondern aus der runs-Tabelle abgeleitet: es gewinnt, was am
 * laengsten nicht recherchiert wurde. Das braucht kein zusaetzliches Schema,
 * ueberlebt Neustarts, und ein manuell ausgeloester Lauf schiebt sein Gebiet
 * automatisch ans Ende der Warteschlange.
 */

const AREAS_PATH = join(dirname(fileURLToPath(import.meta.url)), "../../../data/plz-areas.json");

export interface PlzArea {
  areaCode: string;
  hauptort: string | null;
  bundeslaender: string[];
  plzImZielgebiet: number;
}

let cachedAreas: PlzArea[] | undefined;

export function loadAreas(): PlzArea[] {
  if (!cachedAreas) {
    try {
      const parsed = JSON.parse(readFileSync(AREAS_PATH, "utf-8")) as { gebiete?: PlzArea[] };
      cachedAreas = parsed.gebiete ?? [];
    } catch {
      cachedAreas = [];
    }
  }
  return cachedAreas;
}

/**
 * Die naechsten `count` Gebiete: noch nie recherchierte zuerst (in Listen-
 * reihenfolge), danach die am laengsten zurueckliegenden.
 */
export function pickNextAreas(db: DatabaseSync, count: number): PlzArea[] {
  const areas = loadAreas();
  if (areas.length === 0) return [];

  const rows = db
    .prepare("SELECT area_code, MAX(started_at) AS last_run FROM runs GROUP BY area_code")
    .all() as unknown as Array<{ area_code: string; last_run: string }>;
  const lastRunByArea = new Map(rows.map((r) => [r.area_code, r.last_run]));

  return [...areas]
    .map((area, index) => ({ area, index, lastRun: lastRunByArea.get(area.areaCode) }))
    .sort((a, b) => {
      if (a.lastRun === undefined && b.lastRun === undefined) return a.index - b.index;
      if (a.lastRun === undefined) return -1;
      if (b.lastRun === undefined) return 1;
      return a.lastRun.localeCompare(b.lastRun);
    })
    .slice(0, count)
    .map((entry) => entry.area);
}
