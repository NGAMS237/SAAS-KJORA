import type { NextConfig } from "next";
import { SECURITY_HEADERS, buildContentSecurityPolicy } from "./src/core/security/http-headers";

// En-têtes de sécurité : voir src/core/security/http-headers.ts (gardés hors de
// ce fichier, que l'hébergeur peut remplacer par son propre enveloppeur).
const nextConfig: NextConfig = {
  devIndicators: false,
  reactStrictMode: true,
  trailingSlash: true,
  experimental: {
    cpus: 1,
    memoryBasedWorkersCount: false,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...SECURITY_HEADERS,
          { key: "Content-Security-Policy-Report-Only", value: buildContentSecurityPolicy() },
        ],
      },
      { source: "/sw.js", headers: [
        { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        { key: "Service-Worker-Allowed", value: "/" },
      ] },
    ];
  },
};

export default nextConfig;
