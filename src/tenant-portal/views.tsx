import Link from "next/link";
import { CalendarDays, ChevronRight, CreditCard, Download, Home, ReceiptText, ShieldCheck, WalletCards } from "lucide-react";
import { Badge, Card, EmptyState, PageHeader } from "@/core/ui/ui";
import { NotificationSoundToggle } from "@/core/notifications/notification-sound";
import { PinSecurityPanel } from "@/core/security/pin-controls";
import type { PortalDocument, PortalDue, PortalHome, PortalLease, PortalPayment } from "@/tenant-portal/model";
import { PortalWhatsAppPreferences } from "@/tenant-portal/whatsapp-preferences";

type Language = "fr" | "en";
const copy = (language: Language, fr: string, en: string) => language === "en" ? en : fr;
const money = (value: number, currency = "XAF") => `${new Intl.NumberFormat("fr-FR").format(value)} ${currency}`;
const date = (value: string, language: Language) => new Intl.DateTimeFormat(language === "en" ? "en-GB" : "fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${value}T00:00:00`));

function status(value: string, language: Language) {
  const labels: Record<string, [string, string, "success" | "warning" | "danger" | "neutral"]> = {
    upcoming: ["À venir", "Upcoming", "neutral"], due: ["À payer", "Due", "warning"],
    partially_paid: ["Partiellement payé", "Partially paid", "warning"], paid: ["Payé", "Paid", "success"],
    covered: ["Payé", "Paid", "success"], overdue: ["En retard", "Overdue", "danger"],
    confirmed: ["Confirmé", "Confirmed", "success"], reversed: ["Annulé par correction", "Reversed", "danger"],
    active: ["Active", "Active", "success"], ended: ["Historique", "History", "neutral"],
    ready: ["Disponible", "Available", "success"], prepared: ["Disponible", "Available", "success"],
    invalidated: ["Invalidé", "Invalidated", "danger"],
  };
  const item = labels[value] ?? [value, value, "neutral"];
  return <Badge tone={item[2]}>{item[language === "en" ? 1 : 0]}</Badge>;
}

function selectedLease(home: PortalHome, requested?: string) {
  return home.leases.find((lease) => lease.id === requested)
    ?? home.leases.find((lease) => lease.status === "active")
    ?? home.leases[0]
    ?? null;
}

export function PortalLeaseSelector({ home, language, selected, destination = "/portal" }: { home: PortalHome; language: Language; selected: PortalLease | null; destination?: string }) {
  if (home.leases.length < 2) return null;
  return <Card className="portal-lease-selector"><span>{copy(language, "Location affichée", "Selected lease")}</span><div>
    {home.leases.map((lease) => <Link className={lease.id === selected?.id ? "is-active" : ""} href={`${destination}?lease=${lease.id}`} key={lease.id}>{lease.unitLabel}<small>{lease.propertyName}</small></Link>)}
  </div></Card>;
}

export function PortalHomeView({ home, language, requestedLease }: { home: PortalHome; language: Language; requestedLease?: string }) {
  const lease = selectedLease(home, requestedLease);
  if (!lease) return <div className="page-stack portal-page"><PageHeader eyebrow={copy(language, "Espace locataire", "Tenant space")} title={copy(language, "Bienvenue", "Welcome")} description={home.organizationName} /><Card><EmptyState icon={Home} title={copy(language, "Aucune location autorisée", "No authorized lease")} description={copy(language, "Contactez votre gestionnaire si une location devrait apparaître.", "Contact your manager if a lease should appear.")} /></Card></div>;
  const next = lease.nextDue;
  return <div className="page-stack portal-page">
    <PageHeader eyebrow={copy(language, "Mon espace", "My space")} title={copy(language, `Bienvenue, ${home.tenantName}`, `Welcome, ${home.tenantName}`)} description={`${lease.propertyName} · ${lease.unitLabel}`} />
    <PortalLeaseSelector home={home} language={language} selected={lease} />
    <Card className="portal-balance-card signature-surface signature-surface--left">
      <p className="eyebrow">{copy(language, "Solde actuel", "Current balance")}</p>
      <div className="portal-balance-card__amount"><strong>{money(next?.remainingXaf ?? 0, home.currencyCode)}</strong><span>{copy(language, "restant à payer", "remaining to pay")}</span></div>
      <p className="portal-balance-card__deadline">{next ? copy(language, `À régler avant le ${date(next.dueDate, language)}`, `Due by ${date(next.dueDate, language)}`) : copy(language, "Aucune échéance à régler", "No payment due")}</p>
      {next ? status(next.status, language) : <Badge tone="success">{copy(language, "À jour", "Up to date")}</Badge>}
    </Card>
    <div className="kpi-grid kpi-grid--portal">
      <Card><span>{copy(language, "Total", "Total")}</span><strong className="financial-value">{money(next?.totalXaf ?? 0, home.currencyCode)}</strong></Card>
      <Card><span>{copy(language, "Crédit appliqué", "Credit applied")}</span><strong className="financial-value">{money(next?.creditAppliedXaf ?? 0, home.currencyCode)}</strong></Card>
      <Card><span>{copy(language, "Paiements reçus", "Payments received")}</span><strong className="financial-value">{money(next?.paymentsReceivedXaf ?? 0, home.currencyCode)}</strong></Card>
      <Card><span>{copy(language, "Crédit disponible", "Available credit")}</span><strong className="financial-value">{money(home.availableCreditXaf, home.currencyCode)}</strong></Card>
    </div>
    <Card className="portal-home-card"><span className="portal-home-card__icon"><Home size={22} /></span><div><p className="eyebrow">{copy(language, lease.status === "active" ? "Mon logement" : "Ancienne location", lease.status === "active" ? "My home" : "Past lease")}</p><h2>{lease.unitLabel}</h2><p>{lease.propertyName} · {lease.propertyLocality}</p></div>{status(lease.status, language)}<Link className="button button--secondary" href={`/portal/loyers?lease=${lease.id}`}>{copy(language, "Voir mes loyers", "View rent")}<ChevronRight size={16} /></Link></Card>
  </div>;
}

export function PortalDuesView({ dues, home, language, lease }: { dues: PortalDue[]; home: PortalHome; language: Language; lease: PortalLease }) {
  return <div className="page-stack portal-page"><PageHeader eyebrow={copy(language, "Lecture seule", "Read only")} title={copy(language, "Mes loyers", "My rent")} description={`${lease.propertyName} · ${lease.unitLabel}`} />
    <PortalLeaseSelector destination="/portal/loyers" home={home} language={language} selected={lease} />
    {dues.length ? <div className="portal-due-list">{dues.map((due) => <Card className="portal-due-card" key={due.dueId}><div className="section-heading"><div><p className="eyebrow">{due.kind === "deposit" ? copy(language, "Dépôt de garantie", "Security deposit") : `${date(due.periodStart, language)} — ${date(due.periodEnd, language)}`}</p><h2>{money(due.totalXaf, home.currencyCode)}</h2></div>{status(due.status, language)}</div><dl className="portal-breakdown"><div><dt>{copy(language, "Crédit appliqué", "Credit applied")}</dt><dd>{money(due.creditAppliedXaf, home.currencyCode)}</dd></div><div><dt>{copy(language, "Paiements reçus", "Payments received")}</dt><dd>{money(due.paymentsReceivedXaf, home.currencyCode)}</dd></div><div><dt>{copy(language, "Reste dû", "Remaining")}</dt><dd>{money(due.remainingXaf, home.currencyCode)}</dd></div></dl><small>{copy(language, `Date limite : ${date(due.dueDate, language)}`, `Due date: ${date(due.dueDate, language)}`)}</small></Card>)}</div> : <Card><EmptyState icon={CalendarDays} title={copy(language, "Aucune échéance", "No due")} description={copy(language, "Aucune échéance n’est disponible pour cette location.", "No due is available for this lease.")} /></Card>}
  </div>;
}

export function PortalPaymentsView({ home, language, payments }: { home: PortalHome; language: Language; payments: PortalPayment[] }) {
  return <Card className="portal-payments-card"><div className="section-heading"><div><p className="eyebrow">{copy(language, "Historique", "History")}</p><h2>{copy(language, "Mes paiements", "My payments")}</h2></div><WalletCards size={21} /></div>{payments.length ? <div className="demo-list">{payments.map((payment) => <div className="demo-list-row" key={payment.paymentId}><span className="demo-list-row__icon"><CreditCard size={18} /></span><div><strong>{money(payment.amountXaf, home.currencyCode)}</strong><span>{date(payment.paymentDate, language)} · {payment.reference}</span><small>{copy(language, "Montant réellement reçu", "Amount actually received")}</small></div>{status(payment.status, language)}</div>)}</div> : <EmptyState icon={WalletCards} title={copy(language, "Aucun paiement", "No payment")} description={copy(language, "Aucun paiement confirmé n’est disponible.", "No confirmed payment is available.")} />}</Card>;
}

export function PortalDocumentsView({ documents, home, language, lease }: { documents: PortalDocument[]; home: PortalHome; language: Language; lease: PortalLease }) {
  return <div className="page-stack portal-page"><PageHeader eyebrow={copy(language, "Documents privés", "Private documents")} title={copy(language, "Mes reçus", "My receipts")} description={copy(language, "Aucun lien public permanent n’est créé.", "No permanent public link is created.")} /><PortalLeaseSelector destination="/portal/recus" home={home} language={language} selected={lease} />{documents.length ? <div className="portal-document-list">{documents.map((document) => <Card className="portal-document-card" key={document.documentId}><span className="demo-list-row__icon"><ReceiptText size={19} /></span><div><strong>{document.documentType === "payment_receipt" ? copy(language, "Reçu de paiement", "Payment receipt") : document.documentType === "rent_receipt" ? copy(language, "Quittance", "Rent receipt") : copy(language, "Avis d’échéance", "Due notice")}</strong><span>{document.reference} · {date(document.issuedOn, language)}</span></div>{status(document.status, language)}{document.status !== "invalidated" ? <a className="button button--secondary" href={`/api/tenant-portal/documents/${document.documentId}/download`} target="_blank"><Download size={16} />{copy(language, "Télécharger", "Download")}</a> : null}</Card>)}</div> : <Card><EmptyState icon={ReceiptText} title={copy(language, "Aucun document", "No document")} description={copy(language, "Les reçus et quittances autorisés apparaîtront ici.", "Authorized receipts will appear here.")} /></Card>}</div>;
}

export function PortalAccountView({ accessId, home, language }: { accessId: string; home: PortalHome; language: Language }) {
  return <div className="page-stack portal-page"><PageHeader eyebrow={copy(language, "Compte portail", "Portal account")} title={copy(language, "Mon compte", "My account")} description={copy(language, "Cet accès est distinct des membres internes de l’Organization.", "This access is separate from internal Organization members.")} />
    <Card><div className="section-heading"><div><p className="eyebrow">{copy(language, "Identité / contact", "Identity / contact")}</p><h2>{home.tenantName}</h2></div><ShieldCheck size={21} /></div><dl className="record-detail-list"><div><dt>Email</dt><dd>{home.email ?? "—"}</dd></div><div><dt>{copy(language, "Téléphone", "Phone")}</dt><dd>{home.phone ?? "—"}</dd></div></dl></Card>
    <Card><div className="section-heading"><div><p className="eyebrow">{copy(language, "Sécurité / appareil", "Security / device")}</p><h2>{copy(language, "Session protégée", "Protected session")}</h2></div><ShieldCheck size={21} /></div><p>{copy(language, "Votre accès reste actif. Pour votre sécurité, KJORA peut parfois vous demander de vous reconnecter. Le PIN local facultatif verrouille seulement cet appareil.", "Your access remains active. For security, KJORA may occasionally ask you to sign in again. The optional local PIN only locks this device.")}</p></Card>
    <Card><div className="section-heading"><div><p className="eyebrow">WhatsApp</p><h2>{copy(language,"Préférences de service","Service preferences")}</h2></div></div><PortalWhatsAppPreferences accessId={accessId} hasPhone={Boolean(home.phone)} language={language}/></Card>
    <Card><PinSecurityPanel language={language} /></Card>
    <Card><NotificationSoundToggle language={language} /></Card>
  </div>;
}

export { selectedLease };
