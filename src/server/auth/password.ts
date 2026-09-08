import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

const KEY_LENGTH = 64;
const PREFIX = "scrypt";

/**
 * Passwort-Hashing mit scrypt aus node:crypto -- keine zusaetzliche
 * Abhaengigkeit noetig. Format: scrypt:<saltHex>:<keyHex>.
 * Das Klartextpasswort steht nie in .env, nur der Hash (siehe scripts/hash-password.mjs).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `${PREFIX}:${salt.toString("hex")}:${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, saltHex, keyHex] = stored.split(":");
  if (prefix !== PREFIX || !saltHex || !keyHex) return false;

  let expected: Buffer;
  try {
    expected = Buffer.from(keyHex, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEY_LENGTH) return false;

  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), KEY_LENGTH);
  return timingSafeEqual(actual, expected);
}
