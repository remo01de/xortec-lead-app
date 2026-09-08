import { defineConfig } from "vitest/config";

// Eigene Config statt vite.config.ts, weil dessen root:"src/client" (Frontend-
// Build) sonst auch die Testsuche verschieben wuerde.
export default defineConfig({
  test: {
    root: ".",
    include: ["tests/**/*.test.ts"],
  },
});
