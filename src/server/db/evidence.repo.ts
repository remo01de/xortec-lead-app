import type { DatabaseSync } from "node:sqlite";
import type { EvidenceRow } from "./types.js";

export function insertEvidence(db: DatabaseSync, companyId: number, texts: string[]): void {
  const stmt = db.prepare("INSERT INTO evidence (company_id, text) VALUES (?, ?)");
  for (const text of texts) stmt.run(companyId, text);
}

export function listEvidenceByCompany(db: DatabaseSync, companyId: number): EvidenceRow[] {
  return db.prepare("SELECT * FROM evidence WHERE company_id = ?").all(companyId) as unknown as EvidenceRow[];
}
