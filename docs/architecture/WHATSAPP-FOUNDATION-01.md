# Fondation WhatsApp officielle

Statut : **désactivée**. KJORA reste pleinement utilisable sans fournisseur.

La fondation conserve un numéro E.164, l'indication distincte d'acceptation de
WhatsApp, un canal préféré et deux consentements indépendants (transactionnel
et marketing). Les modèles FR/EN sont versionnés. La file WhatsApp est séparée
de l'email et ne stocke qu'une empreinte du destinataire, jamais le numéro ni le
contenu rendu.

Seul un futur adaptateur d'une API WhatsApp officielle pourra remplacer
`disabled`. WhatsApp Web, le scraping et les API non officielles sont exclus.
Les variables futures sont documentées par leur nom dans `.env.example` sans
valeur. Aucun lien privé permanent n'est créé dans ce lot.

## Extension pilote manuelle — lot 04

La migration additive `20261002120000_pilot_resilience_whatsapp_manual_04.sql` étend la préférence locataire existante; elle ne crée pas une seconde file. Elle distingue strictement `unknown`, `declared`, `tenant_confirmed`, `verified` et `disabled`. Un clic portail ne peut produire que `tenant_confirmed`; `verified` reste réservé à une future preuve OTP ou fournisseur.

« Ouvrir WhatsApp » exige explicitement `status = ready` et `review_status = approved`, `receipt.share`, une Organization active, un numéro admissible et un consentement service non retiré. `NULL`, pending, rejected, refused ou tout autre état ne sont jamais assimilés à approved. Le navigateur fournit seulement l'identifiant du document. La RPC journalise l'ouverture sans numéro ni empreinte, jamais `sent`, `delivered` ou `read`. La réponse portant `phoneE164` et l'URL `wa.me` est `private, no-store`.

La validation s'appuie sur un catalogue fermé de 14 pays partagé avec l'application. Un changement de numéro annule `tenant_confirmed` et `verified` et ne restaure aucun consentement révoqué. Les premières sauvegardes concurrentes sont sérialisées par verrou transactionnel. Les historiques append-only ne conservent ni numéro ni empreinte; aucune unicité globale n'est imposée.

Les préférences personnelles Owner/partenaire sont séparées du dossier locataire et ne donnent aucun rôle. La candidature partenaire possède sa propre préférence. Le bailleur peut enregistrer une déclaration et le consentement de service du locataire, mais toute tentative de créer son consentement marketing est refusée. Le marketing locataire n'est accepté que par action directe du portail.

### Future Meta Cloud API — toujours désactivée

Une activation ultérieure exigera Meta Business, WABA, numéro KJORA, jeton serveur, identifiant de numéro, secret webhook, modèles FR/EN approuvés, idempotence, supervision, tarification applicable et kill switch. Noms seulement : `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WEBHOOK_SECRET`, `KJORA_WHATSAPP_PROVIDER_ENABLED`. Aucun palier gratuit permanent n'est présumé.
