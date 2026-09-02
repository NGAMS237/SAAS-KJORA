# KJORA — Contrats, modèles, signatures et cachet v0.1

> Lot 6F — architecture locale au 2 septembre 2026. Cette version n’est ni migrée ni déployée. Elle ne constitue pas un avis juridique.

## 1. Portée

Le contrat est un document facultatif rattaché à une `Lease` existante. Il ne crée pas la location, ne remplace aucune vérité métier et ne bloque jamais la création ou l’activation du bail. Le parcours cible est :

`Lease → modèle → brouillon → aperçu → validation → signature bailleur → envoi portail → signature locataire → PDF final immuable`.

Hors périmètre : signature qualifiée/certifiée, fournisseur payant, validation juridique automatique, paiement en ligne, SMS/Phone OTP, chat et moteur complexe d’avenants.

## 2. Modèle

| Entité | Responsabilité | Isolation / immutabilité |
|---|---|---|
| `contract_templates` | Modèles système ou Organization, langue, famille, version, sections déclaratives | Système global en lecture via RPC ; modèle Organization tenant-scoped ; anciennes versions conservées |
| `organization_contract_settings` | Cachet graphique activé, identité courte et position contrôlée | Une ligne par Organization ; `contract.manage` |
| `lease_contracts` | Snapshot du modèle, des données et du contenu ; état ; références du PDF final | Organization + Lease + Tenant ; transitions formelles ; final/cancelled immuable |
| `contract_signatures` | Partie, `auth.uid()`, méthode, consentement, horodatage, hash et trace | Append-only ; jamais modifiable ou supprimable |
| `contract_amendments` | Point d’extension minimal pour un futur avenant | Aucun moteur d’avenant dans 6F |

`Lease`, `Tenant`, `Property`, `Unit` et `Organization Profile` restent les sources de vérité. Le contrat en capture un snapshot au moment de la génération afin de préserver la preuve documentaire ; il ne devient pas une copie métier active.

## 3. Modèles contrôlés

Un modèle est une liste ordonnée de sections `{ key, title, condition, body }`. Les variables autorisées sont explicitement bornées aux données Organization, bailleur, Tenant, Property, Unit et Lease. Les conditions autorisées sont : toujours, dépôt positif, charges positives, date de fin présente et modalités de paiement présentes.

Aucun JavaScript, SQL, expression arbitraire, HTML libre ou variable inconnue n’est accepté. Une modification d’un modèle Organization crée une nouvelle version. Le contrat généré conserve `template_id`, `template_version`, `template_snapshot`, `data_snapshot` et `content_snapshot`.

## 4. Signature et preuve

Méthodes MVP :

- tracé au doigt ou à la souris ;
- nom ou initiales stylisés.

La preuve ne repose jamais sur l’image seule. Elle associe l’identité Supabase authentifiée, la partie (`owner`/`tenant`), l’accès portail s’il s’agit du locataire, l’heure serveur, la méthode, le texte/code de consentement et le SHA-256 du contenu exact. Le PIN local ne signe rien, ne crée aucune session et n’intervient pas dans la preuve.

Le cachet est un rendu graphique facultatif comportant des informations Organization contrôlées et une référence KJORA. Il ne constitue ni un certificat ni une signature qualifiée.

## 5. États et transitions

| État | Sens | Transition suivante |
|---|---|---|
| `draft` | Snapshot généré, non validé | `ready` ou `cancelled` |
| `ready` | Aperçu validé et hashé | `owner_signed` ou `cancelled` |
| `owner_signed` | Signature bailleur enregistrée | `sent` ou `cancelled` |
| `sent` | Visible par l’accès portail exact | `tenant_signed` ou `cancelled` |
| `tenant_signed` | Deux preuves disponibles | `completed` ou `cancelled` |
| `completed` | PDF final privé matérialisé | aucune |
| `cancelled` | Arrêt motivé avant finalisation | aucune |

Un trigger refuse les retours d’état, la mutation des snapshots et toute modification d’un contrat finalisé ou annulé.

## 6. Frontières d’accès

- Interne : `contract.manage`, Organization active et UUID exact du contrat/Lease.
- Portail : session Supabase valide, `TenantPortalAccess` actif, session portail non expirée et lien explicite Organization + Access + Tenant + Lease.
- `PUBLIC` et `anon` : aucune RPC et aucune table 6F.
- Tables : RLS activée et aucun accès direct `authenticated`; seules des RPC étroites exposent les projections nécessaires.
- Storage : bucket `contract-documents` privé, PDF uniquement, 10 Mio maximum, chemin `{organization_id}/{contract_id}/v1/final.pdf`, URL signée 120 secondes.

Connaître un UUID ou un chemin ne confère aucun droit. Une révocation de `TenantPortalAccess` invalide immédiatement les projections et la création d’URL signée.

## 7. PDF final

Le renderer réutilise `pdf-lib` et les conventions 6C3 : A4, normalisation typographique, identité KJORA, pages déterministes et stockage privé. Il inclut référence, parties, sections contractuelles, cachet activé, méthodes/horodatages des signatures et empreinte du contenu. La finalisation enregistre le chemin, le hash du PDF et sa taille dans une seule transition contrôlée.

## 8. Notifications, audit et communications

L’envoi crée une notification portail `contract_ready`; la finalisation crée `contract_completed`. Elles réutilisent la table Notification existante et restent adressées à un `TenantPortalAccess`. Les événements d’audit sont : generated, validated, owner_signed, sent, tenant_viewed, tenant_signed, finalized et cancelled.

Aucun email financier n’est activé. Aucun token, dessin de signature, contenu du contrat ou URL signée n’entre dans les logs/audits. Une communication transactionnelle de contrat pourra être ajoutée ultérieurement sur l’infrastructure existante sans coupler la transaction métier à l’email.

## 9. Tests et Gate Production

La suite Node couvre registre de capability, variables contrôlées, clauses conditionnelles, hash stable, transitions, consentement, routes contextualisées, RLS/default-deny, immutabilité, Storage privé et absence de provider/email/public. Le fixture `rls_contracts_signatures.test.sql` prépare 43 assertions transactionnelles couvrant Owner/Gestionnaire/Viewer, Organization A/B, Tenant A/B, UUID direct, cycle complet, hash, révocation, audit et bucket privé.

À exécuter avant toute autorisation Production : migration sur une base Supabase locale/éphémère, 43/43 pgTAP, régressions pgTAP antérieures, Advisors sécurité/performance, puis contrôle de l’absence de lignes fixture après rollback.

## 10. Gate actuel

- TypeScript, ESLint, tests Node et build : réussis localement.
- pgTAP 6F : préparé mais non exécuté, car le poste ne dispose ni de Docker Desktop ni de Podman.
- Production, Git et Vercel : aucune action 6F.
- Validation juridique des modèles : responsabilité de l’Organization ; KJORA fournit une structure personnalisable et une preuve technique simple, pas un conseil juridique.
