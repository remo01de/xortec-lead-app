/**
 * Heuristische Auswertung des Freitextfelds size_indicators (Stufe 2, kein
 * eigenes Schema-Feld fuer Mitarbeiterzahl -- spec §6). Bewusst konservativ:
 * ein falsches "false" kostet nur Potenzial-Punkte, ein falsches "true" wuerde
 * die Score-Grundlage verfaelschen. Spec §8.4 rechnet ohnehin damit, dass dieses
 * Signal bei kleinen Errichtern meist duenn bleibt.
 */
export function sizeIndicatesMoreThan10Employees(sizeIndicators: string | null): boolean {
  if (!sizeIndicators) return false;
  const text = sizeIndicators.toLowerCase();

  const countMatch = text.match(/(\d{2,})\s*(mitarbeiter|beschäftigte|beschaeftigte|mann|personen|kollegen)/);
  if (countMatch?.[1] && Number(countMatch[1]) > 10) return true;

  return /mehr als 10|über 10|ueber 10|>\s*10\s*mitarbeiter/.test(text);
}

/** monitoring_station-Service ODER expliziter Freitext-Hinweis auf mehrere Standorte. */
export function hasMultipleLocationsOrControlRoom(
  services: string[],
  sizeIndicators: string | null
): boolean {
  if (services.includes("monitoring_station")) return true;
  if (!sizeIndicators) return false;
  return /mehrere standorte|weitere standorte|niederlassungen?/i.test(sizeIndicators);
}
