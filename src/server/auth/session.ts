import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";

/**
 * Zustandslose Session: ein signiertes Cookie, dessen Wert der Ausstellungs-
 * zeitpunkt ist. Bei einem einzigen Nutzer (spec Q3) braucht es keinen
 * Session-Store -- das ueberlebt auch Server-Neustarts, ohne dass sich jemand
 * neu anmelden muss.
 */
const COOKIE_NAME = "xortec_session";

export function issueSession(reply: FastifyReply): void {
  reply.setCookie(COOKIE_NAME, String(Date.now()), {
    signed: true,
    httpOnly: true,
    sameSite: "lax",
    // Auf IONOS laeuft die App hinter HTTPS (spec Q8); lokal wuerde ein
    // secure-Cookie ueber http nie ankommen.
    secure: config.isProduction,
    path: "/",
    maxAge: config.sessionMaxAgeSeconds,
  });
}

export function clearSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE_NAME, { path: "/" });
}

export function hasValidSession(request: FastifyRequest): boolean {
  const raw = request.cookies[COOKIE_NAME];
  if (!raw) return false;

  const unsigned = request.unsignCookie(raw);
  if (!unsigned.valid || !unsigned.value) return false;

  const issuedAt = Number(unsigned.value);
  if (!Number.isFinite(issuedAt)) return false;

  const ageSeconds = (Date.now() - issuedAt) / 1000;
  return ageSeconds >= 0 && ageSeconds < config.sessionMaxAgeSeconds;
}
