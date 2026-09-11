import { normalizeDomain } from './dedupe.js';

export interface Identity {
  company_name: string;
  domain?: string | null;
  street?: string | null;
  postal_code?: string | null;
  city?: string | null;
}

export function normalizeText(value: string | null | undefined): string {
  return (value ?? '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

export function normalizeName(value: string): string {
  return normalizeText(value.toLowerCase().replace(/\b(gmbh|mbh|ag|kg|ug|haftungsbeschränkt|co|ohg|eg)\b/g, ''));
}

function street(value: string | null | undefined): string {
  return normalizeText(value).replace(/strasse/g, 'str');
}

function similarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 5 || b.length < 5) return 0;
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min(next[j - 1]! + 1, row[j]! + 1, row[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return 1 - row[b.length]! / Math.max(a.length, b.length);
}

/** Only domain or an exact normalized name AND full address qualifies for automatic matching. */
export function matchIdentity(a: Identity, b: Identity): { certain: boolean; reason: string } | null {
  const da = a.domain && normalizeDomain(a.domain);
  const db = b.domain && normalizeDomain(b.domain);
  if (da && da === db) return { certain: true, reason: 'Gleiche Domain' };
  const na = normalizeName(a.company_name), nb = normalizeName(b.company_name);
  if (!na || !nb) return null;
  const sameAddress = !!a.postal_code && a.postal_code === b.postal_code && !!street(a.street) && street(a.street) === street(b.street);
  if (na === nb && sameAddress) return { certain: true, reason: 'Gleicher Firmenname und gleiche Adresse' };
  if (na === nb) return { certain: false, reason: 'Gleicher Firmenname; Adresse prüfen' };
  if (sameAddress && similarity(na, nb) >= 0.78) return { certain: false, reason: 'Ähnlicher Firmenname an gleicher Adresse' };
  if (a.postal_code && a.postal_code === b.postal_code && similarity(na, nb) >= 0.9)
    return { certain: false, reason: 'Ähnlicher Firmenname bei gleicher PLZ' };
  return null;
}
