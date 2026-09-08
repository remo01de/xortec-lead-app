import type { DatabaseSync } from "node:sqlite";
import type { CompanyRow, GeocodeSource, LeadStatus, Priority, VerificationStatus } from "./types.js";

export interface NewCompany {
  domain: string;
  companyName: string;
  website: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  companyType: string | null;
  services: string[];
  targetSegments: string[];
  manufacturerMentions: unknown[];
  certifications: string[];
  firstSeenRunId: number;
  note?: string | null;
}

export interface EnrichmentUpdate {
  lat: number | null;
  lon: number | null;
  geocodeSource: GeocodeSource;
  scoreFachlichkeit: number;
  scorePotenzial: number;
  scoreDatenqualitaet: number;
  priority: Priority;
  verificationStatus: VerificationStatus;
}

export function findCompanyByDomain(db: DatabaseSync, domain: string): CompanyRow | undefined {
  return db.prepare("SELECT * FROM companies WHERE domain = ?").get(domain) as CompanyRow | undefined;
}

export function insertCompany(db: DatabaseSync, c: NewCompany): number {
  const stmt = db.prepare(`
    INSERT INTO companies (
      domain, company_name, website, street, postal_code, city, phone,
      company_type, services, target_segments, manufacturer_mentions, certifications,
      first_seen_run_id, note
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    c.domain,
    c.companyName,
    c.website,
    c.street,
    c.postalCode,
    c.city,
    c.phone,
    c.companyType,
    JSON.stringify(c.services),
    JSON.stringify(c.targetSegments),
    JSON.stringify(c.manufacturerMentions),
    JSON.stringify(c.certifications),
    c.firstSeenRunId,
    c.note ?? null
  );
  return Number(info.lastInsertRowid);
}

export function updateCompanyEnrichment(db: DatabaseSync, companyId: number, u: EnrichmentUpdate): void {
  db.prepare(`
    UPDATE companies SET
      lat = ?, lon = ?, geocode_source = ?,
      score_fachlichkeit = ?, score_potenzial = ?, score_datenqualitaet = ?,
      priority = ?, verification_status = ?,
      last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(
    u.lat,
    u.lon,
    u.geocodeSource,
    u.scoreFachlichkeit,
    u.scorePotenzial,
    u.scoreDatenqualitaet,
    u.priority,
    u.verificationStatus,
    companyId
  );
}

export function updateCompanyStatus(
  db: DatabaseSync,
  companyId: number,
  status: LeadStatus,
  note: string | null
): void {
  db.prepare(`
    UPDATE companies SET status = ?, note = ?, last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    WHERE id = ?
  `).run(status, note, companyId);
}

/**
 * Kandidaten fuer die Feldansicht: verifiziert, Fachlichkeit >= 35, hat Koordinaten.
 * Entfernungsfilter/-sortierung passiert im API-Layer (companies.ts route), da
 * SQLite keine Haversine-Funktion mitbringt und die Zeilenzahl klein bleibt.
 */
export function listVerifiedCompaniesWithCoordinates(db: DatabaseSync): CompanyRow[] {
  return db
    .prepare(
      `SELECT * FROM companies
       WHERE verification_status = 'verified'
         AND score_fachlichkeit >= 35
         AND lat IS NOT NULL AND lon IS NOT NULL
         AND status != 'bestandskunde'`
    )
    .all() as unknown as CompanyRow[];
}

/** Schreibtisch-Ansicht: alle sichtbaren Leads, Sortierung Fachlichkeit x Potenzial macht die Route. */
export function listVisibleCompanies(db: DatabaseSync): CompanyRow[] {
  return db
    .prepare(
      `SELECT * FROM companies
       WHERE verification_status = 'verified' AND score_fachlichkeit >= 35`
    )
    .all() as unknown as CompanyRow[];
}

export function getCompanyById(db: DatabaseSync, id: number): CompanyRow | undefined {
  return db.prepare("SELECT * FROM companies WHERE id = ?").get(id) as CompanyRow | undefined;
}

export function listAllDomains(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT domain FROM companies").all() as Array<{ domain: string }>;
  return new Set(rows.map((r) => r.domain));
}
