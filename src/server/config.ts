import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  perplexityApiKey: process.env.PERPLEXITY_API_KEY ?? "",
  // Kanonische Preset-Namen: fast | low | medium | high | xhigh ("pro-search"
  // ist laut Perplexity-Skill "migrate-sonar-to-agent-api" nur ein Legacy-
  // Alias fuer "low", KEIN eigener staerkerer Preset -- der urspruengliche
  // "low vs. pro-search"-Livetest-Vergleich vom 2026-09-07 war deshalb kein
  // echter A/B-Test). "low" ist der guenstigste Preset; ob ein hoeherer Preset
  // die Trefferquote weiter verbessert, ist noch nicht getestet (spec §8.5).
  perplexityAgentPreset: process.env.PERPLEXITY_AGENT_PRESET ?? "low",
  databasePath: process.env.DATABASE_PATH ?? "./data/app.db",
  researchMaxNewCandidates: Number(process.env.RESEARCH_MAX_NEW_CANDIDATES ?? 40),
  researchMaxCostEur: Number(process.env.RESEARCH_MAX_COST_EUR ?? 0.5),
  // Umkreis des harten Geofilters (spec Q4) um den Gebietsmittelpunkt. Ersetzt
  // den urspruenglichen PLZ-Praefix-Vergleich aus Q7: Hamburg verteilt sich auf
  // die Praefixe 20/21/22, weshalb der Praefix-Filter in Lauf 7 19 von 26
  // korrekten Treffern verwarf -- alle davon unter 33 km vom Gebietsmittelpunkt.
  // Wird auch in den Finder-Prompt eingesetzt, damit Prompt und Filter nicht
  // auseinanderlaufen.
  researchRadiusKm: Number(process.env.RESEARCH_RADIUS_KM ?? 40),
  // Grobe Naeherung fuer die Budgetanzeige; Agent-API liefert Kosten in USD.
  usdToEurRate: Number(process.env.USD_TO_EUR_RATE ?? 0.92),
  // Nominatim-Nutzungsrichtlinie verlangt eine gueltige Kontaktangabe im User-Agent
  // (https://operations.osmfoundation.org/policies/nominatim/). Muss in .env gesetzt werden.
  nominatimContactEmail: process.env.NOMINATIM_CONTACT_EMAIL ?? "",
  port: Number(process.env.PORT ?? 3000),

  // Login (spec §7 "Docker auf IONOS mit Login", Q3: genau ein Nutzer).
  // AUTH_PASSWORD_HASH wird mit `npm run hash-password` erzeugt -- das
  // Klartextpasswort steht nie in .env.
  // Nacht-Cron (spec Q13). Standardmaessig AUS -- jeder Lauf kostet echtes Geld,
  // und ein versehentlich mitlaufender Cron auf dem Entwicklungsrechner faellt
  // erst auf der Rechnung auf. In der Produktion einschalten.
  cronEnabled: process.env.CRON_ENABLED === "true",
  cronSchedule: process.env.CRON_SCHEDULE ?? "0 2 * * *",
  cronTimezone: process.env.CRON_TIMEZONE ?? "Europe/Berlin",
  cronAreasPerNight: Number(process.env.CRON_AREAS_PER_NIGHT ?? 2),

  authPasswordHash: process.env.AUTH_PASSWORD_HASH ?? "",
  sessionSecret: process.env.SESSION_SECRET ?? "",
  sessionMaxAgeSeconds: Number(process.env.SESSION_MAX_AGE_DAYS ?? 30) * 24 * 60 * 60,
  isProduction: process.env.NODE_ENV === "production",
};

/**
 * Fehlkonfiguration soll beim Start auffallen, nicht beim ersten Loginversuch --
 * ein Server ohne gesetzten Hash wuerde sonst stillschweigend jeden abweisen,
 * einer ohne Session-Secret koennte Cookies nicht signieren.
 */
export function assertAuthConfigured(): void {
  const missing: string[] = [];
  if (!config.authPasswordHash) missing.push("AUTH_PASSWORD_HASH");
  if (!config.sessionSecret) missing.push("SESSION_SECRET");
  if (missing.length > 0) {
    throw new Error(
      `Login nicht konfiguriert: ${missing.join(", ")} fehlt in .env. ` +
        `Passwort-Hash erzeugen mit: npm run hash-password`
    );
  }
}

export { required };
