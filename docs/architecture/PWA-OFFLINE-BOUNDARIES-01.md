# PWA KJORA — frontières hors ligne

Le service worker accélère uniquement les ressources versionnées de Next.js, le manifeste, l'icône et les pages publiques Partenaires/Hors-ligne déjà visitées.

Il ne traite jamais les chemins `/api`, `/app`, `/administration`, `/portal`, `/auth`, `/connexion` et `/onboarding`. Aucune réponse authentifiée, donnée métier, document, contrat, paiement ou jeton n'est persisté. L'expérience hors ligne explique cette limite au lieu de montrer des données potentiellement périmées.

L'activation Production reste hors de ce lot. Avant déploiement : audit Lighthouse mobile/desktop, validation iOS/Android, vérification de la portée du service worker et exercice de mise à jour/rollback.
