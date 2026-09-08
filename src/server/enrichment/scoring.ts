/**
 * Deterministisches Scoring gemaess docs/spezifikation.md §5.
 * Reine Funktionen, keine DB-/Netzwerkzugriffe -- das Modell liefert nur Fakten,
 * die App rechnet Score, Priroritaet und Verifikationsstatus (Q17).
 */

export type GeocodeSource = "nominatim" | "plz_centroid" | "none";
export type Priority = "A" | "B" | "C";
export type VerificationStatus = "verified" | "unverified";

const POTENZIAL_SEGMENTS = [
  "industry",
  "logistics",
  "retail",
  "public_sector",
  "critical_infrastructure",
] as const;

export interface ScoringInput {
  services: string[];
  certifications: string[];
  targetSegments: string[];
  referenceProjectsCount: number;
  /** Heuristische Auswertung von size_indicators (Stufe-2-Freitext) -- siehe enrich-company.ts */
  sizeIndicatesMoreThan10Employees: boolean;
  /** monitoring_station-Service oder Freitext-Hinweis auf mehrere Standorte */
  hasMultipleLocationsOrControlRoom: boolean;
  independentSourcesCount: number;
  websiteReachable: boolean;
  geocodeSource: GeocodeSource;
  hasPhone: boolean;
}

export interface ScoringResult {
  scoreFachlichkeit: number;
  scorePotenzial: number;
  scoreDatenqualitaet: number;
  priority: Priority;
  verificationStatus: VerificationStatus;
  /** Fachlichkeit < 35: bleibt in der DB, wird aber in keiner Ansicht angezeigt. */
  hiddenLowFachlichkeit: boolean;
}

function hasAny(list: string[], candidates: string[]): boolean {
  return candidates.some((c) => list.includes(c));
}

function hasAll(list: string[], candidates: string[]): boolean {
  return candidates.every((c) => list.includes(c));
}

export function scoreFachlichkeit(input: Pick<ScoringInput, "services" | "certifications">): number {
  let score = 0;
  if (input.services.includes("video_surveillance")) score += 25;
  if (hasAll(input.services, ["planning_design", "installation"])) score += 25;
  if (hasAny(input.services, ["maintenance_service", "remote_maintenance"])) score += 15;
  if (
    hasAny(input.services, [
      "video_management_system",
      "nvr_recording",
      "server_storage_raid",
      "network_poe",
      "fiber_optics",
    ])
  )
    score += 15;
  if (
    hasAny(input.services, ["access_control", "intrusion_alarm", "fire_detection", "video_intercom"])
  )
    score += 10;
  if (hasAny(input.certifications, ["vds", "bhe", "din_14675"])) score += 10;
  return Math.min(100, score);
}

export function scorePotenzial(
  input: Pick<
    ScoringInput,
    | "targetSegments"
    | "referenceProjectsCount"
    | "sizeIndicatesMoreThan10Employees"
    | "hasMultipleLocationsOrControlRoom"
  >
): number {
  let score = 0;
  const segmentHits = POTENZIAL_SEGMENTS.filter((s) => input.targetSegments.includes(s)).length;
  score += Math.min(45, segmentHits * 15);
  if (input.referenceProjectsCount > 0) score += 25;
  if (input.sizeIndicatesMoreThan10Employees) score += 20;
  if (input.hasMultipleLocationsOrControlRoom) score += 10;
  return Math.min(100, score);
}

export function scoreDatenqualitaet(
  input: Pick<
    ScoringInput,
    "independentSourcesCount" | "websiteReachable" | "geocodeSource" | "hasPhone"
  >
): number {
  let score = 0;
  if (input.independentSourcesCount >= 2) score += 40;
  if (input.websiteReachable) score += 30;
  if (input.geocodeSource === "nominatim") score += 15;
  if (input.hasPhone) score += 15;
  return Math.min(100, score);
}

export function derivePriority(scoreFachlichkeitVal: number, scorePotenzialVal: number): Priority {
  if (scoreFachlichkeitVal >= 70 && scorePotenzialVal >= 50) return "A";
  if (scoreFachlichkeitVal >= 70 || (scoreFachlichkeitVal >= 50 && scorePotenzialVal >= 50)) return "B";
  return "C";
}

export function computeScores(input: ScoringInput): ScoringResult {
  const fach = scoreFachlichkeit(input);
  const pot = scorePotenzial(input);
  const datenqualitaet = scoreDatenqualitaet(input);

  return {
    scoreFachlichkeit: fach,
    scorePotenzial: pot,
    scoreDatenqualitaet: datenqualitaet,
    priority: derivePriority(fach, pot),
    verificationStatus: datenqualitaet < 45 ? "unverified" : "verified",
    hiddenLowFachlichkeit: fach < 35,
  };
}
