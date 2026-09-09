import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { PreferencesProvider } from "@/core/preferences/preferences-provider";
import "./globals.css";

const interTight = Inter_Tight({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter-tight",
});

const inter = Inter({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "Kjora",
    template: "%s · Kjora",
  },
  description: "La gestion locative qui garde l’essentiel à portée de main.",
  applicationName: "Kjora",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
  // Cette app est l'espace applicatif authentifié (app.*), pas le site
  // commercial (géré séparément). Aucune page ici n'est une cible SEO.
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#EDF1F3" },
    { media: "(prefers-color-scheme: dark)", color: "#0C141E" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html className={`${interTight.variable} ${inter.variable}`} lang="fr" suppressHydrationWarning>
      <body>
        <PreferencesProvider>{children}</PreferencesProvider>
      </body>
    </html>
  );
}
