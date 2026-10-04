#!/usr/bin/env node
/**
 * Server healthcheck for docker-compose.
 *
 * Prints the JSON body of GET /health and exits 0 only when the server is up
 * and healthy; otherwise prints stderr and exits 1 so docker compose can
 * restart / reconsider readiness.
 *
 * Usage: node scripts/healthcheck.js
 *   (reads PORT, MONGODB_URI etc. from the same env the server uses)
 */

import https from "node:https";
import http from "node:http";
import { config } from "../src/config.js";

const port = config.port || 8000;
const options = {
  host: "127.0.0.1",
  port,
  path: "/health",
  timeout: 5000,
  headers: { "Accept": "application/json" },
};

const req = (config.mongodbUri && config.mongodbUri.startsWith("mongodb")) ? http : https;

req.get(options, (res) => {
  let body = "";
  res.on("data", (chunk) => (body += chunk));
  res.on("end", () => {
    try {
      const parsed = JSON.parse(body);
      if (res.statusCode === 200 && parsed?.status === "ok") {
        console.log("[healthcheck] server:", parsed);
        process.exit(0);
      }
    } catch (_) {
      // ignore non-JSON
    }
    console.error("[healthcheck] server did not return a healthy body:", body || res.statusCode);
    process.exit(1);
  });
}).on("timeout", () => {
  console.error("[healthcheck] server did not respond within 5s");
  process.exit(1);
}).on("error", (err) => {
  console.error("[healthcheck] server unreachable:", err.message);
  process.exit(1);
});
