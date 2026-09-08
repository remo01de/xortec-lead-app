import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getDb } from "../../db/db.js";
import { listRecentRuns } from "../../db/runs.repo.js";
import { runResearch } from "../../research/run-orchestrator.js";

const triggerBodySchema = z.object({
  areaCode: z.string().regex(/^[0-9]{2}$/, "areaCode muss ein zweistelliges PLZ-Praefix sein"),
});

export function registerResearchRoutes(app: FastifyInstance): void {
  // Manueller Recherche-Lauf (spec §2 Ebene 1, Q13). Cron-Trigger folgt in einem
  // spaeteren Schritt. Laeuft synchron -- ein Lauf ist durch RESEARCH_MAX_NEW_CANDIDATES
  // und RESEARCH_MAX_COST_EUR gedeckelt, dauert aber je nach Kandidatenzahl mehrere Minuten.
  app.post("/api/research/runs", async (req, reply) => {
    const parsed = triggerBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.message });

    const db = getDb();
    const result = await runResearch(db, parsed.data.areaCode, "manual");
    return reply.code(201).send(result);
  });

  app.get("/api/research/runs", async () => {
    return listRecentRuns(getDb());
  });
}
