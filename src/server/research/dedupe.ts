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
    const parsed = new URL(withProtocol);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return null;
    host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  } catch {
    return null;
  }

  if (host.startsWith("www.")) host = host.slice(4);
  if (!host.includes(".") || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(host)) return null;

  return host;
}
