import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import type { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { runResearch } from '../src/server/research/run-orchestrator.js';
import { findCandidates, qualifyCompany } from '../src/server/research/perplexity.client.js';
import { enrichCompany } from '../src/server/enrichment/enrich-company.js';
import { storeCustomer } from '../src/server/db/customers.repo.js';

vi.mock('../src/server/research/perplexity.client.js', () => ({findCandidates:vi.fn(),qualifyCompany:vi.fn()}));
vi.mock('../src/server/enrichment/enrich-company.js', () => ({enrichCompany:vi.fn()}));
const { DatabaseSync: Database } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new(path:string)=>DatabaseSync };
let db: DatabaseSync;
beforeEach(() => {
  vi.resetAllMocks(); db = new Database(':memory:');
  for(const f of readdirSync('src/server/db/migrations').sort()) db.exec(readFileSync(`src/server/db/migrations/${f}`,'utf8'));
});
afterEach(() => db.close());

it('skips imported customer domains before qualification (no paid qualification call)', async () => {
  storeCustomer(db,{company_name:'Kunde',domain:'kunde.de'});
  vi.mocked(findCandidates).mockResolvedValue({data:{candidates:[{company_name:'Kunde',website:'https://kunde.de',reason:'Test'}]},costUsd:0,searchResultsCount:1});
  const result = await runResearch(db,'21','manual');
  expect(qualifyCompany).not.toHaveBeenCalled(); expect(result.newCompanyIds).toEqual([]);
});

it.each(['customer','company'])('skips a different domain with the same name and address (%s)', async kind => {
  const identity = {company_name:'Müller Sicherheit GmbH',domain:'original.de',street:'Hauptstraße 1',postal_code:'20097',city:'Hamburg'};
  if (kind === 'customer') storeCustomer(db,identity);
  else db.prepare('INSERT INTO companies (company_name,domain,street,postal_code,city) VALUES (?,?,?,?,?)').run(identity.company_name,identity.domain,identity.street,identity.postal_code,identity.city);
  vi.mocked(findCandidates).mockResolvedValue({data:{candidates:[{company_name:'Mueller Sicherheit',website:'https://anders.de',reason:'Test'}]},costUsd:0,searchResultsCount:1});
  vi.mocked(qualifyCompany).mockResolvedValue({data:{...identity,company_name:'Mueller Sicherheit',website:'https://anders.de',street:'Hauptstr. 1'},costUsd:0,searchResultsCount:1} as Awaited<ReturnType<typeof qualifyCompany>>);
  const result = await runResearch(db,'21','manual');
  expect(enrichCompany).not.toHaveBeenCalled(); expect(result.newCompanyIds).toEqual([]);
});
