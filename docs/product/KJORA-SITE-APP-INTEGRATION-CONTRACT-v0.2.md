# KJORA — Contrat Site → App v0.2

Ce contrat couvre SITE-APP-FLOW-01, 01.1 et la revue 01.2. Une URL commerciale exprime une
intention non fiable; elle ne constitue jamais une identité, un entitlement,
un ordre de paiement ni une source de prix.

## URL canonique

```text
https://app.kjora.kjemostudios.com/?plan=<slug>&billing_cycle=<cycle>&locale=<locale>&source=<source>
```

Valeurs allowlistées côté serveur :

- `plan`: `decouverte`, `essentiel`, `avance`, `patrimoine`, `sur_mesure`;
- `billing_cycle`: `monthly`, `annual`;
- `locale`: `fr`, `en` (repli sûr `fr`);
- `source`: `site` uniquement.

`billing_country=CA|CM` peut être transporté comme pré-sélection, mais le pays
est présenté et confirmé dans l’onboarding ou Billing. Aucune valeur `currency`
de l’URL n’est lue. Les anciens liens `plan_requested` restent compris pour les
signets existants; les nouveaux liens utilisent `plan`.

## Deux devises indépendantes

- `organization_profiles.currency_code` décrit les opérations immobilières.
  Le pilote Cameroun conserve `XAF`, y compris si l’Owner paie KJORA au Canada.
- `organization_subscriptions.billing_country` décrit le marché de facturation
  SaaS. Le serveur dérive exclusivement `CA → CAD` et `CM → XAF`.

Le navigateur envoie un pays contrôlé, jamais une devise libre. Un abonnement
payant existant ne change pas de marché automatiquement; le pilote renvoie une
demande de traitement par support. Un abonnement gratuit peut adopter le pays
confirmé avant la préparation du plan.

## Persistance et remplacement

Après authentification, `onboarding_states` conserve `plan_intent`,
`billing_cycle_intent`, `billing_country_intent`, `locale_intent`,
`source_intent` et `intent_status`. L’intention reste reprenable après fermeture
du navigateur; elle n’accorde aucun droit et ne modifie jamais
`organization_plans`.

Règle de priorité :

1. un nouveau lien contenant un `plan` et un `billing_cycle` valides remplace
   l’ancien choix;
2. si ce lien ne contient pas de pays, l’ancien pays n’est pas hérité : KJORA
   exige un nouveau choix explicite;
3. un lien partiel ou invalide ne peut pas effacer une intention durable;
4. après authentification, le RPC `replace_site_app_intent` remplace
   atomiquement l’ensemble dès que plan et cycle sont valides; le pays peut
   valoir `NULL` uniquement pour représenter le choix explicite encore attendu;
5. toute valeur pays non nulle hors `CA|CM` est refusée;
6. la préparation Billing marque l’intention `prepared`, sans activation.

## Parcours

1. KJORA valide l’intention et résout Auth/Organization côté serveur.
2. Le visiteur passe par Magic Link ou OTP PKCE et conserve le contexte.
3. L’onboarding demande le cycle et le pays de facturation, tout en affichant
   séparément le marché immobilier Cameroun et la devise de loyers XAF.
4. Découverte ouvre `/app` gratuitement, sans carte.
5. Un plan self-service arrive sur `/app/billing`; la confirmation ne fait
   qu’enregistrer une intention existante. Aucun Checkout Stripe n’est lancé.
6. `sur_mesure` part vers le contact commercial.

Le nouveau parcours commercial est traduit en français et en anglais. Cette
garantie ne prétend pas rendre bilingues toutes les surfaces historiques.

## Données refusées depuis l’URL

Montant, devise, rôle, capability, Price Stripe, identifiant User, identifiant
Organization, état d’abonnement et activation sont ignorés. L’Organization
active provient de l’appartenance et du contexte serveur.

## Migration additive non appliquée

`20260911210927_site_app_flow_canada_intent.sql` ajoute les champs d’intention,
le pays SaaS et trois RPC bornés. Les entrées requises refusent explicitement
SQL `NULL`; la préparation Billing sérialise la première création d’abonnement
sur la ligne Organization. Les Organizations existantes sont préservées :
les abonnements CAD existants deviennent CA, les autres CM; XAF est le défaut
compatible avec l’existant. Avant application future : sauvegarder le schéma et
les tables touchées, vérifier l’historique des migrations, exécuter en Preview,
tester le backfill et les contraintes, puis seulement demander une autorisation
Production. Cette migration n’est pas appliquée par ce lot.
