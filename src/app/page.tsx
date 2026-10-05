import type { Metadata } from "next";
import Link from "next/link";
import { buildConnexionUrl, type SiteAppLocale } from "@/core/onboarding/plan-intent";
import { PublicFooter } from "@/core/ui/public-footer";

export const metadata: Metadata = {
  title: "KJORA — Gestion locative simple et sécurisée",
  description: "Gérez vos biens, locations, paiements et documents dans un espace locatif clair, bilingue et sécurisé.",
  alternates: { canonical: "https://kjorapp.com", languages: { fr: "https://kjorapp.com/?locale=fr", en: "https://kjorapp.com/?locale=en" } },
  robots: { index: true, follow: true },
};

const copy = {
  fr: {
    nav: ["Fonctionnement", "Bénéfices", "Sécurité", "Offres"], signIn: "Se connecter", start: "Commencer gratuitement",
    eyebrow: "Gestion locative, sans détour", title: "Gardez vos biens, vos loyers et vos documents sous contrôle.",
    lead: "KJORA aide les propriétaires et gestionnaires locatifs à suivre l’essentiel dans un espace clair, mobile et sécurisé.",
    proof: ["Biens et logements organisés", "Locations et échéances suivies", "Paiements et documents centralisés"],
    howTitle: "Une gestion plus simple, étape par étape", how: [
      ["1", "Créez votre espace", "Commencez avec le forfait Découverte, sans carte bancaire."],
      ["2", "Ajoutez votre patrimoine", "Structurez vos biens, logements, locataires et locations."],
      ["3", "Suivez ce qui compte", "Visualisez les échéances, paiements, documents et actions utiles."],
    ],
    benefitsTitle: "Pensé pour gérer ici ou à distance", benefits: [
      ["Vue claire", "Retrouvez l’information utile sans multiplier les fichiers et messages."],
      ["Travail en équipe", "Invitez des collaborateurs avec des responsabilités limitées et explicites."],
      ["Mobile d’abord", "Consultez et agissez depuis un téléphone, une tablette ou un ordinateur."],
    ],
    securityTitle: "Vos données privées restent privées", security: "Les accès sont contrôlés côté serveur et séparés par Organization. Les pages publiques peuvent être disponibles hors ligne, mais aucune donnée privée, opération financière ou action contractuelle n’est enregistrée silencieusement sans connexion.",
    offersTitle: "Commencez avec Découverte", offers: "Le forfait gratuit permet d’explorer KJORA sans carte. Les autres forfaits sont présentés dans l’espace de souscription avant toute activation.",
    faqTitle: "Questions fréquentes", faq: [
      ["Puis-je commencer gratuitement ?", "Oui. Découverte reste accessible sans carte bancaire."],
      ["KJORA remplace-t-il mon compte bancaire ?", "Non. KJORA organise la gestion locative; il ne devient pas votre banque."],
      ["Mes collaborateurs voient-ils tout ?", "Non. Les accès dépendent de leur rôle et de l’Organization sélectionnée."],
    ], help: "Consulter l’aide", contact: "Nous contacter",
  },
  en: {
    nav: ["How it works", "Benefits", "Security", "Plans"], signIn: "Sign in", start: "Get started free",
    eyebrow: "Rental management, made clear", title: "Keep your properties, rent and documents under control.",
    lead: "KJORA helps property owners and rental managers follow what matters in a clear, mobile and secure workspace.",
    proof: ["Properties and units organized", "Leases and dues tracked", "Payments and documents centralized"],
    howTitle: "A simpler workflow, step by step", how: [
      ["1", "Create your workspace", "Start with the Discovery plan, with no payment card."],
      ["2", "Add your portfolio", "Organize properties, units, tenants and leases."],
      ["3", "Track what matters", "Review dues, payments, documents and useful actions."],
    ],
    benefitsTitle: "Built for local or remote management", benefits: [
      ["Clear overview", "Find useful information without multiplying files and messages."],
      ["Team access", "Invite collaborators with limited, explicit responsibilities."],
      ["Mobile first", "Review and act from a phone, tablet or computer."],
    ],
    securityTitle: "Your private data stays private", security: "Access is checked on the server and separated by Organization. Public pages may remain available offline, but no private data, financial operation or contractual action is silently recorded without a connection.",
    offersTitle: "Start with Discovery", offers: "The free plan lets you explore KJORA without a card. Other plans are presented in the subscription area before any activation.",
    faqTitle: "Frequently asked questions", faq: [
      ["Can I start for free?", "Yes. Discovery remains available without a payment card."],
      ["Does KJORA replace my bank account?", "No. KJORA organizes rental management; it does not become your bank."],
      ["Can collaborators see everything?", "No. Access depends on their role and the selected Organization."],
    ], help: "View help", contact: "Contact us",
  },
} as const;

export default async function RootPage({ searchParams }: { searchParams: Promise<{ locale?: string | string[] }> }) {
  const params = await searchParams;
  const rawLocale = Array.isArray(params.locale) ? params.locale[0] : params.locale;
  const locale: SiteAppLocale = rawLocale === "en" ? "en" : "fr";
  const c = copy[locale];
  const signIn = buildConnexionUrl({ plan: null, billingCycle: null, billingCountry: null, locale, source: null });
  const start = buildConnexionUrl({ plan: "decouverte", billingCycle: "monthly", billingCountry: null, locale, source: "site" });
  const otherLocale = locale === "fr" ? "en" : "fr";
  const anchors = ["fonctionnement", "benefices", "securite", "offres"];

  return <main className="public-home" data-locale={locale} lang={locale}>
    <header className="public-nav">
      <Link className="public-wordmark" href={`/?locale=${locale}`} aria-label={locale === "fr" ? "KJORA — accueil" : "KJORA — home"}>Kjora<span>.</span></Link>
      <nav aria-label={locale === "fr" ? "Navigation principale" : "Main navigation"}>{c.nav.map((label, index) => <Link key={label} href={`#${anchors[index]}`}>{label}</Link>)}</nav>
      <div className="public-nav__actions"><Link className="public-language" href={`/?locale=${otherLocale}`} lang={otherLocale}>{otherLocale.toUpperCase()}</Link><Link className="button button--secondary" href={signIn}>{c.signIn}</Link></div>
    </header>
    <section className="public-hero"><div><p className="eyebrow">{c.eyebrow}</p><h1>{c.title}</h1><p className="public-lead">{c.lead}</p><div className="public-hero__actions"><Link className="button button--primary" href={start}>{c.start}</Link><Link className="button button--secondary" href="#fonctionnement">{c.nav[0]}</Link></div></div><ul className="public-proof" aria-label={locale === "fr" ? "Bénéfices principaux" : "Key benefits"}>{c.proof.map((item) => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul></section>
    <section className="public-section" id="fonctionnement"><h2>{c.howTitle}</h2><div className="public-grid public-grid--three">{c.how.map(([step,title,text])=><article className="public-card" key={step}><span className="public-step">{step}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="public-section public-section--tint" id="benefices"><h2>{c.benefitsTitle}</h2><div className="public-grid public-grid--three">{c.benefits.map(([title,text])=><article className="public-card" key={title}><h3>{title}</h3><p>{text}</p></article>)}</div></section>
    <section className="public-section public-security" id="securite"><div><p className="eyebrow">KJORA</p><h2>{c.securityTitle}</h2><p>{c.security}</p></div><Link className="button button--secondary" href={`/securite?locale=${locale}`}>{c.nav[2]}</Link></section>
    <section className="public-section public-offer" id="offres"><div><h2>{c.offersTitle}</h2><p>{c.offers}</p></div><Link className="button button--primary" href={start}>{c.start}</Link></section>
    <section className="public-section" id="faq"><h2>{c.faqTitle}</h2><div className="public-faq">{c.faq.map(([question,answer])=><details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</div><div className="public-inline-links"><Link href={`/aide?locale=${locale}`}>{c.help}</Link><Link href={`/contact?locale=${locale}`}>{c.contact}</Link></div></section>
    <PublicFooter locale={locale} />
  </main>;
}
