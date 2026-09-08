import type { DatabaseSync } from "node:sqlite";
import type { RunRow, RunTrigger } from "./types.js";

export function createRun(db: DatabaseSync, areaCode: string, trigger: RunTrigger): number {
  const info = db
    .prepare("INSERT INTO runs (area_code, trigger) VALUES (?, ?)")
    .run(areaCode, trigger);
  return Number(info.lastInsertRowid);
}

export function updateRunStats(
  db: DatabaseSync,
  runId: number,
  stats: {
    candidatesFound: number;
    candidatesQualified: number;
    apiCalls: number;
    costEur: number;
  }
): void {
  db.prepare(
    `UPDATE runs SET candidates_found = ?, candidates_qualified = ?, api_calls = ?, cost_eur = ?
     WHERE id = ?`
  ).run(stats.candidatesFound, stats.candidatesQualified, stats.apiCalls, stats.costEur, runId);
}

export function getRunById(db: DatabaseSync, runId: number): RunRow | undefined {
  return db.prepare("SELECT * FROM runs WHERE id = ?").get(runId) as RunRow | undefined;
}

export function listRecentRuns(db: DatabaseSync, limit = 20): RunRow[] {
  return db.prepare("SELECT * FROM runs ORDER BY started_at DESC LIMIT ?").all(limit) as unknown as RunRow[];
}
