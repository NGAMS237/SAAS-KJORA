import type { MetadataRoute } from "next";

const PUBLIC_ROUTES = ["", "/aide", "/contact", "/securite", "/confidentialite", "/mentions-legales", "/partenaires"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_ROUTES.map((path, index) => ({
    url: `https://kjorapp.com${path}`,
    changeFrequency: index === 0 ? "weekly" : "monthly",
    priority: index === 0 ? 1 : 0.6,
  }));
}
