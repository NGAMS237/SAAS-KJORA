# Supabase Kjora — mise en route du Lot 5B

1. Créer un projet Supabase **Kjora distinct**. Ne réutiliser ni projet, ni Auth, ni Storage, ni secret VERALUZ.
2. Copier `.env.example` vers `.env.local`, puis renseigner l’URL du projet et sa clé publiable. Ne jamais ajouter de `service_role` au frontend.
3. Appliquer `supabase/migrations/20260825180000_lot_5b_auth_organization.sql` sur LOCAL/DEV, puis STAGING. La PRODUCTION reste isolée.
4. Dans Auth URL Configuration, définir le Site URL local sur `http://localhost:3000` et autoriser `http://localhost:3000/auth/callback` ainsi que les URL équivalentes de staging/production.
5. Configurer le template email pour offrir un lien sécurisé et le code OTP dans un message clair. Le lien peut cibler `/auth/confirm?token_hash={{ .TokenHash }}&type=email` ; le code utilise `{{ .Token }}`.
6. Exécuter `supabase test db` sur une base locale pour prouver les politiques RLS avant toute validation distante.

Commandes application : `npm run dev`, `npm run test`, `npm run typecheck`, `npm run lint`, `npm run build`.
