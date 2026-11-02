# Lot 1 — filet de sécurité

- **CI** (`.github/workflows/ci.yml`) : typecheck, lint, tests et build à chaque PR. Dans GitHub > Settings > Branches, exiger le contrôle « verify » avant fusion.
- **Smoke test** : `npm run smoke [url]` (défaut https://kjorapp.com). À lancer après chaque redéploiement Hostinger ; aussi planifié chaque jour (`smoke.yml`).
- **En-têtes de sécurité** (`next.config.ts`). La CSP est en mode *Report-Only* : ouvrir le site, regarder la console du navigateur, et si aucune violation n'apparaît, renommer l'en-tête en `Content-Security-Policy` pour l'appliquer.
