import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getDb, withTransaction } from '../../db/db.js';
import { previewCustomers, storeCustomer } from '../../db/customers.repo.js';

const input = z.object({ csv: z.string().min(1).max(2_000_000) });
const commitInput = input.extend({ token: z.string(), selected: z.array(z.object({ row: z.number().int(), id: z.number().int().positive() })).max(20000) });

export function registerCustomerRoutes(app: FastifyInstance): void {
  app.get('/api/customers', async () => getDb().prepare('SELECT * FROM customers ORDER BY company_name').all());
  app.post('/api/customers/preview', { bodyLimit: 3_000_000 }, async (req, reply) => {
    const parsed = input.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'CSV fehlt oder ist zu groß (max. 2 MB).' });
    try { return previewCustomers(getDb(), parsed.data.csv); }
    catch (e) { return reply.code(400).send({ error: String(e instanceof Error ? e.message : e) }); }
  });
  app.post('/api/customers/import', { bodyLimit: 4_000_000 }, async (req, reply) => {
    const parsed = commitInput.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Ungültiger Import.' });
    const db = getDb();
    let preview;
    try { preview = previewCustomers(db, parsed.data.csv); }
    catch (e) { return reply.code(400).send({ error: String(e instanceof Error ? e.message : e) }); }
    if (preview.token !== parsed.data.token) return reply.code(409).send({ error: 'Daten wurden geändert. Bitte Vorschau erneut laden.' });
    for (const selection of parsed.data.selected) {
      if (!preview.rows.some(r => r.row === selection.row && r.matches.some(m => m.id === selection.id)))
        return reply.code(400).send({ error: 'Auswahl gehört nicht zur Vorschau.' });
    }
    return withTransaction(db, () => {
      let added = 0;
      for (const row of preview.rows) if (!row.error && storeCustomer(db, row.customer)) added++;
      const ids = new Set(parsed.data.selected.map(s => s.id));
      for (const id of ids) db.prepare(`UPDATE companies SET status = 'bestandskunde', last_updated = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(id);
      return { added, matched: ids.size, skipped: preview.rows.filter(r => r.error).length };
    });
  });
}
