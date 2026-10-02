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

La migration additive `20261002120000_pilot_resilience_whatsapp_manual_04.sql` étend la préférence locataire existante; elle ne crée pas une seconde file. Elle distingue strictement le numéro enregistré, les états `unknown`, `declared`, `verified`, `disabled`, les consentements WhatsApp de service et marketing, l'ouverture manuelle, l'envoi API officiel, la livraison et la lecture fournisseur.

« Ouvrir WhatsApp » exige un document `ready` approuvé, `receipt.share`, une Organization active, un numéro `declared` ou `verified` et un consentement de service non retiré. Le navigateur fournit seulement l'identifiant du document. La RPC journalise `whatsapp_open_requested` avec une empreinte, jamais `sent`, `delivered` ou `read`. Le PDF privé doit être téléchargé et joint manuellement.

Un changement de numéro annule l'état `verified`. L'historique append-only conserve une empreinte SHA-256, pas le numéro en clair; aucune unicité globale n'est imposée. Les profils Owner et partenaire conservent leurs sources historiques : leur collecte WhatsApp structurée attend la validation du texte de consentement et de la responsabilité de saisie.

### Future Meta Cloud API — toujours désactivée

Une activation ultérieure exigera Meta Business, WABA, numéro KJORA, jeton serveur, identifiant de numéro, secret webhook, modèles FR/EN approuvés, idempotence, supervision, tarification applicable et kill switch. Noms seulement : `META_WHATSAPP_ACCESS_TOKEN`, `META_WHATSAPP_PHONE_NUMBER_ID`, `META_WHATSAPP_WEBHOOK_SECRET`, `KJORA_WHATSAPP_PROVIDER_ENABLED`. Aucun palier gratuit permanent n'est présumé.
