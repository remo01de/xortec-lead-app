import type { FastifyBaseLogger } from "fastify";
import cron from "node-cron";
import { config } from "./config.js";
import { getDb } from "./db/db.js";
import { pickNextAreas } from "./research/area-schedule.js";
import { runResearch } from "./research/run-orchestrator.js";

/**
 * Nacht-Cron (spec Q13, §2 Ebene 1): recherchiert pro Nacht eine feste Anzahl
 * PLZ-Gebiete, damit die Datenbank dem Vertriebsgebiet vorauslaeuft.
 *
 * Standardmaessig AUS. Jeder Lauf kostet echtes Geld (Groessenordnung 0,20-0,25 EUR
 * pro Gebiet), und ein versehentlich mitlaufender Cron auf einem Entwicklungs-
 * rechner faellt erst auf der Rechnung auf. In der Produktion per CRON_ENABLED=true
 * einschalten.
 *
 * Laeufe werden bewusst nacheinander ausgefuehrt: parallele Laeufe wuerden sich
 * beim Domain-Dedup ins Gehege kommen und die Kostendeckel pro Lauf umgehen.
 */
export function startCron(logger: FastifyBaseLogger): void {
  if (!config.cronEnabled) {
    logger.info("Nacht-Cron ist deaktiviert (CRON_ENABLED != true)");
    return;
  }

  if (!cron.validate(config.cronSchedule)) {
    logger.error(`Ungueltiger CRON_SCHEDULE "${config.cronSchedule}" -- Cron nicht gestartet`);
    return;
  }

  let running = false;

  cron.schedule(
    config.cronSchedule,
    async () => {
      // Ein noch laufender Nachtlauf darf sich nicht mit dem naechsten
      // ueberlappen -- ein Lauf ueber mehrere Gebiete kann eine Stunde dauern.
      if (running) {
        logger.warn("Vorheriger Cron-Lauf laeuft noch -- dieser Termin wird uebersprungen");
        return;
      }
      running = true;

      try {
        const db = getDb();
        const areas = pickNextAreas(db, config.cronAreasPerNight);
        if (areas.length === 0) {
          logger.warn("Keine PLZ-Gebiete in data/plz-areas.json -- Cron hat nichts zu tun");
          return;
        }

        logger.info(`Cron startet: ${areas.map((a) => `${a.areaCode} (${a.hauptort})`).join(", ")}`);
        let gesamtkosten = 0;

        for (const area of areas) {
          try {
            const result = await runResearch(db, area.areaCode, "cron");
            gesamtkosten += result.costEur;
            logger.info(
              `Cron-Lauf ${area.areaCode}: ${result.candidatesQualified} qualifiziert, ` +
                `${result.candidatesOutsideArea} ausserhalb Umkreis, ${result.costEur.toFixed(3)} EUR`
            );
          } catch (err) {
            // Ein kaputtes Gebiet darf die restliche Nacht nicht blockieren.
            logger.error(`Cron-Lauf ${area.areaCode} fehlgeschlagen: ${String(err)}`);
          }
        }

        logger.info(`Cron fertig, Gesamtkosten der Nacht: ${gesamtkosten.toFixed(3)} EUR`);
      } finally {
        running = false;
      }
    },
    { timezone: config.cronTimezone }
  );

  logger.info(
    `Nacht-Cron aktiv: "${config.cronSchedule}" (${config.cronTimezone}), ` +
      `${config.cronAreasPerNight} Gebiete pro Nacht`
  );
}
