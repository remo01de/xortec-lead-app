/**
 * Normalisiert eine URL oder einen Domainnamen auf den Dedup-Schluessel der
 * companies-Tabelle (spec §4: "Schluessel ist die normalisierte Domain").
 * Gibt null zurueck, wenn kein plausibler Hostname extrahiert werden kann.
 */
export function normalizeDomain(urlOrDomain: string): string | null {
  const trimmed = urlOrDomain.trim();
  if (!trimmed) return null;

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let host: string;
  try {
    host = new URL(withProtocol).hostname.toLowerCase();
  } catch {
    return null;
  }

  if (host.startsWith("www.")) host = host.slice(4);
  if (!host.includes(".")) return null;

  return host;
}
