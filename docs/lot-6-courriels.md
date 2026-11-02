# Lot 6 — Courriels automatiques

Le code envoie déjà avis, rappels, reçus et quittances ; il ne part rien tant que ces variables manquent. À faire une seule fois :

1. Créer un compte Resend et valider le domaine d'envoi (ex. `mail.kjorapp.com`) : ajouter les enregistrements DNS SPF/DKIM demandés.
2. Dans hPanel > Variables d'environnement, ajouter :
   - `RESEND_TRANSACTIONAL_API_KEY` (clé API Resend)
   - `KJORA_TRANSACTIONAL_EMAIL_FROM` (ex. `KJORA <no-reply@mail.kjorapp.com>`)
   - `KJORA_FINANCIAL_EMAIL_DELIVERY_ENABLED=true`
   - pour le suivi de livraison : `RESEND_WEBHOOK_SECRET` et `CRON_SECRET`
3. Redéployer, puis ouvrir Paramètres > Courriels automatiques : l'état doit passer à « actif ».
4. Renseigner l'e-mail des locataires signalés « E-mail manquant » dans la liste des locataires.
