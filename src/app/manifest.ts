import type { MetadataRoute } from "next";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Kjora",
    short_name: "Kjora",
    description: "Gestion locative mobile-first, simple et rassurante.",
    start_url: "/app",
    display: "standalone",
    background_color: "#F3EFE6",
    theme_color: "#1F2D27",
    lang: "fr",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };
}
