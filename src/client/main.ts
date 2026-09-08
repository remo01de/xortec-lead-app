import { fetchSession, logout } from "./api.js";
import { renderFieldView } from "./views/field-list.js";
import { renderLoginView } from "./views/login.js";
import { renderResearchView } from "./views/research.js";

type Tab = "field" | "research";

const app = document.getElementById("app")!;

function renderApp(): void {
  app.innerHTML = `
    <header class="app-header">
      <button data-tab="field" class="active">Feld</button>
      <button data-tab="research">Recherche</button>
      <button id="logout" class="logout">Abmelden</button>
    </header>
    <main id="main"></main>
  `;

  const mainEl = document.getElementById("main")!;
  const tabButtons = app.querySelectorAll<HTMLButtonElement>("[data-tab]");

  function showTab(tab: Tab): void {
    tabButtons.forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
    if (tab === "field") renderFieldView(mainEl);
    else renderResearchView(mainEl);
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab as Tab));
  });

  app.querySelector<HTMLButtonElement>("#logout")!.addEventListener("click", async () => {
    await logout().catch(() => undefined);
    showLogin();
  });

  showTab("field");
}

function showLogin(): void {
  renderLoginView(app, renderApp);
}

// Eine abgelaufene Session kann jederzeit auffallen, nicht nur beim Start --
// die Views werfen dann UnauthorizedError, das hier zentral im Login endet.
window.addEventListener("unhandledrejection", (event) => {
  if (event.reason instanceof Error && event.reason.name === "UnauthorizedError") {
    event.preventDefault();
    showLogin();
  }
});

// Kein Top-Level-await: das Browser-Target des Vite-Builds (chrome87/safari14)
// unterstuetzt es nicht, waehrend tsc mit ES2022 es durchwinkt -- der
// Typecheck faengt diesen Fall also nicht ab.
async function bootstrap(): Promise<void> {
  const session = await fetchSession().catch(() => ({ authenticated: false }));
  if (session.authenticated) renderApp();
  else showLogin();
}

void bootstrap();
