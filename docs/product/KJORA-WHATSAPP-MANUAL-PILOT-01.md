# KJORA — WhatsApp manuel du pilote 01

Statut : **préparé localement, désactivé tant que la migration n'est pas validée et appliquée dans un environnement isolé**.

Le gestionnaire approuve un document puis choisit « Ouvrir WhatsApp ». KJORA résout côté serveur document, Organization, locataire, E.164 et consentement. La réponse ouvre `wa.me` avec un message FR/EN indiquant que le document est disponible dans le portail sécurisé. Aucun PDF privé n'est publié ou joint automatiquement.

L'utilisateur décide seul d'appuyer sur Envoyer. KJORA affiche qu'il ne peut confirmer l'envoi; seul `whatsapp_open_requested` est audité.

## États et consentements

- `unknown` : aucune déclaration;
- `declared` : usage déclaré, jamais une vérification;
- `verified` : preuve distincte future;
- `disabled` : canal désactivé, consentement retiré ou numéro remplacé.

Service et marketing sont séparés. Le marketing est désactivé par défaut. Source, version, date et retrait sont audités; l'Admin ne peut fabriquer un consentement.

## Refus serveur

Session ou capability absente, Organization inactive, autre Organization, document non prêt/approuvé, E.164 invalide, état inadéquat, consentement absent/retiré. Le client désactive aussi le bouton, sans remplacer les contrôles serveur.

## Limites

La collecte structurée Owner/partenaire attend une décision sur la source de vérité et le texte de consentement. Aucun appel Meta, webhook, modèle officiel, envoi, livraison ou lecture n'est testé. Replay SQL, pgTAP et navigateur authentifié restent obligatoires en Preview isolée.
