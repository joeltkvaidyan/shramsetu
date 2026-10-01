import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./tests/setup-env.js"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    pool: "forks",
    fileParallelism: false, // one in-memory Mongo at a time
  },
});
