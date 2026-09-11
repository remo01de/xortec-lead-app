import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { parseCsv } from '../util/csv.js';
import { matchIdentity, normalizeText, type Identity } from '../research/identity.js';
import { normalizeDomain } from '../research/dedupe.js';
import type { CompanyRow } from './types.js';

export function readCustomers(db: DatabaseSync): Identity[] {
  return db.prepare('SELECT * FROM customers').all() as unknown as Identity[];
}

export function isKnownCustomer(db: DatabaseSync, company: Identity): boolean {
  return readCustomers(db).some(c => matchIdentity(company, c)?.certain);
}

const aliases: Record<string, string[]> = {
  company_name: ['firma', 'firmenname', 'companyname', 'company', 'name', 'accountname'],
  domain: ['domain', 'website', 'webseite', 'url', 'homepage'],
  street: ['strasse', 'strassehausnummer', 'street', 'adresse'],
  postal_code: ['plz', 'postleitzahl', 'postalcode', 'zip'],
  city: ['ort', 'stadt', 'city'],
};

export function parseCustomers(csv: string) {
  const [headers, ...data] = parseCsv(csv);
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, names]) => {
    const hits = headers!.flatMap((h, i) => names.includes(normalizeText(h)) ? [i] : []);
    if (hits.length > 1) throw new Error(`Mehrere Spalten für ${key}; bitte nur eine verwenden.`);
    return [key, hits[0] ?? -1];
  }));
  if (columns.company_name === -1 && columns.domain === -1) throw new Error('Spalte „Firmenname“ oder „Domain/Website“ fehlt.');
  return data.map((row, i) => {
    const get = (key: string) => row[columns[key]!] || null;
    const rawDomain = get('domain');
    const domain = rawDomain ? normalizeDomain(rawDomain) : null;
    const customer: Identity = { company_name: get('company_name') ?? '', domain, street: get('street'), postal_code: get('postal_code'), city: get('city') };
    const error = rawDomain && !domain ? 'Ungültige Domain/Website' : customer.postal_code && !/^\d{5}$/.test(customer.postal_code) ? 'PLZ muss fünfstellig sein' : !domain && !(customer.company_name && customer.street && customer.postal_code) ? 'Domain oder Firmenname mit Straße und PLZ erforderlich' : null;
    return { row: i + 2, customer, error };
  });
}

export function previewCustomers(db: DatabaseSync, csv: string) {
  const companies = db.prepare('SELECT * FROM companies').all() as unknown as CompanyRow[];
  const rows = parseCustomers(csv).map(r => ({ ...r, matches: r.error ? [] : companies.flatMap(c => {
    const match = matchIdentity(r.customer, c);
    return match ? [{ id: c.id, companyName: c.company_name, domain: c.domain, address: [c.street, c.postal_code, c.city].filter(Boolean).join(', '), status: c.status, ...match }] : [];
  }) }));
  const token = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
  return { token, rows };
}

export function storeCustomer(db: DatabaseSync, c: Identity): boolean {
  const key = createHash('sha256').update(JSON.stringify([normalizeText(c.company_name), c.domain, normalizeText(c.street), c.postal_code, normalizeText(c.city)])).digest('hex');
  return db.prepare(`INSERT OR IGNORE INTO customers (identity_key, company_name, domain, street, postal_code, city) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(key, c.company_name, c.domain ?? null, c.street ?? null, c.postal_code ?? null, c.city ?? null).changes > 0;
}
