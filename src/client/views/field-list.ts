import {
  fetchCompaniesWithoutLocation,
  fetchFieldCompanies,
  updateCompanyStatus,
  type Company,
  type LeadStatus,
} from "../api.js";

const STATUS_LABELS: Record<LeadStatus, string> = {
  neu: "Neu",
  angerufen: "Angerufen",
  kein_interesse: "Kein Interesse",
  in_salesforce: "In Salesforce",
  bestandskunde: "Bestandskunde",
};

const RADIUS_OPTIONS = [5, 10, 20, 50, 100];

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function renderCompanyCard(c: Company): string {
  const prioClass = c.priority ? `prio-${c.priority}` : "prio-C";
  const distance = c.distanceKm !== undefined ? `${c.distanceKm} km` : "";
  const addressLine = [c.postalCode, c.city].filter(Boolean).join(" ");
  const telHref = c.phone ? `tel:${c.phone.replace(/\s+/g, "")}` : null;

  return `
    <article class="company-card ${prioClass}" data-id="${c.id}">
      <h3>${escapeHtml(c.companyName)}</h3>
      <div class="company-meta">${escapeHtml(addressLine)}${distance ? " · " + distance : ""}</div>
      <div class="scores">
        <span>Fachlichkeit ${c.scoreFachlichkeit}</span>
        <span>Potenzial ${c.scorePotenzial}</span>
        <span>Priorität ${c.priority ?? "-"}</span>
      </div>
      <div class="company-actions">
        ${telHref ? `<a class="btn-call" href="${telHref}">Anrufen</a>` : `<span class="company-meta">Keine Telefonnummer</span>`}
        <select class="status-select" data-id="${c.id}">
          ${Object.entries(STATUS_LABELS)
            .map(([value, label]) => `<option value="${value}" ${value === c.status ? "selected" : ""}>${label}</option>`)
            .join("")}
        </select>
      </div>
    </article>
  `;
}

export function renderFieldView(container: HTMLElement): void {
  container.innerHTML = `
    <div class="controls">
      <label for="radius">Umkreis:</label>
      <select id="radius">
        ${RADIUS_OPTIONS.map((r) => `<option value="${r}" ${r === 20 ? "selected" : ""}>${r} km</option>`).join("")}
      </select>
      <button class="primary" id="refresh">Standort aktualisieren</button>
    </div>
    <div id="results"><p class="empty-state">Standort wird ermittelt…</p></div>
  `;

  const resultsEl = container.querySelector<HTMLDivElement>("#results")!;
  const radiusEl = container.querySelector<HTMLSelectElement>("#radius")!;
  const refreshBtn = container.querySelector<HTMLButtonElement>("#refresh")!;

  async function load(): Promise<void> {
    if (!navigator.geolocation) {
      await loadWithoutLocation("Dieser Browser unterstützt keine Standortbestimmung.");
      return;
    }
    resultsEl.innerHTML = `<p class="empty-state">Standort wird ermittelt…</p>`;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const radiusKm = Number(radiusEl.value);
        try {
          const companies = await fetchFieldCompanies(pos.coords.latitude, pos.coords.longitude, radiusKm);
          renderResults(companies, radiusKm);
        } catch (err) {
          resultsEl.innerHTML = `<p class="empty-state">Fehler beim Laden: ${escapeHtml(String(err))}</p>`;
        }
      },
      (err) => {
        // Kein Standort heisst nicht "keine Leads": ohne Rueckfallebene waere die
        // Ansicht in der Tiefgarage oder bei verweigerter Freigabe komplett leer.
        void loadWithoutLocation(err.message);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }

  /** Alle Leads nach Bewertung sortiert, wenn keine Entfernung berechenbar ist. */
  async function loadWithoutLocation(grund: string): Promise<void> {
    resultsEl.innerHTML = `<p class="empty-state">Lade Leads ohne Standort…</p>`;
    try {
      const companies = await fetchCompaniesWithoutLocation();
      const hinweis = `
        <div class="warning-box">
          <strong>Ohne Standort.</strong> ${escapeHtml(grund)}<br />
          Angezeigt werden alle Leads des Vertriebsgebiets, sortiert nach Bewertung
          statt nach Entfernung.
          <button class="retry-location" type="button">Mit Standort erneut versuchen</button>
        </div>
      `;
      resultsEl.innerHTML =
        companies.length === 0
          ? hinweis + `<p class="empty-state">Noch keine Leads in der Datenbank.</p>`
          : hinweis + companies.map(renderCompanyCard).join("");
    } catch (err) {
      resultsEl.innerHTML = `<p class="empty-state">Fehler beim Laden: ${escapeHtml(String(err))}</p>`;
    }
  }

  function renderResults(companies: Company[], radiusKm: number): void {
    if (companies.length === 0) {
      resultsEl.innerHTML = `
        <div class="warning-box">
          Im Umkreis von ${radiusKm} km liegen keine recherchierten Firmen in der Datenbank.
          Das kann bedeuten, dass dieses Gebiet noch nicht recherchiert wurde — die
          Datenbank muss dem Gebiet vorauslaufen. Starte bei Bedarf einen Recherche-Lauf
          im Tab „Recherche" (kostet Zeit und Geld, siehe Hinweis dort).
        </div>
      `;
      return;
    }
    resultsEl.innerHTML = companies.map(renderCompanyCard).join("");
  }

  resultsEl.addEventListener("click", (e) => {
    if ((e.target as HTMLElement).classList.contains("retry-location")) void load();
  });

  resultsEl.addEventListener("change", async (e) => {
    const select = e.target as HTMLSelectElement;
    if (!select.classList.contains("status-select")) return;
    const id = Number(select.dataset.id);
    const status = select.value as LeadStatus;
    try {
      await updateCompanyStatus(id, status);
      if (status === "bestandskunde") {
        select.closest(".company-card")?.remove();
      }
    } catch (err) {
      alert(`Status konnte nicht gespeichert werden: ${String(err)}`);
    }
  });

  refreshBtn.addEventListener("click", load);
  radiusEl.addEventListener("change", load);
  load();
}
