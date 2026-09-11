import { readFileSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { findCompanyByDomain, insertCompany, listAllDomains, updateCompanyEnrichment } from "../db/companies.repo.js";
import { isKnownCustomer, readCustomers } from "../db/customers.repo.js";
import { matchIdentity, type Identity } from "./identity.js";
import { insertEvidence } from "../db/evidence.repo.js";
import { createRun, updateRunStats } from "../db/runs.repo.js";
import { insertSources, markSourceHttpChecked } from "../db/sources.repo.js";
import { enrichCompany } from "../enrichment/enrich-company.js";
import { getAreaCentroid } from "../enrichment/plz-centroid.js";
import { normalizeDomain } from "./dedupe.js";
import { checkAreaRadius } from "./geofilter.js";
import type { FinderCandidate } from "./finder-schema.js";
import { findCandidates, qualifyCompany } from "./perplexity.client.js";

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

/**
 * Stufe-2-Instruktionen MIT Gebietskontext (Fix 2026-09-08). Vorher bekam
 * Stufe 2 nur den Firmennamen ohne jeden geografischen Hinweis -- bei
 * Filialketten/Verbaenden (KÖTTER, Securitas, MEBO -- genau solche Firmen
 * tauchten in den Livetest-Ergebnissen auf) fand das Modell dadurch
 * vermutlich oft die Hauptsitz-/naechstgelegene-bekannte-Adresse statt der
 * vom Finder-Call korrekt identifizierten lokalen Niederlassung, die der
 * harte Geofilter (Q4) dann zurecht als "ausserhalb Gebiet" verwarf.
 */
function buildStage2Instructions(areaCode: string): string {
  const kerngebiet = getKerngebiet(areaCode);
  return `Du recherchierst Fakten zu einer einzelnen Firma im Bereich
Videoueberwachung/Sicherheitstechnik in Deutschland. Die Firma wurde im Gebiet ${kerngebiet}
(PLZ-Praefix ${areaCode}) gefunden -- recherchiere gezielt DIESEN Standort bzw. diese
Niederlassung. Falls die Firma mehrere Standorte hat (Filialkette, Verband, Vertretung),
gib die Adresse/PLZ der Niederlassung in oder nahe ${kerngebiet} an, NICHT den Hauptsitz,
falls dieser woanders liegt.

Liefere ausschliesslich belegbare Fakten nach dem vorgegebenen JSON-Schema. Bewerte NICHT
(kein Score, keine Eignung, keine Prioritaet) -- das rechnet die aufrufende Anwendung. Wenn
ein Fakt nicht sicher belegbar ist, lasse das Feld leer/null bzw. das Array leer, anstatt zu
spekulieren oder eine Quelle zu erfinden. is_facherrichter=true nur, wenn die Firma
nachweislich Planung, Installation oder Wartung von Sicherheitstechnik anbietet -- reiner
Handel/Beratung zaehlt nicht.`;
}

const PLZ_AREA_PLACES_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../data/plz-area-places.json"
);
let placesByPrefix: Record<string, string[]> | undefined;

function loadPlacesByPrefix(): Record<string, string[]> {
  if (!placesByPrefix) {
    let loaded: Record<string, string[]>;
    try {
      loaded = JSON.parse(readFileSync(PLZ_AREA_PLACES_PATH, "utf-8"));
    } catch {
      loaded = {};
    }
    placesByPrefix = loaded;
  }
  return placesByPrefix;
}

/** Kerngebiet-Ortsname fuer ein PLZ-Praefix, z.B. "Hamburg" fuer "21". */
function getKerngebiet(areaCode: string): string {
  const places = loadPlacesByPrefix()[areaCode] ?? [];
  return places[0] ?? `PLZ-Gebiet ${areaCode}`;
}

/**
 * Instruktionen fuer den Finder-Call (ersetzt die urspruengliche Search-API-
 * Stufe 1, spec §2/Q6). Vorlage vom Nutzer im Perplexity-Playground getestet
 * und validiert (2026-09-07) -- Radius-um-Koordinaten-Framing statt reinem
 * PLZ-Praefix-Text, plus explizite Ausschlusskriterien gegen Verzeichnis-/
 * Portalseiten, die im ersten Livetest einen Grossteil des Rauschens
 * verursacht hatten (IHK, "wer-zu-wem.de", Bundesverband-Fachfirmenlisten).
 * Liefert bewusst nur eine Kurzliste (siehe finder-schema.ts) -- volle Fakten
 * kommen weiterhin aus einem separaten Stufe-2-Call pro Firma (spec §6).
 */
function buildFinderInstructions(areaCode: string, maxCandidates: number): string {
  const places = loadPlacesByPrefix()[areaCode] ?? [];
  const kerngebiet = getKerngebiet(areaCode);
  // Bewusst KEINE rohen Lat/Lon-Koordinaten im Prompt (Livetest 2026-09-07:
  // Koordinaten-Framing lieferte deutlich schlechtere Trefferquote als reine
  // Ortsnamen -- LLMs scheinen aus Dezimalkoordinaten kaum verlässlich auf
  // Umkreis/Naehe schliessen zu koennen, aus einem bekannten Ortsnamen schon).
  const umland = places.slice(1, 8).join(", ");
  const radiusHint =
    `ca. ${config.researchRadiusKm} km um ${kerngebiet}` +
    `${umland ? ` -- dazu zaehlen u.a. ${umland}` : ""} (PLZ-Gebiet ${areaCode})`;

  return `Du recherchierst potenzielle B2B-Kunden fuer Xortec, einen technischen Distributor
fuer Videoueberwachung, Zutrittskontrolle, Alarmtechnik, VMS, Netzwerk- und Speicherloesungen.

Gebiet:
- Kerngebiet: ${kerngebiet}
- Suchradius: ${radiusHint}
- Beruecksichtige auch relevante Orte im Umland, sofern sie im Radius liegen.

Zielunternehmen:
- Facherrichter und Systemintegratoren fuer professionelle Videoueberwachung
- Sicherheitstechnik- und Alarmtechnik-Errichter mit eigener Projektierung und Montage
- Elektro-, IT- und Gebaeudetechnikbetriebe, wenn sie nachweislich Videoueberwachung,
  Zutrittskontrolle oder Gefahrenmeldetechnik planen und installieren

Gesuchte technische Leistungen:
- CCTV, IP-Videoueberwachung, Ueberwachungskameras oder Videoanlagen
- Planung, Installation, Inbetriebnahme, Wartung oder Fernwartung
- NVR, VMS, Videomanagement, Server, Storage, RAID, Netzwerk, PoE oder LWL
- Zutrittskontrolle, Video-Tuerkommunikation, Einbruchmeldeanlagen oder Alarmaufschaltung
- Optional: VdS, BHE, DIN 14675, Notruf- und Serviceleitstelle

Ausschliessen:
- Reine Sicherheitsdienste ohne erkennbare Errichter- oder Installationsleistung
- Reine Onlinehaendler, Elektronikmaerkte und Kamerashops
- Reine Endkundenangebote ohne B2B-, Gewerbe- oder Projektbezug
- Unternehmen ausserhalb des definierten Gebiets
- Branchenbuch-, Verzeichnis- oder Portalseiten selbst als "Firma" (z.B. IHK, Gelbe Seiten,
  wer-zu-wem, Bundesverbaende, Stellenportale) -- nenne die dort gelisteten Firmen einzeln,
  niemals das Portal/den Verband selbst
- Dubletten, Niederlassungen ohne lokalen Projekt-/Servicebezug und Firmen ohne
  nachvollziehbare Website oder Quelle

Recherchiere nur Firmen, deren Bezug zu mindestens einem der oben genannten
Leistungsbereiche anhand einer oeffentlich zugaenglichen Quelle belegbar ist.

Liefere maximal ${maxCandidates} unterschiedliche Firmen als Kurzliste. Bevorzuge Firmen mit:
1. Nachweisbarer Planung und Montage.
2. Gewerbe-, Industrie-, Logistik-, Filial-, Wohnungswirtschafts- oder oeffentlichen Projekten.
3. Video plus Zutritt, Alarm oder IT-/Netzwerkkompetenz.
4. Wartung, Servicevertrag, Leitstellenbezug oder VdS-/BHE-Qualifikation.

Fuer jede Firma nur: Name, Website (falls bekannt, sonst null) und eine kurze Begruendung
mit Quellenbezug -- keine weiteren Details, die werden in einem separaten Schritt pro
Firma recherchiert. Die Antwort muss ausschliesslich dem vorgegebenen JSON-Schema entsprechen.`;
}

/**
 * Fuehrt den Finder-Call + Stufe 2 fuer ein PLZ-Praefix-Gebiet aus: sammelt
 * eine Kandidaten-Kurzliste, dedupliziert gegen die DB (Q2: bereits
 * qualifizierte Firmen nie erneut bezahlen), qualifiziert bis zu
 * RESEARCH_MAX_NEW_CANDIDATES neue Firmen per Stufe-2-Call und bricht ab,
 * sobald RESEARCH_MAX_COST_EUR erreicht ist.
 */
export async function runResearch(
  db: DatabaseSync,
  areaCode: string,
  trigger: "cron" | "manual"
): Promise<RunResult> {
  const runId = createRun(db, areaCode, trigger);

  let apiCalls = 0;
  let costUsd = 0;
  let candidatesQualified = 0;
  let candidatesOutsideArea = 0;
  let stage2WithoutSearch = 0;
  let stoppedByCostCap = false;
  const newCompanyIds: number[] = [];

  const areaCentroid = getAreaCentroid(areaCode);
  if (!areaCentroid) {
    console.warn(
      `[run ${runId}] Kein Gebietsmittelpunkt fuer PLZ-Praefix "${areaCode}" gefunden -- ` +
        `Umkreisfilter ist fuer diesen Lauf inaktiv, alle Kandidaten werden gespeichert.`
    );
  }

  const finderInstructions = buildFinderInstructions(areaCode, config.researchMaxNewCandidates);
  const finderResult = await findCandidates(finderInstructions);
  apiCalls++;
  costUsd += finderResult.costUsd;
  const candidatesFound = finderResult.data.candidates.length;
  console.log(
    `[run ${runId}] Finder-Call: ${candidatesFound} Kandidaten, ${finderResult.searchResultsCount} search_results-Items (0 = Modell hat vermutlich nicht gesucht)`
  );

  const knownDomains = listAllDomains(db);
  for (const customer of readCustomers(db)) if (customer.domain) knownDomains.add(customer.domain);
  const seenDomains = new Set<string>();
  const toQualify: FinderCandidate[] = [];
  for (const candidate of finderResult.data.candidates) {
    const domain = candidate.website ? normalizeDomain(candidate.website) : null;
    if (domain) {
      if (knownDomains.has(domain) || seenDomains.has(domain)) continue;
      seenDomains.add(domain);
    }
    toQualify.push(candidate);
    if (toQualify.length >= config.researchMaxNewCandidates) break;
  }

  for (const candidate of toQualify) {
    const costEurSoFar = costUsd * config.usdToEurRate;
    if (costEurSoFar >= config.researchMaxCostEur) {
      stoppedByCostCap = true;
      break;
    }

    const preDomain = candidate.website ? normalizeDomain(candidate.website) : null;
    if (preDomain && findCompanyByDomain(db, preDomain)) continue;
    if (isKnownCustomer(db, { company_name: candidate.company_name, domain: preDomain })) continue;

    let qualification;
    try {
      qualification = await qualifyCompany(
        buildStage2Instructions(areaCode),
        `Firma (aus Vorrecherche): ${candidate.company_name}\n` +
          `${candidate.website ? `Website: ${candidate.website}` : "Website unbekannt -- bitte recherchieren."}\n` +
          `Hinweis aus Vorrecherche: ${candidate.reason}\n` +
          `Recherchiere die Firma und liefere die Fakten nach Schema.`
      );
    } catch (err) {
      console.warn(`[run ${runId}] Stufe 2 fehlgeschlagen fuer ${candidate.company_name}: ${String(err)}`);
      continue;
    }
    apiCalls++;
    costUsd += qualification.costUsd;
    if (qualification.searchResultsCount === 0) stage2WithoutSearch++;

    const data = qualification.data;

    // Harter Geofilter (spec Q4) als Umkreis statt PLZ-Praefix -- Begruendung
    // und Randfaelle in geofilter.ts. Entfernung kommt aus dem Offline-PLZ-
    // Zentroid-Datensatz, damit fuer Kandidaten, die ohnehin fliegen, kein
    // Nominatim-Call (15s Drosselung) verbraucht wird.
    const verdict = checkAreaRadius(areaCentroid, data.postal_code, config.researchRadiusKm);
    if (verdict.outside) {
      candidatesOutsideArea++;
      console.log(
        `[run ${runId}] ausserhalb Umkreis: "${data.company_name}" -> PLZ ${data.postal_code} ` +
          `${data.city ?? ""} (${verdict.distanceKm?.toFixed(0)} km, erlaubt ${config.researchRadiusKm} km)`
      );
      continue;
    }

    // Stufe 2 kennt die tatsaechliche Firmen-Website oft verlaesslicher als
    // der Finder-Call (der z.B. eine Verzeichnis-/Portalseite als Website
    // uebernommen haben koennte) -- Domain fuer Speicherung/Dedup deshalb
    // bevorzugt aus data.website ableiten.
    const resolvedDomain = (data.website && normalizeDomain(data.website)) || preDomain;
    if (!resolvedDomain) {
      console.warn(`[run ${runId}] Keine Domain ermittelbar fuer "${data.company_name}" -- verworfen.`);
      continue;
    }
    if (findCompanyByDomain(db, resolvedDomain)) continue;
    const identity = { ...data, domain: resolvedDomain };
    if (isKnownCustomer(db, identity)) continue;
    const existingCompanies = db.prepare('SELECT company_name, domain, street, postal_code, city FROM companies').all() as unknown as Identity[];
    if (existingCompanies.some(c => matchIdentity(identity, c)?.certain)) {
      console.log(`[run ${runId}] Dublette über Firmenname/Adresse: ${data.company_name}`);
      continue;
    }

    const companyId = insertCompany(db, {
      domain: resolvedDomain,
      companyName: data.company_name,
      website: data.website,
      street: data.street,
      postalCode: data.postal_code,
      city: data.city,
      phone: data.phone,
      companyType: data.company_type,
      services: data.services,
      targetSegments: data.target_segments,
      manufacturerMentions: data.manufacturer_mentions,
      certifications: data.certifications,
      firstSeenRunId: runId,
    });

    insertEvidence(db, companyId, data.evidence);
    const sourceIds = insertSources(db, companyId, data.sources);

    const enriched = await enrichCompany(db, data);
    sourceIds.forEach((sourceId, i) => {
      const check = enriched.sourceChecks[i];
      if (check) markSourceHttpChecked(db, sourceId, check.ok, new Date().toISOString());
    });

    updateCompanyEnrichment(db, companyId, {
      lat: enriched.lat,
      lon: enriched.lon,
      geocodeSource: enriched.geocodeSource,
      scoreFachlichkeit: enriched.scores.scoreFachlichkeit,
      scorePotenzial: enriched.scores.scorePotenzial,
      scoreDatenqualitaet: enriched.scores.scoreDatenqualitaet,
      priority: enriched.scores.priority,
      verificationStatus: enriched.scores.verificationStatus,
    });

    newCompanyIds.push(companyId);
    candidatesQualified++;
  }

  const costEur = costUsd * config.usdToEurRate;
  updateRunStats(db, runId, { candidatesFound, candidatesQualified, apiCalls, costEur });
  console.log(
    `[run ${runId}] fertig: ${candidatesQualified} qualifiziert, ${candidatesOutsideArea} ausserhalb Gebiet, ` +
      `${stage2WithoutSearch} Stufe-2-Calls ohne search_results, ${costEur.toFixed(3)} EUR`
  );

  return {
    runId,
    candidatesFound,
    candidatesQualified,
    candidatesOutsideArea,
    apiCalls,
    costEur,
    newCompanyIds,
    stoppedByCostCap,
  };
}
