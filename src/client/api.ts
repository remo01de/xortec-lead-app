export type Priority = "A" | "B" | "C";
export type LeadStatus = "neu" | "angerufen" | "kein_interesse" | "in_salesforce" | "bestandskunde";

export interface Company {
  id: number;
  domain: string;
  companyName: string;
  website: string | null;
  street: string | null;
  postalCode: string | null;
  city: string | null;
  phone: string | null;
  lat: number | null;
  lon: number | null;
  companyType: string | null;
  scoreFachlichkeit: number;
  scorePotenzial: number;
  scoreDatenqualitaet: number;
  priority: Priority | null;
  verificationStatus: string;
  status: LeadStatus;
  note: string | null;
  distanceKm?: number;
}

export interface RunResult {
  runId: number;
  candidatesFound: number;
  candidatesQualified: number;
  candidatesOutsideArea: number;
  apiCalls: number;
  costEur: number;
  newCompanyIds: number[];
  stoppedByCostCap: boolean;
}

export interface RunRow {
  id: number;
  area_code: string;
  started_at: string;
  candidates_found: number;
  candidates_qualified: number;
  api_calls: number;
  cost_eur: number;
  trigger: "cron" | "manual";
}

/** Signalisiert eine abgelaufene oder fehlende Session -- main.ts zeigt dann den Login. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Nicht angemeldet");
    this.name = "UnauthorizedError";
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (res.status === 401) throw new UnauthorizedError();
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `API-Fehler ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function fetchSession(): Promise<{ authenticated: boolean }> {
  return fetch("/api/auth/session").then((r) => handle<{ authenticated: boolean }>(r));
}

export function login(password: string): Promise<{ ok: true }> {
  return fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  }).then(async (res) => {
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Login fehlgeschlagen (${res.status})`);
    }
    return res.json() as Promise<{ ok: true }>;
  });
}

export function logout(): Promise<{ ok: true }> {
  return fetch("/api/auth/logout", { method: "POST" }).then((r) => handle<{ ok: true }>(r));
}

export function fetchFieldCompanies(lat: number, lon: number, radiusKm: number): Promise<Company[]> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), radiusKm: String(radiusKm) });
  return fetch(`/api/companies?${params}`).then((r) => handle<Company[]>(r));
}

/**
 * Alle sichtbaren Leads ohne Umkreisfilter, nach Fachlichkeit x Potenzial
 * sortiert. Rueckfallebene, wenn der Standort nicht verfuegbar ist (Rechte
 * verweigert, Tiefgarage, Geraet ohne GPS) -- ohne sie waere die Feldansicht
 * dann komplett leer.
 */
export function fetchCompaniesWithoutLocation(): Promise<Company[]> {
  return fetch("/api/companies").then((r) => handle<Company[]>(r));
}

export function updateCompanyStatus(id: number, status: LeadStatus): Promise<Company> {
  return fetch(`/api/companies/${id}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  }).then((r) => handle<Company>(r));
}

export function triggerResearchRun(areaCode: string): Promise<RunResult> {
  return fetch(`/api/research/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ areaCode }),
  }).then((r) => handle<RunResult>(r));
}

export function fetchRecentRuns(): Promise<RunRow[]> {
  return fetch(`/api/research/runs`).then((r) => handle<RunRow[]>(r));
}
