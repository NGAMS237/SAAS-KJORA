# KJORA — WhatsApp manuel du pilote 01

Statut : **préparé localement, désactivé tant que la migration n'est pas validée et appliquée dans un environnement isolé**.

Le gestionnaire approuve un document puis choisit « Ouvrir WhatsApp ». KJORA résout côté serveur document, Organization, locataire, E.164 et consentement. La réponse ouvre `wa.me` avec un message FR/EN indiquant que le document est disponible dans le portail sécurisé. Aucun PDF privé n'est publié ou joint automatiquement.

L'utilisateur décide seul d'appuyer sur Envoyer. KJORA affiche qu'il ne peut confirmer l'envoi; seul `whatsapp_open_requested` est audité.

## États et consentements

- `unknown` : aucune déclaration;
- `declared` : usage déclaré, jamais une vérification;
- `tenant_confirmed` : le locataire reconnaît le numéro depuis son portail; ce n'est pas une preuve OTP;
- `verified` : preuve distincte future par OTP ou fournisseur officiel;
- `disabled` : canal désactivé, consentement retiré ou numéro remplacé.

Service et marketing sont séparés. Le marketing est désactivé par défaut et seul le locataire peut l'accepter pour son dossier; un bailleur ne peut jamais le faire à sa place. Source, version, date et retrait sont audités; l'Admin ne peut fabriquer un consentement.

Le catalogue fermé comprend CA, CM, SN, CI, BJ, BF, GW, ML, NE, TG, NG, CD, KE et ZA. Pays, indicatif, longueur nationale et E.164 doivent correspondre exactement; le numéro national commence par 1–9 et ne contient que des chiffres. Les journaux de consentement ne stockent ni numéro ni empreinte dérivée.

## Refus serveur

Session ou capability absente, Organization inactive, autre Organization, document non prêt/approuvé, E.164 invalide, état inadéquat, consentement absent/retiré. Le client désactive aussi le bouton, sans remplacer les contrôles serveur.

## Limites

Owner et partenaire disposent d'une préférence personnelle séparée des données locatives et de toute autorisation métier; le formulaire de candidature conserve sa propre préférence. Ces numéros ne sont jamais une preuve d'identité ou de rôle. Aucun appel Meta, webhook, modèle officiel, envoi, livraison ou lecture n'est testé. Replay SQL, pgTAP et navigateur authentifié restent obligatoires en Preview isolée.
