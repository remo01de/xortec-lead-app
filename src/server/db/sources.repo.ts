import type { DatabaseSync } from "node:sqlite";
import type { SourceRow } from "./types.js";

export interface NewSource {
  url: string;
  title: string;
  evidence: string;
}

export function insertSources(db: DatabaseSync, companyId: number, sources: NewSource[]): number[] {
  const stmt = db.prepare(
    "INSERT INTO sources (company_id, url, title, evidence) VALUES (?, ?, ?, ?)"
  );
  return sources.map((s) => Number(stmt.run(companyId, s.url, s.title, s.evidence).lastInsertRowid));
}

export function listSourcesByCompany(db: DatabaseSync, companyId: number): SourceRow[] {
  return db.prepare("SELECT * FROM sources WHERE company_id = ?").all(companyId) as unknown as SourceRow[];
}

export function markSourceHttpChecked(
  db: DatabaseSync,
  sourceId: number,
  ok: boolean,
  checkedAt: string
): void {
  db.prepare("UPDATE sources SET http_ok = ?, checked_at = ? WHERE id = ?").run(
    ok ? 1 : 0,
    checkedAt,
    sourceId
  );
}
