import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  getCompanyById,
  listVerifiedCompaniesWithCoordinates,
  listVisibleCompanies,
  updateCompanyStatus,
} from "../../db/companies.repo.js";
import { getDb } from "../../db/db.js";
import { listEvidenceByCompany } from "../../db/evidence.repo.js";
import { listSourcesByCompany } from "../../db/sources.repo.js";
import type { LeadStatus } from "../../db/types.js";
import { haversineKm } from "../../util/geo.js";
import { serializeCompany } from "../serialize.js";

const LEAD_STATUSES: LeadStatus[] = ["neu", "angerufen", "kein_interesse", "in_salesforce", "bestandskunde"];

const listQuerySchema = z.object({
  lat: z.coerce.number().optional(),
  lon: z.coerce.number().optional(),
  radiusKm: z.coerce.number().positive().optional(),
});

const statusBodySchema = z.object({
  status: z.enum(LEAD_STATUSES as [LeadStatus, ...LeadStatus[]]),
  note: z.string().nullable().optional(),
});

export function registerCompanyRoutes(app: FastifyInstance): void {
  // Ebene 3 (spec §2): reine DB-Abfrage, kein API-Call.
  app.get("/api/companies", async (req, reply) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });
    const { lat, lon, radiusKm } = parsed.data;
    const db = getDb();

    if (lat !== undefined && lon !== undefined) {
      // Feldansicht: Umkreis + Entfernungssortierung (spec Q12, Q15).
      const rows = listVerifiedCompaniesWithCoordinates(db);
      const withDistance = rows
        .map((row) => ({ row, distanceKm: haversineKm(lat, lon, row.lat!, row.lon!) }))
        .filter((r) => radiusKm === undefined || r.distanceKm <= radiusKm)
        .sort((a, b) => a.distanceKm - b.distanceKm);
      return withDistance.map(({ row, distanceKm }) => serializeCompany(row, distanceKm));
    }

    // Schreibtisch-Ansicht: Sortierung Fachlichkeit x Potenzial (spec §5).
    const rows = listVisibleCompanies(db);
    rows.sort((a, b) => b.score_fachlichkeit * b.score_potenzial - a.score_fachlichkeit * a.score_potenzial);
    return rows.map((row) => serializeCompany(row));
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
    };
  });

  app.patch("/api/companies/:id/status", async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) return reply.code(400).send({ error: "invalid id" });
    const parsed = statusBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const db = getDb();
    if (!getCompanyById(db, id)) return reply.code(404).send({ error: "not found" });

    updateCompanyStatus(db, id, parsed.data.status, parsed.data.note ?? null);
    return serializeCompany(getCompanyById(db, id)!);
  });
}
