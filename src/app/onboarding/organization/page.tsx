import { redirect } from "next/navigation";
import { OrganizationOnboardingForm } from "@/core/organization/organization-onboarding-form";
import { loadOrganizationContext } from "@/core/organization/load-organization-context";

export default async function OrganizationOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  const context = await loadOrganizationContext();
  const { mode } = await searchParams;
  if (context.organizations.length > 0 && mode !== "new") redirect("/app");

  return (
    <main className="auth-page">
      <section className="auth-panel auth-panel--wide">
        <span className="wordmark wordmark--auth">Kjora<span>.</span></span>
        <p className="eyebrow">Première configuration</p>
        <h1>Créez votre espace de gestion.</h1>
        <p className="auth-intro">Commencez avec l’essentiel. Le profil pourra être complété quand une action l’exigera.</p>
        <OrganizationOnboardingForm />
      </section>
    </main>
  );
}
