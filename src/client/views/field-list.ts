import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { request, updateCompanyStatus, type Company, type LeadStatus } from '../api.js';
import { escapeHtml as esc, navigationUrl, STATUS_LABELS } from '../ui.js';
import { showCompanyDetail } from './company-detail.js';
import { clusterPoints } from '../map-clusters.js';

const RADIUS_OPTIONS = [5, 10, 20, 50, 100];
type Position = { lat: number; lon: number };

function renderCompanyCard(c: Company): string {
  const route = navigationUrl(c);
  return `<article class="company-card prio-${c.priority ?? 'C'}" data-id="${c.id}">
    <h3><button class="detail-link" data-detail="${c.id}">${esc(c.companyName)}</button></h3>
    <div class="company-meta">${esc([c.postalCode, c.city].filter(Boolean).join(' '))}${c.distanceKm !== undefined ? ` · ${c.distanceKm} km` : ''}</div>
    <div class="scores"><span>Fachlichkeit ${c.scoreFachlichkeit}</span><span>Potenzial ${c.scorePotenzial}</span><span>Priorität ${c.priority ?? '–'}</span></div>
    <div class="company-actions">
      ${c.phone ? `<a class="btn-call" href="tel:${esc(c.phone.replace(/[^+0-9]/g, ''))}">Anrufen</a>` : '<span class="company-meta">Keine Telefonnummer</span>'}
      ${route ? `<a href="${esc(route)}" target="_blank" rel="noopener noreferrer">Navigation</a>` : ''}
      <label class="sr-only" for="status-${c.id}">Status von ${esc(c.companyName)}</label>
      <select id="status-${c.id}" class="status-select" data-id="${c.id}">${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}" ${v === c.status ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div></article>`;
}

function markerIcon(className: string, label: string): L.DivIcon {
  return L.divIcon({ className: '', html: `<span class="map-marker ${className}" aria-label="${esc(label)}"></span>`, iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10] });
}

export function renderFieldView(container: HTMLElement): () => void {
  container.innerHTML = `<div class="controls">
    <label for="radius">Umkreis:</label><select id="radius">${RADIUS_OPTIONS.map(r => `<option value="${r}" ${r === 20 ? 'selected' : ''}>${r} km</option>`).join('')}</select>
    <button class="primary" id="refresh">Standort aktualisieren</button>
    <label for="priority">Priorität:</label><select id="priority"><option value="">Alle</option><option>A</option><option>B</option><option>C</option></select>
    <label for="status-filter">Status:</label><select id="status-filter"><option value="">Leads ohne Bestandskunden</option><option value="all">Alle Status</option>${Object.entries(STATUS_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
    <a id="export" href="/api/companies/export">Auswahl als CSV</a>
    </div><section class="map-section" aria-label="Karte mit Firmenstandorten"><div id="company-map" class="company-map"></div>
    <p class="company-meta">A: Grün · B: Gelb · C: Grau · Blau: Standort. Zahlen gruppieren nahe Firmen. Antippen öffnet die Auswahl. PLZ-Mittelpunkte sind nur ungefähr.</p></section>
    <div id="results" aria-live="polite"><p class="empty-state">Standort wird ermittelt…</p></div>`;
  const results = container.querySelector<HTMLElement>('#results')!;
  const radius = container.querySelector<HTMLSelectElement>('#radius')!;
  const priority = container.querySelector<HTMLSelectElement>('#priority')!;
  const status = container.querySelector<HTMLSelectElement>('#status-filter')!;
  const exportLink = container.querySelector<HTMLAnchorElement>('#export')!;
  const refresh = container.querySelector<HTMLButtonElement>('#refresh')!;
  const map = L.map(container.querySelector<HTMLElement>('#company-map')!).setView([51.1657, 10.4515], 6);
  const markers = L.layerGroup().addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-Mitwirkende' }).addTo(map);
  let position: Position | undefined, companies: Company[] = [], locationMessage = '', disposed = false, generation = 0, locationGeneration = 0;

  function detail(id: number): void { void showCompanyDetail(id, () => { if (!disposed) void load(); }); }

  function popup(c: Company): HTMLElement {
    const el = document.createElement('div');
    el.className = 'company-popup';
    const route = navigationUrl(c);
    el.innerHTML = `<button class="detail-link">${esc(c.companyName)}</button><div>${esc([c.street, c.postalCode, c.city].filter(Boolean).join(', '))}</div><div>Priorität ${c.priority ?? '–'} · ${esc(STATUS_LABELS[c.status])}</div>${c.geocodeSource === 'plz_centroid' ? '<small>Ungefährer PLZ-Mittelpunkt</small>' : ''}${route ? `<div><a href="${esc(route)}" target="_blank" rel="noopener noreferrer">Navigation starten</a></div>` : ''}`;
    el.querySelector('button')!.addEventListener('click', () => detail(c.id));
    return el;
  }

  function drawMarkers(): void {
    if (disposed) return;
    markers.clearLayers();
    if (position) L.marker([position.lat, position.lon], { icon: markerIcon('map-marker-user', 'Ihr Standort') }).bindPopup('Ihr Standort').addTo(markers);
    const points = companies.filter(c => c.lat !== null && c.lon !== null).map(c => {
      const point = map.project([c.lat!, c.lon!], map.getZoom());
      return { x: point.x, y: point.y, value: c };
    });
    for (const group of clusterPoints(points, 60)) {
      if (group.length === 1) {
        const c = group[0]!.value;
        L.marker([c.lat!, c.lon!], { icon: markerIcon(`map-marker-prio-${c.priority ?? 'C'}`, c.companyName), title: c.companyName }).bindPopup(popup(c)).addTo(markers);
      } else {
        const members = group.map(p => p.value);
        const center: L.LatLngExpression = [members.reduce((n, c) => n + c.lat!, 0) / members.length, members.reduce((n, c) => n + c.lon!, 0) / members.length];
        const content = document.createElement('div');
        content.className = 'cluster-popup';
        const zoom = document.createElement('button');
        zoom.textContent = `${members.length} Firmen – vergrößern`;
        zoom.addEventListener('click', () => map.fitBounds(members.map(c => [c.lat!, c.lon!] as [number, number]), { maxZoom: Math.min(19, map.getZoom() + 3), padding: [30, 30] }));
        content.append(zoom);
        members.forEach(c => content.append(popup(c)));
        L.marker(center, { icon: L.divIcon({ className: 'map-cluster', html: `<span>${members.length}</span>`, iconSize: [38, 38] }), title: `${members.length} Firmen` }).bindPopup(content).addTo(markers);
      }
    }
  }
  map.on('zoomend', drawMarkers);

  async function load(fit = false): Promise<void> {
    const current = ++generation;
    const params = new URLSearchParams();
    if (position) { params.set('lat', String(position.lat)); params.set('lon', String(position.lon)); params.set('radiusKm', radius.value); }
    if (priority.value) params.set('priority', priority.value);
    if (status.value) params.set('status', status.value);
    exportLink.removeAttribute('href');
    results.innerHTML = '<p class="empty-state">Lade Firmen…</p>';
    try {
      const data = await request<Company[]>(`/api/companies?${params}`);
      if (disposed || current !== generation) return;
      companies = data;
      exportLink.href = `/api/companies/export?${params}`;
      const warning = !position ? `<div class="warning-box"><strong>Ohne Standort.</strong> ${esc(locationMessage)}<br>Alle passenden Leads des Vertriebsgebiets, nach Bewertung sortiert.<button class="retry-location" type="button">Mit Standort erneut versuchen</button></div>` : '';
      const missing = companies.filter(c => c.lat === null || c.lon === null).length;
      results.innerHTML = warning + `<p class="company-meta">${companies.length} Firmen${missing ? ` · ${missing} ohne Kartenposition` : ''}</p>` + (companies.length ? companies.map(renderCompanyCard).join('') : '<div class="warning-box">Keine Firmen für diese Auswahl. Prüfe die Filter. Ein Gebiet ohne recherchierte Daten bleibt leer; die Datenbank muss dem Gebiet vorauslaufen. Ein Recherche-Lauf im Tab „Recherche“ kostet Zeit und Geld (siehe Hinweis dort).</div>');
      if (fit) {
        const bounds: [number, number][] = companies.filter(c => c.lat !== null && c.lon !== null).map(c => [c.lat!, c.lon!]);
        if (position) bounds.push([position.lat, position.lon]);
        if (bounds.length) map.fitBounds(bounds, { maxZoom: 13, padding: [28, 28] });
      }
      drawMarkers();
      requestAnimationFrame(() => { if (!disposed) map.invalidateSize(); });
    } catch (err) {
      if (disposed || current !== generation) return;
      companies = [];
      drawMarkers();
      results.innerHTML = `<p class="empty-state">Fehler beim Laden: ${esc(String(err))}</p>`;
    }
  }

  function locate(): void {
    const current = ++locationGeneration;
    refresh.disabled = true;
    const done = (next?: Position, message = '') => {
      if (disposed || current !== locationGeneration) return;
      position = next; locationMessage = message; refresh.disabled = false;
      void load(true);
    };
    if (!navigator.geolocation) { done(undefined, 'Dieser Browser unterstützt keine Standortbestimmung.'); return; }
    navigator.geolocation.getCurrentPosition(p => done({ lat: p.coords.latitude, lon: p.coords.longitude }), e => done(undefined, e.code === 1 ? 'Standortfreigabe wurde verweigert.' : e.code === 3 ? 'Die Standortbestimmung hat zu lange gedauert.' : 'Der Standort ist derzeit nicht verfügbar.'), { enableHighAccuracy: true, timeout: 10000 });
  }
  results.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (target.closest('.retry-location')) locate();
    const button = target.closest<HTMLElement>('[data-detail]');
    if (button) detail(Number(button.dataset.detail));
  });
  results.addEventListener('change', async e => {
    const select = e.target as HTMLSelectElement;
    if (!select.matches('.status-select')) return;
    const id = Number(select.dataset.id), previous = companies.find(c => c.id === id)?.status;
    select.disabled = true;
    try { await updateCompanyStatus(id, select.value as LeadStatus); if (!disposed) await load(); }
    catch (err) { if (previous) select.value = previous; alert(`Status konnte nicht gespeichert werden: ${String(err)}`); }
    finally { select.disabled = false; }
  });
  refresh.addEventListener('click', locate);
  radius.addEventListener('change', () => void load(true));
  priority.addEventListener('change', () => void load());
  status.addEventListener('change', () => void load());
  locate();
  return () => { disposed = true; generation++; locationGeneration++; map.remove(); };
}
