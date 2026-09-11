import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getCompanyById,
  updateCompanyStatus,
} from "../../db/companies.repo.js";
import { getDb } from "../../db/db.js";
import { listEvidenceByCompany } from "../../db/evidence.repo.js";
import { listSourcesByCompany } from "../../db/sources.repo.js";
import type { LeadStatus, CompanyRow } from "../../db/types.js";
import { matchIdentity } from "../../research/identity.js";
import { toCsv } from "../../util/csv.js";
import { haversineKm } from "../../util/geo.js";
import { serializeCompany } from "../serialize.js";

const LEAD_STATUSES: LeadStatus[] = ["neu", "angerufen", "kein_interesse", "in_salesforce", "bestandskunde"];

const listQuerySchema = z.object({
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().optional(),
  priority: z.enum(['A', 'B', 'C']).optional(),
  status: z.enum(['neu', 'angerufen', 'kein_interesse', 'in_salesforce', 'bestandskunde', 'all']).optional(),
}).refine(q => (q.lat === undefined) === (q.lon === undefined), 'Standort benötigt lat und lon.');

const statusBodySchema = z.object({
  status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]),
  note: z.string().max(5000).nullable().optional(),
});

export function selectCompanies(db: ReturnType<typeof getDb>, query: z.infer<typeof listQuerySchema>, all = false) {
  const rows = db.prepare(all ? 'SELECT * FROM companies' : "SELECT * FROM companies WHERE verification_status = 'verified' AND score_fachlichkeit >= 35").all() as unknown as CompanyRow[];
  return rows.filter(row => (!query.priority || row.priority === query.priority) &&
    (query.status === 'all' || (query.status ? row.status === query.status : row.status !== 'bestandskunde')))
    .flatMap(row => {
      if (query.lat === undefined || query.lon === undefined) return [{ row, distanceKm: undefined as number | undefined }];
      if (row.lat === null || row.lon === null) return [];
      const distanceKm = haversineKm(query.lat, query.lon, row.lat, row.lon);
      return query.radiusKm === undefined || distanceKm <= query.radiusKm ? [{ row, distanceKm }] : [];
    }).sort((a, b) => a.distanceKm !== undefined && b.distanceKm !== undefined ? a.distanceKm - b.distanceKm : b.row.score_fachlichkeit * b.row.score_potenzial - a.row.score_fachlichkeit * a.row.score_potenzial);
}

export function registerCompanyRoutes(app: FastifyInstance): void {
  app.get('/api/companies/quality', async () => {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM companies').all() as unknown as CompanyRow[];
    const duplicates = [];
    for (let i = 0; i < rows.length; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i]!, b = rows[j]!, match = matchIdentity(a, b);
      if (match) duplicates.push({ first: { id: a.id, companyName: a.company_name }, second: { id: b.id, companyName: b.company_name }, ...match });
    }
    return { feedback: db.prepare('SELECT sales_feedback, COUNT(*) AS count FROM companies GROUP BY sales_feedback').all(), duplicates };
  });
  // Ebene 3 (spec §2): reine DB-Abfrage, kein API-Call.
  app.get("/api/companies", async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    return selectCompanies(getDb(), parsed.data).map(({ row, distanceKm }) => serializeCompany(row, distanceKm));
  });

  app.get('/api/companies/export', async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const all = (req.query as { scope?: string }).scope === 'all';
    const db = getDb();
    const selected = selectCompanies(db, all ? { ...parsed.data, status: parsed.data.status ?? 'all' } : parsed.data, all);
    const headers = ['ID', 'Firmenname', 'Domain', 'Website', 'Straße', 'PLZ', 'Ort', 'Telefon', 'Status', 'Priorität', 'Fachlichkeit', 'Potenzial', 'Datenqualität', 'Verifikation', 'Entfernung km', 'Notiz', 'Vertriebsfeedback', 'Feedback-Begründung', 'Leistungen', 'Zielsegmente', 'Herstellerbindungen', 'Zertifikate', 'Quellen', 'Belege', 'Stand'];
    const rows = selected.map(({ row: c, distanceKm }) => [c.id, c.company_name, c.domain, c.website, c.street, c.postal_code, c.city, c.phone, c.status, c.priority, c.score_fachlichkeit, c.score_potenzial, c.score_datenqualitaet, c.verification_status, distanceKm?.toFixed(1), c.note, c.sales_feedback, c.feedback_note, JSON.parse(c.services).join(' | '), JSON.parse(c.target_segments).join(' | '), JSON.parse(c.manufacturer_mentions).map((m: {manufacturer: string; relationship: string}) => `${m.manufacturer}: ${m.relationship}`).join(' | '), JSON.parse(c.certifications).join(' | '), listSourcesByCompany(db, c.id).map(s => s.url).join(' | '), listEvidenceByCompany(db, c.id).map(e => e.text).join(' | '), c.last_updated]);
    return reply.type('text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="xortec-leads.csv"').header('Cache-Control', 'no-store').send(toCsv([headers, ...rows]));
  });

  app.get("/api/companies/:id", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const db = getDb();
    const row = getCompanyById(db, id);
    if (!row) return reply.code(404).send({ error: "not found" });

    return {
      ...serializeCompany(row),
      sources: listSourcesByCompany(db, id),
      evidence: listEvidenceByCompany(db, id).map((e) => e.text),
      duplicates: (db.prepare('SELECT * FROM companies WHERE id != ?').all(id) as unknown as CompanyRow[]).flatMap(c => {
        const match = matchIdentity(row, c);
        return match ? [{ id: c.id, companyName: c.company_name, domain: c.domain, address: [c.street, c.postal_code, c.city].filter(Boolean).join(', '), ...match }] : [];
      }),
    };
  });

  app.patch("/api/companies/:id/status", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const parsed = statusBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const db = getDb();
    const existing = getCompanyById(db, id);
    if (!existing) return reply.code(404).send({ error: "not found" });

    updateCompanyStatus(db, id, parsed.data.status, parsed.data.note === undefined ? existing.note : parsed.data.note);
    return serializeCompany(getCompanyById(db, id)!);
  });

  app.patch('/api/companies/:id/feedback', async (req, reply) => {
    const id = Number((req.params as {id: string}).id);
    if (!Number.isSafeInteger(id) || id <= 0) return reply.code(400).send({ error: 'Ungültige ID.' });
    const parsed = z.object({ feedback: z.enum(['good_fit', 'poor_fit', 'uncertain']).nullable(), note: z.string().max(5000).nullable() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ungültiges Feedback.' });
    const db = getDb();
    if (!getCompanyById(db, id)) return reply.code(404).send({ error: 'Firma nicht gefunden.' });
    db.prepare("UPDATE companies SET sales_feedback = ?, feedback_note = ?, last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?").run(parsed.data.feedback, parsed.data.note, id);
    return serializeCompany(getCompanyById(db, id)!);
  });
}
