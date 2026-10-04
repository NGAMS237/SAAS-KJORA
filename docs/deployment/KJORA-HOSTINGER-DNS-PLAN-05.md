# KJORA — Plan DNS Hostinger (préparation uniquement)

Ce document ne constitue pas une autorisation de modifier le DNS.

## Cible

| Nom | Usage | Action future supervisée |
|---|---|---|
| `kjorapp.com` | site public et application Next.js KJORA, même produit et même déploiement | Rattacher au projet Node.js Hostinger avec la valeur A/AAAA ou CNAME fournie par hPanel. |
| `www.kjorapp.com` | alias public | Rediriger en HTTPS 301 vers `https://kjorapp.com`, en conservant chemin et paramètres. |
| `mail.kjorapp.com` | expédition transactionnelle Resend | Conserver les enregistrements SPF/DKIM/DMARC existants; ne pas le rattacher à l'application. |

## Procédure sûre

1. Exporter ou photographier la zone DNS existante avant tout changement.
2. Relever dans hPanel les valeurs exactes exigées pour le projet Node.js; ne pas deviner d'adresse IP.
3. Comparer les nouveaux enregistrements avec tous les enregistrements `mail`, SPF, DKIM, DMARC et MX existants.
4. Ajouter uniquement la cible apex et l'alias `www` demandés par Hostinger.
5. Ne supprimer ni remplacer les TXT Resend, les enregistrements de messagerie Hostinger, ni les MX existants.
6. Ne pas ajouter de MX entrant Resend : Resend est utilisé ici pour l'expédition, pas comme boîte de réception.
7. Attendre la propagation et la délivrance du certificat TLS avant les tests d'authentification.
8. Vérifier `https://kjorapp.com` et la redirection canonique `https://www.kjorapp.com/...`.

## Supabase Auth à préparer après DNS et TLS

Les routes suivantes existent dans l'arbre Next.js et doivent être ajoutées ultérieurement aux URL autorisées de Supabase Auth :

- `https://kjorapp.com`
- `https://kjorapp.com/auth/callback`
- `https://kjorapp.com/portal/auth/complete`

Ne pas les enregistrer avant que le domaine HTTPS pointe vers l'instance supervisée. Ne pas utiliser de wildcard et ne pas retirer les URL Dev/Preview encore nécessaires.

## Contrôles de non-régression mail

- SPF : un seul enregistrement SPF logique pour le nom concerné; fusionner selon les instructions des fournisseurs, jamais en créant deux SPF concurrents.
- DKIM : conserver chaque sélecteur Resend/Hostinger à son nom exact.
- DMARC : conserver la politique existante et vérifier les rapports avant tout durcissement.
- MX : conserver les MX du service de réception choisi; aucun MX Resend entrant n'est nécessaire.

## Rollback DNS préparé

Réappliquer exactement l'export de zone effectué à l'étape 1 pour les seuls enregistrements modifiés. Ne pas toucher aux enregistrements mail non concernés. Le rollback DNS ne remplace pas le rollback applicatif décrit dans le runbook.
