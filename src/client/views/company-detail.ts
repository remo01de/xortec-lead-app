import { request, updateCompanyStatus, type CompanyDetail, type LeadStatus } from '../api.js';
import { escapeHtml as esc, safeUrl, navigationUrl, STATUS_LABELS, SIGNAL_LABELS } from '../ui.js';

export async function showCompanyDetail(id: number, onChange: () => void): Promise<void> {
  const dialog = document.createElement('dialog');
  dialog.className = 'company-detail';
  dialog.setAttribute('aria-label', 'Firmendetails');
  dialog.innerHTML = '<button class="close-detail" aria-label="Detailansicht schließen">Schließen</button><div class="detail-body" aria-live="polite">Lade Firmendetails…</div>';
  document.body.append(dialog);
  dialog.querySelector('button')!.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => dialog.remove());
  dialog.showModal();
  const body = dialog.querySelector<HTMLElement>('.detail-body')!;
  try {
    const c = await request<CompanyDetail>(`/api/companies/${id}`);
    if (!dialog.isConnected) return;
    const website = safeUrl(c.website), navigation = navigationUrl(c);
    const list = (items: string[]) => items.length ? `<ul>${items.map(v => `<li>${esc(SIGNAL_LABELS[v] ?? v)}</li>`).join('')}</ul>` : '<p class="company-meta">Keine Angaben vorhanden.</p>';
    body.innerHTML = `
      <h2>${esc(c.companyName)}</h2>
      <p>${esc([c.street, c.postalCode, c.city].filter(Boolean).join(', ')) || 'Keine Adresse vorhanden'}</p>
      <div class="company-actions">${website ? `<a href="${esc(website)}" target="_blank" rel="noopener noreferrer">Website öffnen</a>` : ''}
      ${navigation ? `<a href="${esc(navigation)}" target="_blank" rel="noopener noreferrer">Navigation starten</a>` : '<span>Keine vollständige Navigationsadresse</span>'}
      ${c.phone ? `<a href="tel:${esc(c.phone.replace(/[^+0-9]/g, ''))}">Anrufen: ${esc(c.phone)}</a>` : ''}</div>
      <p class="scores">Fachlichkeit ${c.scoreFachlichkeit} · Potenzial ${c.scorePotenzial} · Datenqualität ${c.scoreDatenqualitaet} · Priorität ${c.priority ?? '–'}</p>
      <p class="company-meta">${c.verificationStatus === 'verified' ? 'Verifiziert' : 'Ungeprüft'} · ${c.geocodeSource === 'plz_centroid' ? 'Kartenposition nur PLZ-Mittelpunkt (ca. ±5 km)' : c.geocodeSource === 'nominatim' ? 'Adresse geokodiert' : 'Keine Kartenposition'} · Stand: ${esc(new Date(c.lastUpdated).toLocaleString('de-DE'))}</p>
      <form class="detail-status"><h3>Bearbeitung</h3><label>Status<select name="status">${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Notiz<textarea name="note" maxlength="5000">${esc(c.note)}</textarea></label><button class="primary">Status und Notiz speichern</button><p role="status"></p></form>
      <form class="detail-feedback"><h3>Vertriebserfahrung</h3><p>Deine Einschätzung hilft, die Bewertung später anhand echter Erfahrungen zu kalibrieren. Die Scores bleiben vorerst unverändert.</p>
      <label>Einschätzung<select name="feedback">${[['', 'Noch nicht bewertet'], ['good_fit', 'Passt'], ['poor_fit', 'Passt nicht'], ['uncertain', 'Noch unklar']].map(([v, l]) => `<option value="${v}" ${(c.salesFeedback ?? '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Begründung<textarea name="note" maxlength="5000">${esc(c.feedbackNote)}</textarea></label><button class="primary">Feedback speichern</button><p role="status"></p></form>
      <h3>Herstellerbindungen</h3>${c.manufacturerMentions.length ? `<ul>${c.manufacturerMentions.map(m => `<li>${esc(m.manufacturer)} — ${m.relationship === 'certified_partner' ? 'Zertifizierter Partner' : 'Nur erwähnt'}</li>`).join('')}</ul>` : '<p>Keine Herstellerbindung belegt.</p>'}
      <p class="company-meta">Herstellerbindungen werden angezeigt und fließen nicht in den Score ein.</p>
      <h3>Leistungen</h3>${list(c.services)}<h3>Zielsegmente</h3>${list(c.targetSegments)}<h3>Zertifikate</h3>${list(c.certifications)}
      <h3>Belege</h3>${list(c.evidence)}
      <h3>Quellen (${c.sources.length})</h3>${c.sources.length ? c.sources.map(s => {
        const url = safeUrl(s.url);
        return `<article class="source-card">${url ? `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(s.title || s.url)}</a>` : `<span>${esc(s.title || s.url)}</span>`}<p>${esc(s.evidence) || 'Kein Auszug vorhanden.'}</p><small>${s.http_ok === 1 ? 'HTTP-Prüfung erfolgreich' : s.http_ok === 0 ? 'HTTP-Prüfung fehlgeschlagen' : 'Noch nicht geprüft'}${s.checked_at ? ` · ${esc(new Date(s.checked_at).toLocaleString('de-DE'))}` : ''}</small></article>`;
      }).join('') : '<p>Keine Quellen vorhanden.</p>'}
      <h3>Mögliche Dubletten</h3>${c.duplicates.length ? c.duplicates.map(d => `<p><button type="button" data-duplicate="${d.id}">${esc(d.companyName)}</button> · ${esc(d.domain)}<br>${esc(d.address)}<br>${esc(d.reason)}</p>`).join('') : '<p>Keine Hinweise auf Dubletten.</p>'}`;
    body.querySelectorAll<HTMLElement>('[data-duplicate]').forEach(button => button.addEventListener('click', () => { dialog.close(); void showCompanyDetail(Number(button.dataset.duplicate), onChange); }));
    for (const kind of ['status', 'feedback'] as const) {
      const form = body.querySelector<HTMLFormElement>(`.detail-${kind}`)!;
      form.addEventListener('submit', async e => {
        e.preventDefault();
        const data = new FormData(form), button = form.querySelector('button')!, message = form.querySelector<HTMLElement>('[role="status"]')!;
        button.disabled = true;
        try {
          if (kind === 'status') await updateCompanyStatus(id, data.get('status') as LeadStatus, String(data.get('note') ?? '') || null);
          else await request(`/api/companies/${id}/feedback`, { feedback: data.get('feedback') || null, note: data.get('note') || null }, 'PATCH');
          message.textContent = 'Gespeichert.';
          onChange();
        } catch (err) { message.textContent = `Speichern fehlgeschlagen: ${String(err)}`; }
        finally { button.disabled = false; }
      });
    }
  } catch (err) { body.textContent = `Details konnten nicht geladen werden: ${String(err)}`; }
}
