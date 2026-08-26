# Kjora — État du projet

> Mise à jour : 2026-08-26 — prévisualisation UX interactive 6A/6B disponible, backend non commencé

## Lots

- **Lot 1 — Architecture fonctionnelle v0.1 : VALIDÉ**
- **Lot 2 — Parcours et périmètre MVP : VALIDÉ**
- **Lot 3 — UX & architecture d’interface v0.1 : VALIDÉ**
- **Lot 4 — Architecture technique & sécurité v0.1 : VALIDÉ**
- **Lot 5A — Bootstrap application, navigation et design tokens : TERMINÉ ET TESTÉ — À VALIDER PAR BLAISE**
- **Lot 5B — Auth + Organization : TERMINÉ / TESTÉ / VALIDÉ**
- **Sous-lot PIN interne 6 chiffres : TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION FONCTIONNELLE BLAISE EN ATTENTE**
- **Lot 5C — Membership/RBAC + isolation : NON COMMENCÉ**
- **Lot 6A — Property + Unit backend : NON COMMENCÉ**
- **Lot 6B — Tenant + Lease backend : NON COMMENCÉ**
- **Prévisualisation UX 6A/6B : DISPONIBLE — données fictives, store client éphémère, aucune persistance Supabase**

## Terminé

- Lot 0 — gouvernance, contexte et préparation d’architecture terminé.
- Lot 1 et ses décisions D-021 à D-028 validés et conservés.
- Vingt arbitrages Q-L2 enregistrés comme D-029 à D-048.
- D9 — portail locataire distinct — enregistré comme D-049.
- Dix-neuf arbitrages Q-D9 enregistrés comme D-050 à D-068.
- Parcours propriétaire/interne, inventaire d’écrans, périmètre, critères d’acceptation et matrice d’expérience du Lot 2 validés.
- Auth interne : email avec OTP et lien sécurisé ; PIN 6 chiffres réservé à l’accès quotidien sur appareil autorisé.
- Onboarding Organization minimal, Unit explicite, dossier locataire minimal et périodicités limitées validés.
- Paiement total ou partiel jusqu’au restant dû ; surpaiement et cas financiers avancés bloqués.
- Paiement enregistrable par Owner, gestionnaire et encaisseur avec revérification tenant-scoped à la confirmation.
- Matrice des six rôles internes validée avec refus par défaut et audit visible uniquement par Owner.
- Invitation interne expirant après 7 jours et protection du dernier Owner validées.
- Dashboard sur le mois courant par défaut et reçu consultable/téléchargeable/email contrôlé validés.
- Portail locataire minimal inclus dans le premier MVP.
- `Tenant Portal Access` validé comme mécanisme distinct des Memberships internes.
- Source unique de vérité validée pour Lease, Rent/Dues, Payments et Receipts.
- Portail sans PIN, session persistante 30 jours, durées d’invitation/OTP/lien validées.
- Fin de bail en historique lecture seule et anciens reçus accessibles selon rétention validés.
- Journal d’accès portail de 12 mois et visibilité opérationnelle minimisée validés.
- Notifications portail essentielles et priorité de langue locataire puis Organization validées.
- Cinq livrables du Lot 2 alignés sur D-029 à D-068 et enrichis des parcours, écrans et critères du portail minimal.
- Trois arbitrages UX Q-UX-L3-01 à Q-UX-L3-03 enregistrés comme D-069 à D-071.
- Navigation interne mobile validée : Accueil, Biens, Locataires, Paiements, Activité, avec fonctions Organization secondaires hors barre principale.
- Navigation portail validée : Accueil, Loyers, Reçus, Compte ; notifications par entrée légère et paiements accessibles contextuellement.
- Absence de destination Documents globale validée ; reçu, preuve, logo et bail/document essentiel restent contextuels sans copie parallèle.
- Quatre livrables du Lot 3 validés : synthèse UX, architecture d’information/navigation, flows mobiles et patterns/états.
- Six arbitrages techniques Q-TECH-L4-01 à Q-TECH-L4-06 enregistrés comme D-072 à D-077.
- Stack MVP validée : Next.js, TypeScript et PWA mobile-first depuis une seule base applicative ; Capacitor reste une trajectoire future.
- RLS validée comme barrière fondamentale tenant ; opérations sensibles côté serveur et traitements asynchrones par outbox + worker.
- Environnements LOCAL/DEV, STAGING et PRODUCTION validés avec isolation de la production, de VERALUZ et des secrets.
- Auth interne Supabase email OTP/lien, session persistante et PIN de verrouillage rapide non substitutif validés.
- Abstraction `PhoneOtpProvider` validée ; fournisseur réel différé avant 6E sans bloquer 5A ni les lots propriétaires.
- Invariant Unit/Lease validé : aucune période de deux Leases ne se chevauche sur une Unit.
- Cinq livrables du Lot 4 validés : synthèse technique, modèle de données conceptuel, RLS/Auth/sécurité, events/Storage/communications et plan d’implémentation.
- Application Next.js 16.3.2 + React 19 + TypeScript 6 initialisée avec App Router, scripts npm et lockfile reproductible.
- Structure minimale du monolithe créée : `core`, placeholders de modules et coque `tenant-portal`, sans service métier ni couche de données.
- Coque interne responsive livrée avec navigation principale Accueil/Biens/Locataires/Paiements/Activité et espace secondaire Équipe/Paramètres/Profil.
- Pages placeholders navigables livrées pour Accueil, Biens, Locataires, Paiements, Activité, Équipe, Paramètres et Profil.
- L’Organization fictive a été retirée de l’espace interne ; l’Organization active provient désormais du contexte Supabase authentifié.
- Coque `Tenant Portal` séparée livrée avec Accueil/Loyers/Reçus/Compte et notifications par entrée légère.
- Tokens Kjora, thèmes clair/sombre, cards, boutons, badges, empty state, loading et erreur générique implémentés sans gros design system.
- Manifest PWA, metadata et icône temporaire Kjora ajoutés sans logique offline métier.
- Clients Supabase navigateur/serveur et Proxy Next.js 16 ajoutés avec cookies SSR, clé publiable uniquement et aucune `service_role` navigateur.
- Connexion interne email par lien sécurisé avec OTP alternatif, callback/confirmation, session persistante et déconnexion locale implémentés.
- Migration 5B ajoutée pour `organizations`, `organization_profiles` et `memberships`, avec RLS immédiate et création atomique Organization + profil + Membership owner.
- Onboarding minimal Cameroun/XAF, langue et fuseau horaire implémenté ; un User vérifié peut créer plusieurs Organizations.
- Organization active réelle, sélection A/B tenant-scoped et profil Organization minimal modifiable par Owner implémentés.
- Identité réelle utilisée dans Accueil, Profil et Équipe ; les données métier des placeholders 5A restent explicitement fictives.
- Suite pgTAP d’isolation RLS et tests unitaires du contexte Organization ajoutés ; guide court de configuration Supabase Kjora ajouté.
- Projet Supabase séparé `KJORA` (`alvheiwlfzuefljcfrtv`, Paris) connecté ; aucun projet VERALUZ ou `mako-city` modifié.
- Migration préparée `lot_5b_auth_organization` appliquée une seule fois au projet KJORA.
- URL et clé publiable KJORA configurées dans `.env.local`, fichier confirmé ignoré par Git ; aucune clé secrète ou `service_role` ajoutée.
- Lot 5B validé fonctionnellement par Blaise : email Resend reçu, Magic Link Supabase avec PKCE opérationnel et session SSR persistante créée.
- Onboarding Organization réel validé ; l’Organization créée est affichée dans `/app`, puis retrouvée après déconnexion et reconnexion.
- Les données Dashboard, Biens, Locataires et Paiements restent volontairement fictives jusqu’aux lots métier correspondants.
- Sous-lot PIN interne livré : configuration, modification et suppression facultatives dans Paramètres, verrouillage manuel et automatique après 5 minutes, puis écran mobile-first `/verrouillage`.
- Le PIN interne reste un `quick lock` local sur session Supabase existante : PBKDF2-SHA-256 à 600 000 itérations, sel aléatoire, verifier et compteur d’échecs dans IndexedDB, aucun PIN brut conservé ou transmis.
- Après cinq erreurs ou choix de l’email, le PIN local est supprimé et la session Supabase est terminée afin d’imposer une authentification forte. La déconnexion interne supprime également le PIN et l’état de déverrouillage locaux.
- Le Tenant Portal reste séparé et ne charge aucune logique PIN.
- Prévisualisation UX interactive livrée pour Biens, Unités, Locataires et Baux : listes, recherche, création minimale, détails contextuels, vacance/occupation, brouillon, résumé, activation et clôture simulées.
- Le modèle de démonstration respecte `Property → Unit → Lease`, crée « Maison entière » pour une maison, impose un contact locataire minimal, ne crée aucun accès portail et refuse l’activation de périodes Lease qui se chevauchent sur une Unit.
- Toutes les données de cette prévisualisation sont manifestement fictives, bornées à l’Organization active, conservées uniquement dans un store client réinitialisé au refresh et accompagnées d’une bannière « Mode démonstration — données fictives, non enregistrées ».
- Cette anticipation UX ne constitue ni le démarrage, ni la réalisation, ni la validation des Lots backend 5C, 6A ou 6B.

## Testé

- Cohérence entre `DECISIONS.md`, `PROJECT_CONTEXT.md`, `PROJECT_STATE.md` et les cinq livrables du Lot 2.
- Traçabilité complète Q-L2-01 à Q-L2-20 → D-029 à D-048.
- Traçabilité D9 → D-049 et Q-D9-01 à Q-D9-19 → D-050 à D-068.
- Séparation explicite entre `Internal Organization Membership` et `Tenant Portal Access`.
- Absence de septième rôle RBAC interne.
- Absence de copie portail des baux, échéances, paiements et reçus.
- Isolation locataire A / locataire B dans une même Organization.
- Isolation Org A / Org B et absence de révélation d’un accès multi-Organization.
- Reçu final autorisé uniquement après `PAYMENT_COMPLETED`.
- Aucun PIN locataire ; session portail limitée à 30 jours.
- Journal d’accès portail conservé 12 mois.
- Fin de bail en historique lecture seule.
- Aucun reçu ou lien de reçu public permanent.
- Parcours mobile-first et FR/EN couverts.
- Fonctions portail hors MVP non réintroduites.
- Pendant les Lots documentaires 1–3, aucun code applicatif, SQL, projet Supabase, migration, fournisseur, déploiement, secret, framework ou maquette haute fidélité n’a été ajouté.
- Couverture conservée des 50 écrans fonctionnels du Lot 2 dans les flows UX du Lot 3.
- Navigation interne et portail conforme à D-069 et D-070.
- Notifications portail accessibles sans cinquième onglet principal.
- Organization active identifiable et changement de tenant sans mélange de données.
- Fichiers contextuels conformes à D-071, sans bibliothèque ni copie documentaire parallèle.
- Source métier unique, isolation tenant, permissions par rôle et séparation `Tenant Portal Access` / Membership interne préservées.
- Traçabilité Q-TECH-L4-01 à Q-TECH-L4-06 → D-072 à D-077.
- Cohérence de la stack unique Next.js/TypeScript/PWA et de la trajectoire Capacitor future.
- RLS sur toute donnée tenant-scoped, absence de `service_role` navigateur et frontière serveur pour les opérations sensibles.
- Outbox + worker découplés des transactions métier ; runtime concret du worker laissé à l’implémentation.
- Isolation de PRODUCTION vis-à-vis de STAGING/DEV, VERALUZ, bases, Auth, Storage et secrets.
- PIN interne jamais assimilé à une Auth principale, jamais stocké en clair et sans réintroduction de biométrie au MVP.
- `PhoneOtpProvider` sans couplage fournisseur et gate explicite avant le Lot 6E.
- Refus conceptuel des Leases dont les périodes se chevauchent sur une Unit.
- Stratégie de tests Org A/Org B, Tenant A/Tenant B, session révoquée, RBAC et Storage privé maintenue.
- Aucun code, SQL, migration, projet/configuration Supabase, déploiement, secret ou installation effectué pendant le Lot 4.
- TypeScript `tsc --noEmit` : succès.
- ESLint : succès sans erreur ni avertissement.
- Build Next.js production : succès ; 16 routes statiques générées, dont les deux coques et le manifest.
- Serveur local Next.js démarré sur `http://127.0.0.1:3000` et routes HTTP vérifiées.
- Navigation interne testée sur viewport mobile 390×844 et desktop 1280×900, y compris l’espace secondaire et le sélecteur d’Organization fictive.
- Portail locataire testé sur mobile et desktop : quatre destinations présentes, aucune navigation interne/RBAC visible.
- Console navigateur vérifiée : aucune erreur ni avertissement critique.
- Manifest PWA vérifié en HTTP 200, `display: standalone`, `start_url: /app` et deux entrées d’icône.
- Pendant le seul Lot 5A, aucun Supabase, SQL, Auth, RLS, paiement/reçu réel, API externe, email, OTP, secret ou donnée de production n’a été ajouté.
- Lot 5B — TypeScript `tsc --noEmit` : succès.
- Lot 5B — ESLint : succès sans erreur ni avertissement.
- Lot 5B — quatre tests unitaires du contexte Organization : succès.
- Lot 5B — build Next.js production SSR : succès ; 24 routes recensées, dont 15 routes dynamiques applicatives/API/Auth et le Proxy.
- Avec la configuration KJORA, `/app/` sans session redirige vers `/connexion/`, l’API de création répond 401 sans session et `/connexion/` répond en HTTP 200.
- Un seul lockfile npm présent ; aucun secret réel, aucune variable `service_role` et aucun projet Supabase VERALUZ utilisé.
- Les 9 assertions pgTAP préparées ont été exécutées sur KJORA ; six contrôles distants agrégés confirment lecture A, refus B, contexte A+B, refus anon/non-membre et mise à jour Owner.
- La création atomique distante Organization + Profile + Membership Owner a été validée ; `PUBLIC` et `anon` ne peuvent pas exécuter la fonction.
- Toutes les données et identités de test distantes ont été annulées par transaction ; les trois tables restent vides après validation.
- Advisor sécurité exécuté : seul avertissement restant = fonction `create_organization` `SECURITY DEFINER` volontairement exposée aux seuls utilisateurs authentifiés, avec vérification `auth.uid()`, identité email vérifiée, validations, `search_path` vide et retraits `PUBLIC`/`anon`.
- Accès REST avec la seule clé publiable, sans session : HTTP 401 et aucune ligne exposée.
- Validation fonctionnelle réelle par Blaise : réception email Resend, échange Magic Link PKCE, création de session SSR, onboarding Organization, affichage de l’Organization réelle, déconnexion, reconnexion et récupération de l’Organization — succès.
- Sous-lot PIN — 17 tests Node réussis : format/confirmation, dérivation PBKDF2, absence du PIN brut dans le verifier, comparaison sûre, cinquième échec, timeout 5 minutes, retour interne borné et absence de couplage portail/localStorage.
- Sous-lot PIN — TypeScript, ESLint et build Next.js production réussis ; `/verrouillage` est une route dynamique protégée, `/app` refuse l’anonyme et les routes `/portal` restent sans logique PIN.
- Prévisualisation UX — tests purs couvrant création maison + Unit « Maison entière », immeuble multi-unités, vacance, locataire téléphone seul, email seul, refus sans contact, brouillon/activation, occupation après activation, refus de chevauchement et absence d’accès portail.
- Suite complète après prévisualisation : TypeScript et ESLint réussis, 25 tests Node réussis, build Next.js réussi avec 28 routes recensées.

## Bloqué

- Aucun blocage ou contradiction identifié pour la validation des Lots 1 à 4 et l’exécution du Lot 5A.
- Le runtime précis du worker reste un choix d’implémentation compatible avec D-073 et ne bloque pas 5B.
- Le fournisseur OTP téléphone reste volontairement différé par D-076 ; il doit être choisi avant 6E mais ne bloque pas 5B ni les lots propriétaires.
- Les paramètres techniques de retry et la politique légale de rétention restent à préciser dans leurs lots concernés sans remettre en cause l’architecture validée.
- Les canaux SMS/WhatsApp métier généraux restent non validés ; l’OTP téléphone confirmé est limité à l’authentification portail.
- `supabase test db` local n’a pas été exécuté : Supabase CLI et Docker sont absents de l’environnement ; les mêmes assertions ont été exécutées directement sur KJORA dans des transactions annulées.
- La validation fonctionnelle authentifiée du sous-lot PIN sur staging reste à effectuer par Blaise après redéploiement Vercel ; elle ne bloque pas la livraison technique ni ne démarre le Lot 5C.
- La prévisualisation UX doit être testée par Blaise sur staging ; ses données Biens/Unités/Locataires/Baux ne sont jamais enregistrées dans Supabase et disparaissent au refresh.

## Proposé ensuite

**Préparer le cadrage d’exécution du Lot 5C — Membership/RBAC + isolation, sans le commencer avant instruction explicite.**
