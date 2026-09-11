import { request, type ImportPreview } from '../api.js';
import { escapeHtml as esc } from '../ui.js';
import { showCompanyDetail } from './company-detail.js';

export function renderDataView(container: HTMLElement): void {
  container.innerHTML = `<h2>Daten und Abgleich</h2><section class="data-section"><h3>Export für Auswertungen</h3>
    <p><a href="/api/companies/export?scope=all">Gesamten Datenbestand als CSV herunterladen</a></p>
    <p class="company-meta">Enthält auch Bestandskunden, ungeprüfte Firmen, Quellen und Vertriebsfeedback. In Excel über „Daten → Aus Text/CSV“ öffnen (UTF-8, Semikolon; PLZ und Telefon als Text). Eine gefilterte Auswahl exportierst du im Feld-Tab.</p></section>
    <section class="data-section"><h3>Bestandskunden importieren</h3>
    <p>CSV mit Kopfzeile: <code>Firmenname;Domain;Straße;PLZ;Ort</code>. Erforderlich: Domain/Website oder Firmenname mit Straße und PLZ. Komma und Tab werden ebenfalls erkannt. Maximal 2 MB und 10.000 Datenzeilen.</p>
    <p>Gültige Einträge werden der Kundenliste hinzugefügt und bei späteren Recherchen abgeglichen. Ausgewählte Treffer erhalten den Status „Bestandskunde“. Fehlerhafte Zeilen werden übersprungen.</p>
    <form id="import-form"><label>CSV-Datei<input id="csv-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" required></label>
    <label>Zeichensatz<select id="encoding"><option value="utf-8">UTF-8 (Standard)</option><option value="windows-1252">Windows / älteres Excel</option></select></label>
    <button class="primary">Vorschau laden</button></form><p id="import-message" role="status"></p><div id="preview"></div></section>
    <section class="data-section"><h3>Gespeicherte Kundenliste</h3><div id="customers">Lade Kundenliste…</div></section>
    <section class="data-section"><h3>Vertriebserfahrung und Dubletten</h3><p>Bewerte Firmen in der Detailansicht mit „passt“, „passt nicht“ oder „noch unklar“. Bis ausreichend Praxiserfahrung vorliegt, gelten die bisherigen Punkteregeln.</p><div id="quality">Lade Übersicht…</div></section>`;
  const form = container.querySelector<HTMLFormElement>('#import-form')!;
  const fileInput = container.querySelector<HTMLInputElement>('#csv-file')!;
  const encoding = container.querySelector<HTMLSelectElement>('#encoding')!;
  const previewEl = container.querySelector<HTMLElement>('#preview')!;
  const message = container.querySelector<HTMLElement>('#import-message')!;
  let generation = 0;
  const invalidate = () => { generation++; previewEl.innerHTML = ''; message.textContent = ''; };
  fileInput.addEventListener('change', invalidate);
  encoding.addEventListener('change', invalidate);

  async function refresh(): Promise<void> {
    const customerEl = container.querySelector<HTMLElement>('#customers');
    const qualityEl = container.querySelector<HTMLElement>('#quality');
    if (!customerEl || !qualityEl) return;
    const result = await Promise.allSettled([
      request<{ company_name: string; domain: string | null; street: string | null; postal_code: string | null; city: string | null }[]>('/api/customers'),
      request<{ feedback: { sales_feedback: string | null; count: number }[]; duplicates: { first: {id: number; companyName: string}; second: {id: number; companyName: string}; reason: string }[] }>('/api/companies/quality'),
    ]);
    const customers = result[0], quality = result[1];
    if (customers.status === 'fulfilled') customerEl.innerHTML = `<p>${customers.value.length} Kundeneinträge</p><details><summary>Kundenliste anzeigen</summary>${customers.value.map(c => `<p>${esc(c.company_name || c.domain)} · ${esc(c.domain)}<br><small>${esc([c.street, c.postal_code, c.city].filter(Boolean).join(', '))}</small></p>`).join('') || '<p>Noch keine Kunden importiert.</p>'}</details>`;
    else customerEl.textContent = `Laden fehlgeschlagen: ${String(customers.reason)}`;
    if (quality.status === 'fulfilled') {
      const labels: Record<string, string> = { good_fit: 'Passt', poor_fit: 'Passt nicht', uncertain: 'Noch unklar', none: 'Ohne Feedback' };
      qualityEl.innerHTML = `<p>${quality.value.feedback.map(f => `${labels[f.sales_feedback ?? 'none']}: ${f.count}`).join(' · ') || 'Noch keine Firmen vorhanden.'}</p><p>${quality.value.duplicates.length} mögliche Dublettenpaare. Hinweise bitte anhand der Quellen prüfen.</p><details><summary>Dublettenhinweise anzeigen</summary><div class="import-rows">${quality.value.duplicates.map(d => `<p><button data-detail="${d.first.id}">${esc(d.first.companyName)}</button> / <button data-detail="${d.second.id}">${esc(d.second.companyName)}</button><br>${esc(d.reason)}</p>`).join('') || '<p>Keine Hinweise vorhanden.</p>'}</div></details>`;
      qualityEl.querySelectorAll<HTMLElement>('[data-detail]').forEach(b => b.addEventListener('click', () => void showCompanyDetail(Number(b.dataset.detail), () => void refresh())));
    } else qualityEl.textContent = `Laden fehlgeschlagen: ${String(quality.reason)}`;
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) { message.textContent = 'Datei zu groß (maximal 2 MB).'; return; }
    const current = ++generation, button = form.querySelector('button')!;
    button.disabled = true; previewEl.innerHTML = ''; message.textContent = 'Prüfe CSV und gleiche Firmen ab…';
    try {
      const csv = new TextDecoder(encoding.value, { fatal: true }).decode(await file.arrayBuffer());
      const preview = await request<ImportPreview>('/api/customers/preview', { csv });
      if (current !== generation || !message.isConnected) return;
      const valid = preview.rows.filter(r => !r.error).length;
      message.textContent = `${valid} gültige Zeilen, ${preview.rows.length - valid} fehlerhafte Zeilen. Prüfe die Zuordnung vor dem Import.`;
      previewEl.innerHTML = `<div class="import-rows">${preview.rows.map(r => `<article class="source-card"><strong>Zeile ${r.row}: ${esc(r.customer.company_name || r.customer.domain)}</strong>${r.error ? `<p class="error-text">${esc(r.error)}</p>` : r.matches.length ? r.matches.map(m => `<label class="match-option"><input type="checkbox" data-row="${r.row}" data-id="${m.id}" ${m.certain ? 'checked' : ''}><span>${esc(m.companyName)} · ${esc(m.domain)}<br><small>${esc(m.address)}<br>${esc(m.reason)}${m.certain ? '' : ' — bitte manuell prüfen'}</small></span></label>`).join('') : '<p>Kein bestehender Lead zugeordnet. Wird für zukünftige Recherchen gespeichert.</p>'}</article>`).join('')}</div><p>Alle ${valid} gültigen Zeilen werden dauerhaft gespeichert. Nur angehakte Leads werden jetzt als Bestandskunde markiert; vorhandene Notizen bleiben erhalten.</p><button class="primary" id="commit-import" ${valid ? '' : 'disabled'}>Kundenliste importieren und Auswahl abgleichen</button>`;
      const commit = previewEl.querySelector<HTMLButtonElement>('#commit-import')!;
      commit.addEventListener('click', async () => {
        const selected = [...previewEl.querySelectorAll<HTMLInputElement>('input:checked')].map(i => ({ row: Number(i.dataset.row), id: Number(i.dataset.id) }));
        commit.disabled = true; button.disabled = true; fileInput.disabled = true; encoding.disabled = true;
        previewEl.querySelectorAll<HTMLInputElement>('input').forEach(i => { i.disabled = true; });
        try {
          const result = await request<{added: number; matched: number; skipped: number}>('/api/customers/import', { csv, token: preview.token, selected });
          previewEl.innerHTML = '';
          message.textContent = `Import abgeschlossen: ${result.added} neue Kundeneinträge, ${result.matched} Leads abgeglichen, ${result.skipped} fehlerhafte Zeilen übersprungen.`;
          void refresh();
        } catch (err) {
          message.textContent = `Import fehlgeschlagen: ${String(err)} Bitte Vorschau erneut laden.`;
          previewEl.innerHTML = '';
        } finally { button.disabled = false; fileInput.disabled = false; encoding.disabled = false; }
      });
    } catch (err) { if (current === generation) message.textContent = `Vorschau fehlgeschlagen: ${String(err)} Prüfe bei Umlauten auch den Zeichensatz.`; }
    finally { button.disabled = false; }
  });
  void refresh();
}
