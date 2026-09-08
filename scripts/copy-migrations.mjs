// tsc kompiliert nur .ts -> .js und laesst .sql-Dateien liegen. Migrationen
// muessen aber neben migrate.js im dist-Ordner liegen (siehe migrate.ts,
// das den Ordner relativ zu import.meta.url auflöst).
import { cpSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const src = join(root, "../src/server/db/migrations");
const dest = join(root, "../dist/server/db/migrations");

mkdirSync(dest, { recursive: true });
cpSync(src, dest, { recursive: true });
console.log(`Migrationen kopiert: ${src} -> ${dest}`);
