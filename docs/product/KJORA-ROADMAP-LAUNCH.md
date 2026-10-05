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

**Mesure factuelle OPERATIONS-03 : 5/5 contrôles locaux obligatoires exécutés** (tests Node, TypeScript, ESLint, build Webpack, diff check), soit **100 % de ce gate technique local**. Ce pourcentage ne couvre ni SQL, ni navigateur, ni fournisseur.

## Gate 2 — Preview privée supervisée

- Appliquer les migrations sur une base Preview jetable, jamais directement en Production.
- Exécuter toute la suite pgTAP et le replay depuis zéro.
- Configurer uniquement les variables Preview listées dans le runbook.
- Tester chaque rôle avec des comptes éphémères distincts et nettoyer les données après revue.
- Garder Stripe Test, Resend contrôlé et WhatsApp désactivé.

**Mesure factuelle OPERATIONS-03 : 0/4 familles de preuves Preview exécutées**, soit **0 %** : replay SQL/pgTAP, comptes multi-rôles, matrice navigateur authentifiée, fournisseurs Test. Le code local prêt ne change pas ce résultat.

## Gate 3 — décision de pilote

Décision humaine requise après revue navigateur, journaux et incidents. Les éléments suivants ne sont pas implicitement autorisés : fournisseurs Live, paiement réel, communication en masse, domaine/DNS, migration Production, publication publique ou promesse commerciale partenaire.

**Mesure factuelle : 0/3 validations externes** (revue Blaise, domaine/DNS, fournisseurs supervisés), soit **0 %**. `READY FOR PRODUCTION` demeure NON.

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

## Lot PILOT-RESILIENCE-WHATSAPP-04 — prêt pour revue de patch

- Reconnexion partenaire avec destination interne validée et actions bilingues.
- PWA limitée au shell public, bannière réseau et refus explicite du cache privé.
- Handoff WhatsApp manuel sur document approuvé, sans fournisseur ni fausse confirmation.
- États/consentements audités par migration additive; Meta Cloud API reste désactivée.
- Centre Admin étendu au site commercial, WhatsApp manuel, future API et support.

Restent obligatoires : replay complet et pgTAP isolés, matrice authentifiée desktop/mobile, focus/lecteur d'écran et autorisation explicite avant application de la migration. `READY FOR PRODUCTION` demeure NON.

## Gate 4 — Hostinger et `kjorapp.com`

Le lot HOSTINGER-DEPLOYMENT-READINESS-05 prépare une cible Node.js 22 auto-hébergée avec les commandes Next.js standard. `kjorapp.com` est le domaine principal du produit; le site public et l'application sont servis par ce même déploiement. L'inventaire des variables, le plan DNS sans mutation, le runbook de déploiement/rollback et la matrice de smoke tests sont disponibles dans `docs/deployment/`.

Conditions avant déploiement :

- revue et fusion explicite du patch dans `main` après CI verte ;
- saisie manuelle des deux variables publiques Supabase et des seuls secrets autorisés dans Hostinger ;
- coupe-circuit global actif, Stripe Test coupé, Resend financier fermé, Meta désactivé et aucun cron ;
- autorisation distincte pour DNS, URL Supabase Auth et toute migration KJORA Dev ;
- smoke tests publics et authentifiés, puis décision humaine.

Le déploiement Hostinger, le DNS, la migration WhatsApp et les tests fournisseurs ne sont pas exécutés par ce lot. `READY FOR PRODUCTION` demeure NON.

## Gate 5 — Entrée publique et résilience PWA

Le lot PUBLIC-ENTRY-PWA-FIX-06 remplace la redirection de la racine par une vitrine FR/EN dans le même déploiement `kjorapp.com`. La connexion demeure sur `/connexion`, les CTA gratuits réutilisent l'intention Découverte existante et aucune URL ne peut attribuer un entitlement.

Le statut réseau est vérifié après hydratation par une ressource publique same-origin sans cookie. Les événements `online`/`offline` et le bouton « Réessayer » pilotent le même état; une erreur Supabase ou API métier n'est pas interprétée comme une panne Internet. API, pages authentifiées, documents, contrats et PDF restent hors cache.

Sortie du gate : validations locales vertes, revue du patch, fusion distincte, déploiement Hostinger supervisé puis matrice navigateur sur `kjorapp.com`. Avant ces étapes, `READY FOR PRODUCTION` reste NON.
