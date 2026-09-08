import type { DatabaseSync } from "node:sqlite";
import type { Stage2Response } from "../research/stage2-schema.js";
import { checkUrl } from "./http-check.js";
import { geocodeAddress } from "./nominatim.client.js";
import { lookupPlzCentroid } from "./plz-centroid.js";
import { computeScores, type GeocodeSource, type ScoringInput, type ScoringResult } from "./scoring.js";
import { hasMultipleLocationsOrControlRoom, sizeIndicatesMoreThan10Employees } from "./size-heuristics.js";

export interface SourceCheckResult {
  url: string;
  ok: boolean;
}

export interface EnrichedCompany {
  lat: number | null;
  lon: number | null;
  geocodeSource: GeocodeSource;
  websiteReachable: boolean;
  sourceChecks: SourceCheckResult[];
  scores: ScoringResult;
}

/**
 * Ebene 2 fuer eine einzelne Stufe-2-Antwort: Geocoding (Nominatim, Fallback
 * PLZ-Zentroid), HTTP-Check aller URLs, deterministisches Scoring.
 */
export async function enrichCompany(db: DatabaseSync, data: Stage2Response): Promise<EnrichedCompany> {
  let lat: number | null = null;
  let lon: number | null = null;
  let geocodeSource: GeocodeSource = "none";

  try {
    const geo = await geocodeAddress(db, data.street, data.postal_code, data.city);
    if (geo) {
      lat = geo.lat;
      lon = geo.lon;
      geocodeSource = "nominatim";
    }
  } catch (err) {
    console.warn(`[enrich] Nominatim fehlgeschlagen fuer "${data.company_name}": ${String(err)}`);
  }

  if (lat === null || lon === null) {
    const centroid = lookupPlzCentroid(data.postal_code);
    if (centroid) {
      lat = centroid.lat;
      lon = centroid.lon;
      geocodeSource = "plz_centroid";
    }
  }

  const websiteReachable = data.website ? await checkUrl(data.website) : false;
  const sourceChecks: SourceCheckResult[] = await Promise.all(
    data.sources.map(async (s) => ({ url: s.url, ok: await checkUrl(s.url) }))
  );

  const scoringInput: ScoringInput = {
    services: data.services,
    certifications: data.certifications,
    targetSegments: data.target_segments,
    referenceProjectsCount: data.reference_projects.length,
    sizeIndicatesMoreThan10Employees: sizeIndicatesMoreThan10Employees(data.size_indicators),
    hasMultipleLocationsOrControlRoom: hasMultipleLocationsOrControlRoom(
      data.services,
      data.size_indicators
    ),
    independentSourcesCount: data.sources.length,
    websiteReachable,
    geocodeSource,
    hasPhone: !!data.phone,
  };

  return {
    lat,
    lon,
    geocodeSource,
    websiteReachable,
    sourceChecks,
    scores: computeScores(scoringInput),
  };
}
