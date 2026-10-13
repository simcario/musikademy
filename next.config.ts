import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";

// Identità della build: versione di package.json + data/ora (UTC) di compilazione.
// Il numero di build cambia a ogni `next build` e fa da versione della cache del service worker.
// Passa per process.env così i processi figli della build vedono lo stesso valore.
const { version } = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version: string };
const buildTime = (process.env.MUSIKADEMY_BUILD_TIME ??= new Date().toISOString());
const buildId = buildTime.replace(/\D/g, "").replace(/^(\d{8})(\d{4}).*$/, "$1.$2");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_APP_VERSION: version,
    NEXT_PUBLIC_BUILD_ID: buildId,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // firebase-admin resta un modulo Node lato server (route handler), mai nel bundle client.
  serverExternalPackages: ["firebase-admin"],
  images: {
    remotePatterns: [{ protocol: "https", hostname: "firebasestorage.googleapis.com" }],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          // Il microfono serve agli esercizi interattivi (riconoscimento della nota suonata).
          { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
        ],
      },
    ];
  },
  // Solo in locale su disco exFAT (npm run dev:local / build:local): webpack non deve risolvere symlink.
  // Altrove la chiave `webpack` non esiste, perché con Turbopack (build standard, App Hosting) la farebbe fallire.
  ...(process.env.MUSIKADEMY_EXFAT === "1"
    ? {
        webpack(config: { resolve: { symlinks?: boolean } }) {
          config.resolve.symlinks = false;
          return config;
        },
      }
    : {}),
};

export default nextConfig;
