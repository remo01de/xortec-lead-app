import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import Fastify, { type FastifyInstance } from 'fastify';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import * as database from '../src/server/db/db.js';
import { registerCompanyRoutes } from '../src/server/api/routes/companies.js';
import { registerCustomerRoutes } from '../src/server/api/routes/customers.js';
import { isKnownCustomer, parseCustomers } from '../src/server/db/customers.repo.js';
import { matchIdentity } from '../src/server/research/identity.js';
import { normalizeDomain } from '../src/server/research/dedupe.js';
import { parseCsv, toCsv } from '../src/server/util/csv.js';
import { clusterPoints } from '../src/client/map-clusters.js';
import { navigationUrl, safeUrl } from '../src/client/ui.js';

const { DatabaseSync: Database } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };

describe('CSV and identity edge cases', () => {
  it('reads BOM, delimiters, escaped quotes, multiline values and leading zero postal codes', () => {
    expect(parseCsv('\uFEFFFirma;PLZ;Notiz\r\n"A; B";01234;"Zeile 1\n""Zitat"""\r\n')).toEqual([['Firma', 'PLZ', 'Notiz'], ['A; B', '01234', 'Zeile 1\n"Zitat"']]);
    expect(parseCsv('Firma,Domain\nTest,test.de')[1]).toEqual(['Test', 'test.de']);
    expect(parseCsv('Firma\tDomain\nTest\ttest.de')[1]).toEqual(['Test', 'test.de']);
    expect(parseCustomers('Firmenname;Straße;PLZ\nTest;Weg 1;01234')[0]!.customer.postal_code).toBe('01234');
  });
  it('rejects malformed CSV and ambiguous columns', () => {
    for (const csv of ['A;B\n"oops;x', 'A;B\nx;y;z', 'A;B\n"x"oops;y']) expect(() => parseCsv(csv)).toThrow();
    expect(() => parseCustomers('Firma;Name;Domain\nA;B;a.de')).toThrow('Mehrere Spalten');
    expect(parseCustomers('Firma;Domain;PLZ\nA;bad;123')[0]!.error).toBeTruthy();
  });
  it('neutralizes formula payloads and quotes export fields', () => {
    const exported = toCsv([['Firma', 'Notiz'], ['=HYPERLINK("evil")', ' \t@SUM(1)']]);
    expect(exported.startsWith('\uFEFF')).toBe(true);
    expect(exported).toContain('"\'=HYPERLINK(""evil"")"');
    expect(exported).toContain('"\' \t@SUM(1)"');
  });
  it('requires corroborating address for automatic name matching and preserves branches', () => {
    const a = { company_name: 'Müller Sicherheit GmbH', street: 'Hauptstraße 1', postal_code: '01234', domain: 'eins.de' };
    expect(matchIdentity(a, { ...a, company_name: 'Mueller Sicherheit', street: 'Hauptstr. 1', domain: 'zwei.de' })?.certain).toBe(true);
    expect(matchIdentity(a, { ...a, street: 'Anderer Weg 2', domain: 'zwei.de' })?.certain).toBe(false);
    expect(matchIdentity(a, { ...a, company_name: 'Ganz Andere Firma', domain: 'zwei.de' })).toBeNull();
    expect(matchIdentity(a, { ...a, company_name: 'Müller Sicherhet', domain: 'zwei.de' })?.certain).toBe(false);
    expect(normalizeDomain('https://user@example.de')).toBeNull();
    expect(normalizeDomain('javascript://example.de')).toBeNull();
    expect(normalizeDomain('WWW.Example.DE.')).toBe('example.de');
  });
  it('retains every clustered company, including identical coordinates', () => {
    const groups = clusterPoints([{x: 1,y: 1,value: 1},{x: 1,y: 1,value: 2},{x: 500,y: 1,value: 3}], 60);
    expect(groups.map(g => g.map(p => p.value))).toEqual([[1,2],[3]]);
  });
  it('uses the street address for navigation and rejects unsafe source links', () => {
    const url = navigationUrl({ companyName: 'A & B', street: 'Weg 1', postalCode: '01234', city: 'Ort', lat: 50, lon: 10 });
    expect(new URL(url!).searchParams.get('destination')).toBe('A & B, Weg 1, 01234, Ort');
    expect(navigationUrl({companyName:'A', street:null,postalCode:'01234',city:'Ort',lat:50,lon:10})).toBeNull();
    expect(safeUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('V2 API with a migrated, isolated SQLite database', () => {
  let db: DatabaseSync, app: FastifyInstance;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    for (const file of readdirSync('src/server/db/migrations').sort()) db.exec(readFileSync(`src/server/db/migrations/${file}`, 'utf8'));
    vi.spyOn(database, 'getDb').mockReturnValue(db);
    db.exec(`INSERT INTO companies (id, domain, company_name, street, postal_code, city, status, note, lat, lon, score_fachlichkeit, score_potenzial, score_datenqualitaet, priority, verification_status)
      VALUES (1, 'alpha.de', 'Alpha GmbH', 'Hauptstraße 1', '01234', 'Ort', 'angerufen', 'Erhalten', 53.55, 10, 80, 60, 70, 'A', 'verified'),
      (2, 'alpha-zwei.de', 'Alpha', 'Anderer Weg 2', '01234', 'Ort', 'neu', NULL, 53.551, 10, 70, 30, 70, 'B', 'verified'),
      (3, 'schwach.de', 'Ungeprüft', NULL, NULL, NULL, 'neu', NULL, NULL, NULL, 10, 0, 0, 'C', 'unverified');`);
    app = Fastify(); registerCompanyRoutes(app); registerCustomerRoutes(app);
  });
  afterEach(async () => { await app.close(); vi.restoreAllMocks(); db.close(); });

  it('previews without writes, imports selected matches atomically and is idempotent', async () => {
    const csv = 'Firmenname;Domain;Straße;PLZ;Ort\nAlpha GmbH;;Hauptstr. 1;01234;Ort\nZukunft;zukunft.de;;;\nFehler;unbrauchbar;;;';
    const preview = (await app.inject({ method:'POST',url:'/api/customers/preview',payload:{csv} })).json();
    expect(preview.rows[0].matches.map((m: {certain: boolean}) => m.certain)).toEqual([true,false]);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customers').get()!.n).toBe(0);
    const result = await app.inject({method:'POST',url:'/api/customers/import',payload:{csv,token:preview.token,selected:[{row:2,id:1}]}});
    expect(result.json()).toEqual({added:2,matched:1,skipped:1});
    expect(db.prepare('SELECT status, note FROM companies WHERE id=1').get()).toMatchObject({status:'bestandskunde',note:'Erhalten'});
    expect(db.prepare('SELECT status FROM companies WHERE id=2').get()!.status).toBe('neu');
    expect(isKnownCustomer(db,{company_name:'Zukunft',domain:'www.zukunft.de'})).toBe(true);
    const again = (await app.inject({method:'POST',url:'/api/customers/preview',payload:{csv}})).json();
    expect((await app.inject({method:'POST',url:'/api/customers/import',payload:{csv,token:again.token,selected:[]}})).json().added).toBe(0);
  });
  it('rejects stale previews and arbitrary selected company IDs without partial writes', async () => {
    const csv = 'Firma;Domain\nAlpha;alpha.de';
    const preview = (await app.inject({method:'POST',url:'/api/customers/preview',payload:{csv}})).json();
    expect((await app.inject({method:'POST',url:'/api/customers/import',payload:{csv,token:preview.token,selected:[{row:2,id:3}]}})).statusCode).toBe(400);
    db.exec("UPDATE companies SET status='kein_interesse' WHERE id=1");
    expect((await app.inject({method:'POST',url:'/api/customers/import',payload:{csv,token:preview.token,selected:[]}})).statusCode).toBe(409);
    expect(db.prepare('SELECT COUNT(*) AS n FROM customers').get()!.n).toBe(0);
  });
  it('preserves notes, refreshes filtered results, and exports the same selected firms', async () => {
    await app.inject({method:'PATCH',url:'/api/companies/1/status',payload:{status:'bestandskunde'}});
    expect(db.prepare('SELECT note FROM companies WHERE id=1').get()!.note).toBe('Erhalten');
    expect((await app.inject('/api/companies')).json().map((c:{id:number})=>c.id)).toEqual([2]);
    const filter = 'status=bestandskunde&priority=A&lat=53.55&lon=10&radiusKm=5';
    expect((await app.inject(`/api/companies?${filter}`)).json().map((c:{id:number})=>c.id)).toEqual([1]);
    const exported = await app.inject(`/api/companies/export?${filter}`);
    expect(exported.headers['content-type']).toContain('text/csv');
    expect(exported.body).toContain('alpha.de'); expect(exported.body).not.toContain('alpha-zwei.de');
    expect((await app.inject('/api/companies/export?scope=all')).body).toContain('schwach.de');
    expect((await app.inject('/api/companies?lat=99&lon=10')).statusCode).toBe(400);
    expect((await app.inject('/api/companies?lat=53')).statusCode).toBe(400);
  });
  it('returns evidence, source checks, manufacturers, duplicates and durable feedback', async () => {
    db.exec(`INSERT INTO sources (company_id,url,title,evidence,http_ok) VALUES (1,'https://alpha.de','Quelle','Beleg',1);
      INSERT INTO evidence (company_id,text) VALUES (1,'Planung belegt');
      UPDATE companies SET manufacturer_mentions='[{"manufacturer":"Axis","relationship":"certified_partner"}]' WHERE id=1`);
    const before = (await app.inject('/api/companies/1')).json();
    expect(before.sources[0].http_ok).toBe(1); expect(before.evidence).toEqual(['Planung belegt']);
    expect(before.manufacturerMentions[0].manufacturer).toBe('Axis'); expect(before.duplicates[0].id).toBe(2);
    const saved = await app.inject({method:'PATCH',url:'/api/companies/1/feedback',payload:{feedback:'good_fit',note:'Gutes Gespräch'}});
    expect(saved.json()).toMatchObject({salesFeedback:'good_fit',scoreFachlichkeit:80,scorePotenzial:60,priority:'A'});
    expect((await app.inject('/api/companies/export?scope=all')).body).toContain('Gutes Gespräch');
    expect((await app.inject('/api/companies/quality')).json().duplicates).toHaveLength(1);
  });
});
