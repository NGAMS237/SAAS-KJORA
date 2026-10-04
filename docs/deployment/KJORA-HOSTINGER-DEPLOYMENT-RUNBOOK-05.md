# KJORA — Runbook de déploiement Hostinger supervisé

État : préparation seulement. Ce lot n'a exécuté aucun déploiement, DNS, migration ou appel fournisseur.

## Références vérifiées

- Hostinger permet de sélectionner Node.js 18, 20, 22 ou 24 et de déployer une application Node depuis GitHub : [sélection de la version Node.js](https://www.hostinger.com/support/how-to-select-the-node-js-version-for-your-application/), [déploiement Node.js](https://www.hostinger.com/support/how-to-deploy-a-nodejs-website-in-hostinger/).
- Next.js prend en charge le serveur Node standard avec `next build` puis `next start` et recommande un reverse proxy devant le serveur : [déploiement](https://nextjs.org/docs/app/getting-started/deploying), [auto-hébergement](https://nextjs.org/docs/app/guides/self-hosting).
- Les variables `NEXT_PUBLIC_*` sont intégrées au bundle pendant le build; les secrets sans ce préfixe restent serveur : [variables d'environnement Next.js](https://nextjs.org/docs/app/guides/environment-variables).

## Préflight avant toute action distante

1. Obtenir une autorisation explicite de déploiement et de DNS distincte de ce document.
2. Confirmer que `main` pointe vers le commit approuvé et que sa CI est verte.
3. Confirmer que le patch de préparation a été revu et fusionné; ne jamais déployer la branche de travail directement.
4. Exécuter localement `npm ci`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` et `git diff --check`.
5. Confirmer qu'aucune migration Supabase n'est implicitement couplée au déploiement.
6. Préparer un compte de test identifié et une fenêtre de rollback.

## Configuration du projet Hostinger

1. Dans hPanel, créer une application Node.js par import GitHub.
2. Sélectionner le dépôt privé `NGAMS237/SAAS-KJORA` au moyen de l'intégration GitHub Hostinger; ne jamais fournir un jeton dans un fichier.
3. Sélectionner la branche `main`.
4. Choisir le framework **Next.js**.
5. Choisir **Node.js 22.x**. Le dépôt annonce également `engines.node=22.x`.
6. Définir le répertoire racine sur `./`.
7. Utiliser l'installation `npm ci`, le build `npm run build` et le démarrage `npm start`. Ne pas ajouter de serveur personnalisé.
8. Laisser Hostinger injecter `PORT`; `next start` l'utilise. Ne pas créer `VERCEL_ENV`.
9. Vérifier que le build peut sortir en HTTPS pour télécharger Inter/Inter Tight via `next/font/google`.

## Variables à saisir

La liste normative est `KJORA-HOSTINGER-ENV-MATRIX-05.md`.

### Informations publiques

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `KJORA_APP_ORIGIN=https://kjorapp.com`
- `KJORA_COMMERCIAL_SITE_URL=https://kjorapp.com` pour le site public servi par le même déploiement
- `NEXT_PUBLIC_KJORA_CONTACT_EMAIL` seulement si l'adresse doit être publique

Les deux variables `NEXT_PUBLIC_SUPABASE_*` doivent exister avant le build.

### Secrets saisis manuellement dans hPanel

- `SUPABASE_SECRET_KEY`, seulement lorsque les traitements serveur correspondants sont autorisés
- `KJORA_PARTNERS_HASH_SALT` avant le test des candidatures
- secrets Resend, cron ou Stripe Test uniquement lors d'un lot explicitement autorisé

Ne jamais copier une valeur secrète dans le chat, Git, un rapport, une capture d'écran ou un journal de commande.

### Coupe-circuits du premier déploiement

```text
BILLING_PROVIDER_STRIPE_TEST_ENABLED=0
BILLING_KILL_SWITCH_ALL=1
BILLING_KILL_SWITCH_STRIPE=1
KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=false
KJORA_SAAS_AUTO_INVOICING_ENABLED=false
KJORA_WHATSAPP_PROVIDER=disabled
```

Laisser vides les clés Stripe, les Price IDs, les secrets Resend/cron et les placeholders Meta. Aucun cron Hostinger ne doit être créé.

### Valeurs Production futures, hors de ce runbook

Clés Live de paiement, activation email, automatisations, Meta Cloud API et identité légale définitive exigent chacun une décision, des tests isolés et une autorisation distincte. Une fusion Git ne les active jamais.

## Build et démarrage

1. Lancer le build depuis hPanel.
2. Vérifier dans les journaux : Node 22.x, installation lockfile sans modification, compilation Next.js, typecheck et génération des pages.
3. Refuser tout déploiement si une variable secrète est imprimée ou si une migration est lancée.
4. Démarrer avec `npm start`.
5. Vérifier que le reverse proxy Hostinger termine TLS et transmet correctement l'hôte et le schéma HTTPS.
6. Contrôler que les cookies de session portent `Secure` sur HTTPS et que les routes API dynamiques répondent depuis le runtime Node.
7. Vérifier les webhooks sans les appeler : leurs routes lisent le corps brut et renvoient un échec contrôlé quand leur configuration est absente.

## Domaine, SSL et redirections

Après autorisation DNS seulement :

1. Appliquer le plan `KJORA-HOSTINGER-DNS-PLAN-05.md`.
2. Rattacher `kjorapp.com`, domaine principal du site public et de l'application sur ce même déploiement, attendre le certificat SSL Hostinger puis forcer HTTPS.
3. Configurer `www.kjorapp.com` en redirection permanente vers l'apex.
4. Conserver tous les enregistrements de `mail.kjorapp.com` et de messagerie.
5. Ajouter ensuite les trois URL Auth Supabase exactes documentées dans le plan DNS.

## Test de santé

Il n'existe pas de route `/api/health`; ne pas en inventer une dans hPanel. Utiliser :

1. `GET /aide` : attendu `200`, HTML public, aucun cookie privé.
2. `GET /robots.txt` : attendu `200`, politique non indexable conforme à l'application.
3. `GET /connexion` : attendu `200`, configuration Supabase chargée sans secret côté client.
4. `GET /app` sans session : redirection vers `/connexion`, jamais contenu privé.
5. Journaux : aucune exception, adresse complète, contenu de formulaire, clé ou jeton.

Puis exécuter toute la matrice `KJORA-HOSTINGER-SMOKE-TESTS-05.md`.

## Rollback applicatif

1. Identifier avant déploiement le SHA `main` actuellement servi et le conserver dans la fiche d'intervention.
2. Si les smoke tests échouent, fermer d'abord toute activation fournisseur et tout cron éventuel.
3. Dans hPanel, redéployer le dernier commit approuvé, sans réécrire l'historique Git.
4. Ne pas restaurer une base ou supprimer des données pour un rollback applicatif.
5. Rejouer les smoke tests publics, Auth et de confidentialité.
6. Documenter l'incident et ne rouvrir le trafic qu'après validation.

Une migration de base a son propre plan de retour. Ne jamais supposer que le rollback du code annule une migration.

## Procédure future pour la migration WhatsApp manuelle

Migration concernée uniquement : `supabase/migrations/20261002120000_pilot_resilience_whatsapp_manual_04.sql`.

1. Obtenir une autorisation explicite KJORA Dev et une sauvegarde fraîche vérifiée.
2. Rejouer toutes les migrations depuis zéro sur une base éphémère et exécuter les pgTAP, dont le test WhatsApp.
3. Comparer l'historique KJORA Dev avec Git. Si plus d'une migration est en attente ou si l'historique diverge, arrêter.
4. Utiliser `supabase db push --dry-run` lié uniquement à KJORA Dev et vérifier que la sortie annonce exactement cette migration.
5. Après une seconde autorisation, appliquer uniquement si cette condition reste vraie; aucun `db reset`, aucune Production.
6. Vérifier tables, RLS, grants, fonctions `SECURITY DEFINER`, `search_path`, compteurs de données et provider toujours `disabled`.
7. Conserver le rapport et la procédure de rollback additive; ne jamais supprimer les données existantes.

Cette procédure n'a pas été exécutée par le lot 05.

## Continuité du développement

```text
branche de fonctionnalité
→ tests locaux
→ push
→ Pull Request
→ CI verte
→ revue
→ fusion dans main
→ déploiement Hostinger supervisé
→ smoke tests
→ rollback si nécessaire
```

Gate migrations indépendant :

```text
migration testée
→ replay éphémère
→ pgTAP
→ autorisation de Blaise
→ KJORA Dev
→ vérification
→ Production plus tard
```

Une fusion dans `main` n'autorise jamais automatiquement une migration ou une activation fournisseur.
