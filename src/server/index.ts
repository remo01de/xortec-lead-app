import fastifyCookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { registerAuthRoutes } from "./api/routes/auth.js";
import { registerCompanyRoutes } from "./api/routes/companies.js";
import { registerCustomerRoutes } from "./api/routes/customers.js";
import { registerResearchRoutes } from "./api/routes/research.js";
import { hasValidSession } from "./auth/session.js";
import { assertAuthConfigured, config } from "./config.js";
import { startCron } from "./cron.js";
import { runMigrations } from "./db/migrate.js";

assertAuthConfigured();
runMigrations();

const app = Fastify({
  logger: true,
  // Recherche-Laeufe sind synchron und rufen bis zu ~43 sequentielle Agent-API-
  // Calls auf (3x Stufe 1 + bis zu 40x Stufe 2) -- ein Livetest mit 14
  // qualifizierten Kandidaten lief bereits laenger als 5 Minuten. 5 Minuten
  // (der urspruengliche Wert) war zu knapp und hat den Request per Socket-
  // Timeout ohne Antwort abgebrochen, obwohl der Lauf serverseitig weiterlief.
  // TODO: auf async Job + Status-Polling umstellen, statt Timeout hochzudrehen.
  connectionTimeout: 30 * 60 * 1000,
});

await app.register(fastifyCookie, { secret: config.sessionSecret });

// Alles unter /api ist geschuetzt, ausser Health-Check und den Auth-Routen
// selbst. Die statischen Frontend-Dateien bleiben offen -- schuetzenswert sind
// die Daten dahinter, nicht die leere App-Huelle.
const PUBLIC_API_PATHS = new Set(["/api/health", "/api/auth/login", "/api/auth/logout", "/api/auth/session"]);

app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  const path = req.url.split("?")[0] ?? "";
  if (PUBLIC_API_PATHS.has(path)) return;
  if (hasValidSession(req)) return;
  return reply.code(401).send({ error: "Nicht angemeldet" });
});

registerAuthRoutes(app);
registerCompanyRoutes(app);
registerCustomerRoutes(app);
registerResearchRoutes(app);

app.get("/api/health", async () => ({ ok: true }));

// Produktionsbetrieb: gebautes Frontend (npm run build:client) direkt ausliefern.
// Im Dev-Betrieb stattdessen "npm run dev" (Server) + "npx vite" (Frontend,
// proxied /api zu diesem Server, siehe vite.config.ts) parallel laufen lassen.
const clientDist = join(dirname(fileURLToPath(import.meta.url)), "../../dist/client");
if (existsSync(clientDist)) {
  app.register(fastifyStatic, { root: clientDist });
} else {
  app.log.warn(
    "dist/client nicht gefunden -- 'npm run build:client' ausfuehren, oder Frontend per 'npx vite' separat starten"
  );
}

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then((address) => {
    app.log.info(`Server laeuft auf ${address}`);
    startCron(app.log);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
