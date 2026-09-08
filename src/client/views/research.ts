import { fetchRecentRuns, triggerResearchRun, type RunRow } from "../api.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("de-DE");
}

function renderRunsTable(runs: RunRow[]): string {
  if (runs.length === 0) return `<p class="empty-state">Noch keine Recherche-Läufe.</p>`;
  return `
    <table>
      <thead>
        <tr><th>Zeit</th><th>Gebiet</th><th>Gefunden</th><th>Qualifiziert</th><th>Kosten</th><th>Trigger</th></tr>
      </thead>
      <tbody>
        ${runs
          .map(
            (r) => `
          <tr>
            <td>${formatDate(r.started_at)}</td>
            <td>${r.area_code}</td>
            <td>${r.candidates_found}</td>
            <td>${r.candidates_qualified}</td>
            <td>${r.cost_eur.toFixed(2)} €</td>
            <td>${r.trigger === "manual" ? "manuell" : "Cron"}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

export function renderResearchView(container: HTMLElement): void {
  container.innerHTML = `
    <div class="warning-box">
      <strong>Recherche kostet Zeit und Geld.</strong> Ein Lauf ruft die Perplexity Search-
      und Agent-API auf, ist auf maximal 40 neue Kandidaten und ca. 0,50 € gedeckelt und
      kann je nach Trefferzahl mehrere Minuten dauern. Die Datenbank läuft dem Vertriebsgebiet
      voraus: ein Gebiet, das nie recherchiert wurde, ist in der Feldansicht leer — das ist kein
      Fehler der App.
    </div>
    <div class="controls">
      <label for="areaCode">PLZ-Gebiet (2-stellig):</label>
      <input id="areaCode" type="text" pattern="[0-9]{2}" maxlength="2" placeholder="z.B. 21" />
      <button class="primary" id="start">Recherche starten</button>
    </div>
    <div id="status"></div>
    <div class="run-list">
      <h3>Letzte Läufe</h3>
      <div id="runs"><p class="empty-state">Lädt…</p></div>
    </div>
  `;

  const areaInput = container.querySelector<HTMLInputElement>("#areaCode")!;
  const startBtn = container.querySelector<HTMLButtonElement>("#start")!;
  const statusEl = container.querySelector<HTMLDivElement>("#status")!;
  const runsEl = container.querySelector<HTMLDivElement>("#runs")!;

  async function loadRuns(): Promise<void> {
    try {
      runsEl.innerHTML = renderRunsTable(await fetchRecentRuns());
    } catch (err) {
      runsEl.innerHTML = `<p class="empty-state">Fehler beim Laden: ${String(err)}</p>`;
    }
  }

  startBtn.addEventListener("click", async () => {
    const areaCode = areaInput.value.trim();
    if (!/^[0-9]{2}$/.test(areaCode)) {
      statusEl.innerHTML = `<p class="empty-state">Bitte ein zweistelliges PLZ-Präfix eingeben (z.B. 21).</p>`;
      return;
    }
    if (!confirm(`Recherche-Lauf für Gebiet ${areaCode} starten? Das kann mehrere Minuten dauern und kostet bis zu ca. 0,50 €.`)) {
      return;
    }
    startBtn.disabled = true;
    statusEl.innerHTML = `<p class="empty-state">Lauf läuft… bitte warten.</p>`;
    try {
      const result = await triggerResearchRun(areaCode);
      statusEl.innerHTML = `
        <div class="warning-box">
          Lauf abgeschlossen: ${result.candidatesQualified} von ${result.candidatesFound} Kandidaten
          qualifiziert, ${result.candidatesOutsideArea} durch Geofilter verworfen (ausserhalb des
          Gebiets), ${result.apiCalls} API-Calls, ${result.costEur.toFixed(2)} € Kosten.
          ${result.stoppedByCostCap ? "Kostendeckel wurde erreicht, Lauf vorzeitig beendet." : ""}
        </div>
      `;
      await loadRuns();
    } catch (err) {
      statusEl.innerHTML = `<p class="empty-state">Fehler: ${String(err)}</p>`;
    } finally {
      startBtn.disabled = false;
    }
  });

  loadRuns();
}
