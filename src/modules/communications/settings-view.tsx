"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Mail, Send } from "lucide-react";
import { usePreferences } from "@/core/preferences/preferences-provider";
import { Card, PageHeader } from "@/core/ui/ui";
import { saveCommunicationSettingsAction, sendCommunicationTestAction } from "@/modules/communications/settings-actions";
import {
  COMMUNICATION_TOGGLES,
  communicationSettingsMessage,
  type CommunicationSettings,
  type CommunicationToggle,
  type CommunicationToggleValues,
} from "@/modules/communications/settings-model";

const LABELS: Record<CommunicationToggle, { title: [string, string]; help: [string, string] }> = {
  dueNoticeEmailEnabled: {
    title: ["Avis d’échéance", "Due notices"],
    help: ["Envoyé au locataire le jour prévu de l’avis. Un avis rattrapé en retard n’est jamais envoyé automatiquement.", "Sent to the tenant on the scheduled notice date. A late catch-up notice is never sent automatically."],
  },
  overdueReminderEmailEnabled: {
    title: ["Rappels de retard", "Overdue reminders"],
    help: ["Envoyés au locataire aux dates de relance d’une échéance impayée.", "Sent to the tenant on the reminder dates of an unpaid due."],
  },
  paymentReceiptEmailEnabled: {
    title: ["Reçus de paiement", "Payment receipts"],
    help: ["Envoyés au locataire après chaque paiement confirmé.", "Sent to the tenant after each confirmed payment."],
  },
  rentReceiptEmailEnabled: {
    title: ["Quittances de loyer", "Rent receipts"],
    help: ["Envoyées au locataire lorsqu’une période est intégralement soldée.", "Sent to the tenant when a period is fully settled."],
  },
  ownerCopyEnabled: {
    title: ["Copie au propriétaire", "Owner copy"],
    help: ["Vous recevez une copie de chaque document envoyé automatiquement.", "You receive a copy of each automatically sent document."],
  },
};

export function CommunicationSettingsView({ settings, emailOperational, senderAddress, testAvailable }: {
  settings: CommunicationSettings;
  emailOperational: boolean;
  senderAddress: string | null;
  testAvailable: boolean;
}) {
  const { language } = usePreferences();
  const lang = language === "FR" ? "FR" : "EN";
  const t = (fr: string, en: string) => lang === "FR" ? fr : en;
  const router = useRouter();
  const [values, setValues] = useState<CommunicationToggleValues>(() => Object.fromEntries(
    COMMUNICATION_TOGGLES.map((key) => [key, settings[key]]),
  ) as CommunicationToggleValues);
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function save() {
    setBusy("save"); setFeedback(null);
    const result = await saveCommunicationSettingsAction(values);
    setBusy(null);
    if (!result.ok) { setFeedback({ tone: "error", text: communicationSettingsMessage(result.error, lang) }); return; }
    setFeedback({ tone: "success", text: t("Réglages enregistrés.", "Settings saved.") });
    router.refresh();
  }

  async function test() {
    setBusy("test"); setFeedback(null);
    const result = await sendCommunicationTestAction();
    setBusy(null);
    setFeedback(result.ok
      ? { tone: "success", text: t("Test accepté par le fournisseur (adresse de simulation, aucun destinataire réel).", "Test accepted by the provider (simulated address, no real recipient).") }
      : { tone: "error", text: communicationSettingsMessage(result.error, lang) });
  }

  return <div className="page-stack settings-v2">
    <Link className="demo-back" href="/app/parametres"><ArrowLeft aria-hidden="true" size={16} />{t("Paramètres", "Settings")}</Link>
    <PageHeader
      eyebrow={t("Communications", "Communications")}
      title={t("Courriels automatiques", "Automatic emails")}
      description={t("Courriels transactionnels envoyés à vos locataires. Jamais de message promotionnel.", "Transactional emails sent to your tenants. Never promotional messages.")}
    />
    <Card className="settings-card">
      <div className="section-heading"><div><p className="eyebrow">{t("Expéditeur", "Sender")}</p><h2>{senderAddress ?? t("Non configuré", "Not configured")}</h2>
        <p>{emailOperational
          ? t("Les documents partent en pièce jointe PDF depuis cette adresse. Aucun lien public vers vos documents.", "Documents are sent as PDF attachments from this address. No public link to your documents.")
          : t("L’envoi n’est pas encore configuré sur cet environnement. Les réglages restent désactivés jusqu’à sa configuration.", "Delivery is not configured on this environment yet. Settings stay disabled until it is.")}</p>
      </div><Mail aria-hidden="true" size={22} /></div>
      {!settings.ownerEmailDeliverable ? <p className="form-feedback form-feedback--error">{t("L’adresse de votre compte n’est pas utilisable pour la copie propriétaire.", "Your account address cannot be used for the owner copy.")}</p> : null}
      {settings.tenantsWithoutEmail > 0 ? <p className="form-feedback">{t(`${settings.tenantsWithoutEmail} locataire(s) sans adresse valide ne recevront rien par courriel.`, `${settings.tenantsWithoutEmail} tenant(s) without a valid address will receive nothing by email.`)}</p> : null}
    </Card>
    <Card className="settings-card">
      <fieldset className="communication-toggles" disabled={!emailOperational || busy !== null}>
        <legend className="sr-only">{t("Courriels automatiques", "Automatic emails")}</legend>
        {COMMUNICATION_TOGGLES.map((key) => <label className="communication-toggle" key={key}>
          <input checked={values[key]} onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.checked }))} type="checkbox" />
          <span><strong>{t(...LABELS[key].title)}</strong><small>{t(...LABELS[key].help)}</small></span>
        </label>)}
      </fieldset>
      <div className="demo-form-actions">
        {testAvailable ? <button className="button button--secondary" disabled={!emailOperational || busy !== null} onClick={test} type="button"><Send aria-hidden="true" size={15} />{busy === "test" ? t("Test…", "Testing…") : t("Tester la configuration", "Test configuration")}</button> : null}
        <button className="button button--primary" disabled={!emailOperational || busy !== null} onClick={save} type="button">{busy === "save" ? t("Enregistrement…", "Saving…") : t("Enregistrer", "Save")}</button>
      </div>
      {feedback ? <p className={`form-feedback${feedback.tone === "error" ? " form-feedback--error" : " form-feedback--success"}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.text}</p> : null}
      {!settings.configured ? <small>{t("Aucun réglage enregistré : aucun courriel automatique n’est envoyé.", "No settings saved: no automatic email is sent.")}</small> : null}
    </Card>
  </div>;
}
