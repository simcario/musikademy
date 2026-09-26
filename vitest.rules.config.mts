import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Test delle Security Rules: richiedono gli emulatori (npm run test:rules, Java 11+). */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/rules/**/*.test.ts"],
    environment: "node",
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
