# Préproduction (Lot 7)

Les aperçus Vercel ne reproduisent pas la production (Hostinger, proxy hcdn). Pour éviter un nouveau « 403 en production seulement » :

1. Créer sur Hostinger un second site `staging.kjorapp.com` exécutant `next start` depuis la branche `main`, avec un projet Supabase distinct (ou une branche Supabase).
2. Après chaque fusion, déployer d'abord le staging puis lancer `npm run smoke https://staging.kjorapp.com`.
3. Ne déployer la production que si les 7 contrôles passent.
4. Le workflow `smoke.yml` peut être lancé à la main sur l'une ou l'autre URL.

Pour le découpage de `platform-admin/views.tsx` (2313 lignes) et `copy.ts` (1187 lignes) : à faire module par module, un fichier de vue par onglet, avec les tests existants comme filet — non fait dans ce lot pour ne pas toucher à la console administrateur sans test de navigateur.
