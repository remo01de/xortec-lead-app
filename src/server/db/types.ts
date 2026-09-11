export type GeocodeSource = "nominatim" | "plz_centroid" | "none";
export type Priority = "A" | "B" | "C";
export type VerificationStatus = "verified" | "unverified";
export type LeadStatus = "neu" | "angerufen" | "kein_interesse" | "in_salesforce" | "bestandskunde";
export type RunTrigger = "cron" | "manual";

export interface CompanyRow {
  id: number;
  domain: string;
  company_name: string;
  website: string | null;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  geocode_source: GeocodeSource | null;
  company_type: string | null;
  services: string; // JSON array
  target_segments: string; // JSON array
  manufacturer_mentions: string; // JSON array
  certifications: string; // JSON array
  score_fachlichkeit: number;
  score_potenzial: number;
  score_datenqualitaet: number;
  priority: Priority | null;
  verification_status: VerificationStatus;
  status: LeadStatus;
  note: string | null;
  sales_feedback: 'good_fit' | 'poor_fit' | 'uncertain' | null;
  feedback_note: string | null;
  first_seen_run_id: number | null;
  last_updated: string;
}

export interface SourceRow {
  id: number;
  company_id: number;
  url: string;
  title: string | null;
  evidence: string | null;
  http_ok: number | null; // 0/1/NULL
  checked_at: string | null;
}

export interface EvidenceRow {
  id: number;
  company_id: number;
  text: string;
}

export interface RunRow {
  id: number;
  area_code: string;
  started_at: string;
  candidates_found: number;
  candidates_qualified: number;
  api_calls: number;
  cost_eur: number;
  trigger: RunTrigger;
}
