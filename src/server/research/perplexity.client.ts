import type { z } from "zod";
import { config } from "../config.js";
import { FINDER_JSON_SCHEMA, finderResponseSchema, type FinderResponse } from "./finder-schema.js";
import { STAGE2_JSON_SCHEMA, stage2ResponseSchema, type Stage2Response } from "./stage2-schema.js";

/**
 * Einziger Zugriffspunkt auf die Perplexity-API (Q6: "API-Zugriff in einem
 * Modul gekapselt"). Zwei Agent-API-Calls pro Recherche-Lauf:
 * - Finder-Call: EIN Call liefert eine Kurzliste von Kandidaten fuer ein
 *   Gebiet (ersetzt die urspruengliche Search-API-Stufe-1 -- Livetest
 *   2026-09-07 zeigte, dass isolierte Suchtreffer ohne fortlaufenden
 *   geografischen Kontext kaum im Zielgebiet lagen).
 * - Stufe-2-Call: ein Call PRO Firma, liefert volle Fakten nach STAGE2_JSON_SCHEMA
 *   (spec §6) -- bewusst weiterhin ein kleines Schema pro Call, nicht im Finder-
 *   Wrapper mit ausgeliefert.
 *
 * **Der verbindliche API-Vertrag steht in docs/Agent_api_hinweise.md** (Strict
 * Mode, erzwungene Websuche, Quellen in output[], Fehler mit HTTP 200). Vor
 * jeder Aenderung an diesem Modul dort nachlesen -- die dokumentierten
 * Abweichungen sind genau die, die still fehlschlagen.
 *
 * Eine Eigenheit, die dort NICHT steht und hier trotzdem gilt: `instructions`
 * neben einem Preset ERSETZT dessen Systemprompt komplett, statt ihn zu
 * ergaenzen. Deshalb sendet callAgent() bewusst kein `instructions`-Feld,
 * sondern fuehrt alles in EINEN `input`-String zusammen -- das entspricht dem
 * einzigen empirisch validierten Aufruf (Playground-Beispiel des Nutzers).
 */

const SEARCH_URL = "https://api.perplexity.ai/search";
const AGENT_URL = "https://api.perplexity.ai/v1/agent";

export interface SearchApiResult {
  title: string;
  url: string;
  snippet: string;
  date: string | null;
  last_updated: string | null;
}

interface SearchApiResponse {
  results: SearchApiResult[];
  id: string;
  server_time: string | null;
}

export interface AgentCallResult<T> {
  data: T;
  costUsd: number;
  responseId: string;
  /** Anzahl der search_results-Output-Items -- 0 heisst: das Modell hat nicht gesucht. */
  searchResultsCount: number;
}

interface AgentApiResponse {
  id: string;
  /** "completed" | "failed" | "cancelled" | "incomplete" -- Fehler kommen mit HTTP 200. */
  status: string;
  error?: unknown;
  incomplete_details?: { reason?: string } | null;
  model: string;
  output: Array<{
    type: string;
    content?: Array<{ type: string; text?: string }>;
  }>;
  usage?: {
    cost?: { total_cost?: number; currency?: string };
  };
}

async function perplexityFetch<T>(url: string, body: unknown): Promise<T> {
  if (!config.perplexityApiKey) {
    throw new Error("PERPLEXITY_API_KEY ist nicht gesetzt (.env)");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.perplexityApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Perplexity API ${url} -> HTTP ${res.status}: ${text.slice(0, 500)}`);
  }

  return (await res.json()) as T;
}

async function callAgent<T>(
  input: string,
  jsonSchema: unknown,
  responseSchema: z.ZodType<T>
): Promise<AgentCallResult<T>> {
  const raw = await perplexityFetch<AgentApiResponse>(AGENT_URL, {
    preset: config.perplexityAgentPreset,
    input,
    // tools BIETET die Websuche nur an, tool_choice ERZWINGT sie. Beides noetig
    // (docs/Agent_api_hinweise.md, Falle 2): ein reiner Modell-Request
    // recherchiert nichts und antwortet ungegroundet -- genau der
    // Halluzinationsfall, den die Belegkette verhindern soll.
    tools: [{ type: "web_search" }],
    tool_choice: { type: "web_search" },
    response_format: {
      type: "json_schema",
      json_schema: jsonSchema,
    },
  });

  // Fehlgeschlagene Laeufe kommen mit HTTP 200 + status "failed"/"cancelled"
  // (docs/Agent_api_hinweise.md, Falle 4). Hart abbrechen statt nur warnen --
  // sonst landet ein leerer Lead in der DB und wird als Erfolg gezaehlt.
  if (raw.status !== "completed") {
    throw new Error(
      `Agent API run (id=${raw.id}) status=${raw.status}` +
        (raw.error ? ` error=${JSON.stringify(raw.error)}` : "") +
        (raw.incomplete_details?.reason ? ` reason=${raw.incomplete_details.reason}` : "")
    );
  }

  const searchResultsCount = raw.output.filter((item) => item.type === "search_results").length;
  if (searchResultsCount === 0) {
    console.warn(`[perplexity] Agent API response (id=${raw.id}, model=${raw.model}) hat keine search_results -- Modell hat vermutlich nicht gesucht.`);
  }

  const messageItem = raw.output.find((item) => item.type === "message");
  const text = messageItem?.content?.find((c) => c.type === "output_text")?.text;
  if (!text) {
    throw new Error(`Agent API response (id=${raw.id}) enthaelt keinen output_text`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`Agent API response (id=${raw.id}) ist kein gueltiges JSON: ${String(err)}`);
  }

  const result = responseSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Agent API response (id=${raw.id}) entspricht nicht dem Schema: ${result.error.message}`);
  }

  const costUsd = raw.usage?.cost?.total_cost ?? 0;
  return { data: result.data, costUsd, responseId: raw.id, searchResultsCount };
}

/** Finder-Call: eine Kurzliste von Kandidaten fuer ein Gebiet (siehe finder-schema.ts). */
export async function findCandidates(instructions: string): Promise<AgentCallResult<FinderResponse>> {
  return callAgent(instructions, FINDER_JSON_SCHEMA, finderResponseSchema);
}

/** Stufe 2: ein Call pro unbekannter Firma, liefert Fakten + Belege nach festem Schema (spec §6). */
export async function qualifyCompany(
  instructions: string,
  input: string
): Promise<AgentCallResult<Stage2Response>> {
  return callAgent(`${instructions}\n\n${input}`, STAGE2_JSON_SCHEMA, stage2ResponseSchema);
}

/**
 * Weiterhin verfuegbar, wird vom aktuellen run-orchestrator.ts nicht mehr
 * genutzt (siehe Modul-Kommentar oben) -- bewusst nicht entfernt, falls sich
 * der Finder-Call in der Praxis doch schlechter schlaegt als die Kombination
 * aus Search API + Ortsliste.
 */
export async function searchCandidates(
  query: string,
  opts: { maxResults?: number } = {}
): Promise<SearchApiResult[]> {
  const response = await perplexityFetch<SearchApiResponse>(SEARCH_URL, {
    query,
    country: "DE",
    search_language_filter: ["de"],
    max_results: opts.maxResults ?? 10,
  });
  return response.results;
}
