import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../../auth/password.js";
import { clearSession, hasValidSession, issueSession } from "../../auth/session.js";
import { config } from "../../config.js";

const loginBodySchema = z.object({
  password: z.string().min(1),
});

/**
 * Einfache Bremse gegen Passwort-Raten: nach MAX_ATTEMPTS Fehlversuchen ist der
 * Login fuer LOCKOUT_MS gesperrt. In-Memory reicht bei einem Nutzer und einem
 * Prozess; ein Neustart hebt die Sperre auf, was hier akzeptabel ist.
 */
const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
let failedAttempts = 0;
let lockedUntil = 0;

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post("/api/auth/login", async (req, reply) => {
    if (Date.now() < lockedUntil) {
      const seconds = Math.ceil((lockedUntil - Date.now()) / 1000);
      return reply.code(429).send({ error: `Zu viele Fehlversuche. Erneut moeglich in ${seconds} s.` });
    }

    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "Passwort fehlt" });

    const ok = await verifyPassword(parsed.data.password, config.authPasswordHash);
    if (!ok) {
      failedAttempts++;
      if (failedAttempts >= MAX_ATTEMPTS) {
        lockedUntil = Date.now() + LOCKOUT_MS;
        failedAttempts = 0;
        req.log.warn("Login gesperrt nach zu vielen Fehlversuchen");
      }
      return reply.code(401).send({ error: "Falsches Passwort" });
    }

    failedAttempts = 0;
    issueSession(reply);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (_req, reply) => {
    clearSession(reply);
    return { ok: true };
  });

  /** Vom Frontend beim Start abgefragt, um Login- oder App-Ansicht zu entscheiden. */
  app.get("/api/auth/session", async (req) => {
    return { authenticated: hasValidSession(req) };
  });
}
