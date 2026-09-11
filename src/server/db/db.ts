import type { DatabaseSync } from "node:sqlite";
import { createRequire } from 'node:module';
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "../config.js";

// node:sqlite ist ab Node 22.5 experimentell eingebaut -- vermeidet native
// Build-Tools (better-sqlite3 scheitert auf diesem Rechner ohne Visual Studio).
// Docker-Image muss Node >=22.5 (siehe package.json engines) verwenden.

let instance: DatabaseSync | undefined;
const { DatabaseSync: Database } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => DatabaseSync };

export function getDb(): DatabaseSync {
  if (!instance) {
    if (config.databasePath !== ":memory:") {
      mkdirSync(dirname(config.databasePath), { recursive: true });
    }
    instance = new Database(config.databasePath);
    instance.exec("PRAGMA journal_mode = WAL");
    instance.exec("PRAGMA foreign_keys = ON");
  }
  return instance;
}

export function withTransaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
