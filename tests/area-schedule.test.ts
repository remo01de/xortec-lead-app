import { createRequire } from "node:module";
import type { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { loadAreas, pickNextAreas } from "../src/server/research/area-schedule.js";

// node:sqlite zur Laufzeit laden: Vite/Vitest kennt diesen jungen Builtin nicht
// und versucht sonst, ein Paket namens "sqlite" aufzuloesen. Ein statischer
// Import scheitert deshalb schon beim Laden der Testdatei.
const nodeRequire = createRequire(import.meta.url);
const { DatabaseSync: Database } = nodeRequire("node:sqlite") as {
  DatabaseSync: new (path: string) => DatabaseSync;
};

function makeDb(): DatabaseSync {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_code TEXT NOT NULL,
      started_at TEXT NOT NULL,
      trigger TEXT NOT NULL
    )
  `);
  return db;
}

function recordRun(db: DatabaseSync, areaCode: string, startedAt: string): void {
  db.prepare("INSERT INTO runs (area_code, started_at, trigger) VALUES (?, ?, 'cron')").run(
    areaCode,
    startedAt
  );
}

describe("loadAreas", () => {
  it("laedt die Gebietsliste und enthaelt nur das Vertriebsgebiet", () => {
    const areas = loadAreas();
    expect(areas.length).toBeGreaterThan(20);
    // Hamburg, Bremen, Hannover, Koeln muessen drin sein ...
    const codes = areas.map((a) => a.areaCode);
    for (const expected of ["20", "21", "22", "28", "30", "50"]) {
      expect(codes, `Praefix ${expected} fehlt`).toContain(expected);
    }
    // ... Berlin, Leipzig, Muenchen und Frankfurt nicht (Grosskunden-PLZ mit
    // falschem Bundesland hatten die frueher hereingezogen).
    for (const unexpected of ["10", "04", "80", "60"]) {
      expect(codes, `Praefix ${unexpected} gehoert nicht ins Gebiet`).not.toContain(unexpected);
    }
  });
});

describe("pickNextAreas", () => {
  let db: DatabaseSync;
  beforeEach(() => {
    db = makeDb();
  });

  it("nimmt bei leerer runs-Tabelle die ersten Gebiete der Liste", () => {
    const picked = pickNextAreas(db, 2);
    const listenAnfang = loadAreas().slice(0, 2);
    expect(picked.map((a) => a.areaCode)).toEqual(listenAnfang.map((a) => a.areaCode));
  });

  it("bevorzugt nie recherchierte Gebiete vor laengst recherchierten", () => {
    const areas = loadAreas();
    // Die ersten beiden gerade eben gelaufen -> sie duerfen nicht drankommen.
    recordRun(db, areas[0]!.areaCode, "2026-09-08T02:00:00.000Z");
    recordRun(db, areas[1]!.areaCode, "2026-09-08T02:30:00.000Z");

    const picked = pickNextAreas(db, 2).map((a) => a.areaCode);
    expect(picked).not.toContain(areas[0]!.areaCode);
    expect(picked).not.toContain(areas[1]!.areaCode);
    expect(picked).toEqual([areas[2]!.areaCode, areas[3]!.areaCode]);
  });

  it("nimmt das am laengsten zurueckliegende Gebiet, wenn alle schon liefen", () => {
    const areas = loadAreas();
    const basis = new Date("2026-09-08T02:00:00.000Z").getTime();
    areas.forEach((area, i) => {
      // Je weiter hinten in der Liste, desto laenger her -- jeweils einen Tag
      // frueher, damit es keine Gleichstaende gibt.
      recordRun(db, area.areaCode, new Date(basis - i * 86_400_000).toISOString());
    });

    const picked = pickNextAreas(db, 1);
    expect(picked[0]!.areaCode).toBe(areas[areas.length - 1]!.areaCode);
  });

  it("zaehlt den juengsten Lauf eines Gebiets, nicht den aeltesten", () => {
    const areas = loadAreas();
    recordRun(db, areas[0]!.areaCode, "2026-01-01T02:00:00.000Z");
    recordRun(db, areas[0]!.areaCode, "2026-09-08T02:00:00.000Z"); // gerade erst gelaufen

    const picked = pickNextAreas(db, 1).map((a) => a.areaCode);
    expect(picked).not.toContain(areas[0]!.areaCode);
  });

  it("liefert nie mehr Gebiete als angefragt", () => {
    expect(pickNextAreas(db, 2)).toHaveLength(2);
    expect(pickNextAreas(db, 5)).toHaveLength(5);
  });
});
