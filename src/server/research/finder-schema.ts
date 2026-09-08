import { z } from "zod";

/**
 * Kurzlisten-Schema fuer den Finder-Call (ersetzt die bisherige Search-API-
 * Stufe 1). Bewusst klein gehalten -- anders als das Stufe-2-Schema (spec §6)
 * liefert dieser Call KEINE vollen Firmendaten, nur genug fuer Domain-Dedup
 * und den nachfolgenden Pro-Firma-Stufe-2-Call. Kleines Schema = geringes
 * Schema-Prep-Risiko (siehe spec §6 Punkt 4 zur selben Begruendung beim
 * Verwerfen des urspruenglichen Wrapper-Entwurfs).
 */
export const FINDER_JSON_SCHEMA = {
  name: "xortec_candidate_shortlist",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["candidates"],
    properties: {
      candidates: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["company_name", "website", "reason"],
          properties: {
            company_name: { type: "string" },
            website: { type: ["string", "null"] },
            reason: { type: "string" },
          },
        },
      },
    },
  },
} as const;

export const finderResponseSchema = z.object({
  candidates: z.array(
    z.object({
      company_name: z.string(),
      website: z.string().nullable(),
      reason: z.string(),
    })
  ),
});

export type FinderResponse = z.infer<typeof finderResponseSchema>;
export type FinderCandidate = FinderResponse["candidates"][number];
