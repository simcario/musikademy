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
  // Il progetto vive su un disco exFAT (niente symlink/junction): webpack non deve risolvere symlink.
  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

export default nextConfig;
