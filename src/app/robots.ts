import type { MetadataRoute } from "next";

// Cette app est l'espace applicatif authentifié KJORA (app.*), distinct du
// site commercial (géré séparément par Codex). Aucune page ici n'est une
// cible SEO — voir aussi le `robots` défini dans layout.tsx (balise meta),
// qui couvre le cas où une page serait tout de même explorée.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
