# KJORA — Roadmap de lancement privé

État de référence : lot `KJORA-PILOT-EXPERIENCE-AUTONOMOUS-02`, base `ded50c2c4b7f2f7a7c9c5f4f699b9c9514a5170b`.

## Faits vérifiés dans le dépôt

- Les accès Owner/collaborateur, locataire, partenaire et `platform_admin` sont séparés et gardés côté serveur.
- La PWA met seulement en cache des ressources publiques et exclut les espaces privés et les API.
- Stripe est limité au mode Test et désactivé par défaut. WhatsApp est une fondation désactivée.
- Resend et les automatismes restent conditionnés à des interrupteurs et secrets serveur.
- Les six devises immobilières actives sont XAF, XOF, NGN, CDF, KES et ZAR, sans conversion implicite.

## Gate 1 — pilote local reproductible

- Baseline, tests Node, TypeScript, ESLint et build reproductibles.
- Session existante réutilisée sans contourner OTP/Magic Link.
- Centre de contrôle Admin sans secret ni appel fournisseur au rendu.
- Simulation de fin de mois en lecture seule et parcours partenaires exploitable.
- Matrice navigateur et contrôle des liens internes disponibles.

## Gate 2 — Preview privée supervisée

- Appliquer les migrations sur une base Preview jetable, jamais directement en Production.
- Exécuter toute la suite pgTAP et le replay depuis zéro.
- Configurer uniquement les variables Preview listées dans le runbook.
- Tester chaque rôle avec des comptes éphémères distincts et nettoyer les données après revue.
- Garder Stripe Test, Resend contrôlé et WhatsApp désactivé.

## Gate 3 — décision de pilote

Décision humaine requise après revue navigateur, journaux et incidents. Les éléments suivants ne sont pas implicitement autorisés : fournisseurs Live, paiement réel, communication en masse, domaine/DNS, migration Production, publication publique ou promesse commerciale partenaire.

## Rollback préparé

1. Revenir au commit de base ou appliquer le patch inverse dans le clone isolé.
2. Désactiver les interrupteurs Preview de communication et Stripe Test.
3. Supprimer uniquement les comptes et données de fixture identifiables créés pour la Preview.
4. Si la migration de prévisualisation a été appliquée en Preview, révoquer puis supprimer uniquement `public.preview_africa_month_end(uuid,date)` dans cette base isolée.
5. Ne jamais utiliser `db reset` ou ce rollback contre un environnement contenant des données réelles.

## Décisions différées

- Validation juridique des communications et des conditions partenaires.
- Activation d'un fournisseur de paiement ou de communication réel.
- Critères de passage du pilote privé vers un lancement public.
