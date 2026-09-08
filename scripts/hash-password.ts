import { createInterface } from "node:readline";
import { hashPassword } from "../src/server/auth/password.js";

/**
 * Erzeugt den Wert fuer AUTH_PASSWORD_HASH in .env.
 * Aufruf: npm run hash-password
 *
 * Die Eingabe wird nicht angezeigt und landet nicht in der Shell-History --
 * deshalb wird das Passwort bewusst NICHT als Argument entgegengenommen.
 */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    const output = rl as unknown as { output?: NodeJS.WriteStream; _writeToOutput?: (s: string) => void };
    let muted = false;

    output._writeToOutput = (stringToWrite: string) => {
      if (!muted) process.stdout.write(stringToWrite);
    };

    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
    muted = true;
  });
}

const password = await askHidden("Neues Passwort: ");
if (password.length < 8) {
  console.error("Passwort muss mindestens 8 Zeichen haben.");
  process.exit(1);
}
const confirmation = await askHidden("Wiederholen: ");
if (password !== confirmation) {
  console.error("Die Eingaben stimmen nicht ueberein.");
  process.exit(1);
}

const hash = await hashPassword(password);
console.log("\nDiese Zeile in .env eintragen:\n");
console.log(`AUTH_PASSWORD_HASH=${hash}`);
console.log("\nFalls SESSION_SECRET noch fehlt, auch diese Zeile:\n");
console.log(`SESSION_SECRET=${(await import("node:crypto")).randomBytes(32).toString("hex")}`);
