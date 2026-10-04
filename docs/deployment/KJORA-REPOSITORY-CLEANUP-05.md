# KJORA — Audit prudent du dépôt pour Hostinger

Date de l'audit : 2026-10-03

Base : `a8d11756d263d351fa4de2d83697b5e21897cb03`

## Méthode

L'audit a porté sur les fichiers suivis, les exclusions Git, les dépendances déclarées, les imports, les scripts npm, les URL codées en dur, les fichiers Vercel, les migrations et toutes les lectures de `process.env`. Aucun fichier n'a été supprimé sur la seule base de son nom ou de son apparente inutilité.

## Supprimé avec preuve

Aucun fichier. Aucun doublon ou artefact suivi ne disposait d'une preuve suffisante permettant une suppression sans risque fonctionnel ou historique.

## Conservé volontairement

- Les 60 migrations Supabase et leurs tests : historique immuable, aucune migration modifiée ou renommée.
- `vercel.json` : configuration encore utile aux déploiements Vercel existants. Hostinger l'ignore; le cron qu'il décrit n'est pas transposé ni activé par ce lot.
- Les rapports et documents métier historiques : ils constituent la traçabilité des décisions et ne sont pas des sorties générées.
- Les fondations Stripe Test, fournisseurs Afrique et WhatsApp : elles sont importées ou documentent des interfaces futures. Aucun adaptateur Afrique ou Meta n'est activé.
- `public/sw.js` : cache limité aux ressources publiques; API, espaces privés et documents sont exclus.
- Les fontes `next/font/google` : elles sont intégrées au build. Leur téléchargement exige une sortie HTTPS pendant `npm run build`; ce point est une précondition Hostinger documentée, pas un motif de suppression.
- `kjorapp.com` est le domaine principal du produit KJORA : le même déploiement y dessert le site public et l'application. `kjora.kjemostudios.com` n'est plus le site commercial KJORA de référence.
- Le fallback `SUPABASE_SERVICE_ROLE_KEY` : alias historique encore lu côté serveur. Il est classé obsolète; le nouveau déploiement doit employer `SUPABASE_SECRET_KEY` uniquement.

## Décision différée

- Retrait futur de l'alias `SUPABASE_SERVICE_ROLE_KEY`, après vérification qu'aucun environnement actif ne l'utilise.
- Retrait éventuel des noms de variables Notch Pay et PayUnit du registre générique, lors d'un lot fournisseur : aucun adaptateur n'est enregistré aujourd'hui, mais la matrice produit les conserve.
- Auto-hébergement des fontes afin de rendre le build totalement indépendant du réseau. Le build actuel est reproductible avec accès à Google Fonts; changer les fontes aurait un impact visuel hors périmètre.
- Remplacement ou conservation de `vercel.json` après abandon explicite de Vercel. Le supprimer maintenant ferait perdre un cron préparé et une configuration existante.

## Artefacts interdits

Le contrôle `git ls-files` ne trouve aucun `.env` réel, `node_modules`, `.next`, `.vercel`, `out`, journal, dump, ZIP, bundle ou patch suivi. Seul `.env.example`, volontairement public et sans secret, est suivi. `.gitignore` exclut ces catégories ainsi que `supabase/.temp`.

## Dépendances et scripts

Les dépendances directes sont présentes dans l'arbre installé et correspondent à des imports ou à la chaîne d'outillage. Aucun retrait n'est justifié par une preuve suffisante. Les scripts `dev`, `build`, `start`, `lint`, `test` et `typecheck` sont portables; le démarrage Hostinger repose sur les commandes standard `npm ci`, `npm run build`, `npm start`.

## Correctif de portabilité retenu

`VERCEL_ENV` est absent sur un serveur Node Hostinger. Le code utilise désormais `NODE_ENV=production` comme repli fail-closed seulement lorsque `VERCEL_ENV` n'existe pas. Une Preview Vercel reste prioritaire et n'est donc pas confondue avec la Production. Ce correctif empêche le test Resend simulé d'être disponible sur Hostinger Production et affiche le bon badge d'environnement.
