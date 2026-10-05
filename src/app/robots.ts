import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{
      userAgent: "*",
      allow: ["/", "/aide", "/contact", "/securite", "/confidentialite", "/mentions-legales", "/partenaires"],
      disallow: ["/api/", "/app/", "/administration/", "/portal/", "/partenaire/", "/connexion", "/auth/", "/onboarding/", "/invitation/", "/verrouillage", "/organisation-suspendue"],
    }],
    sitemap: "https://kjorapp.com/sitemap.xml",
    host: "https://kjorapp.com",
  };
}
