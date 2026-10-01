import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// HTTPS is enabled automatically when a dev certificate exists in
// frontend/.certs/ (self-signed; see README for `make-cert` steps). Phones
// need HTTPS for microphone access (getUserMedia), which is why the voice
// features only work over https:// or on desktop localhost.
// Set SHRAM_HTTPS=off to force plain HTTP (e.g. for the desktop preview tab).
const certDir = path.resolve(__dirname, ".certs");
const keyPath = path.join(certDir, "key.pem");
const certPath = path.join(certDir, "cert.pem");
const httpsDisabled = process.env.SHRAM_HTTPS === "off";
const https =
  !httpsDisabled && fs.existsSync(keyPath) && fs.existsSync(certPath)
    ? { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) }
    : undefined;

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["react", "react-dom", "react-router-dom", "react-i18next", "i18next"],
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    https,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    https,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
