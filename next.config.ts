import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
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
