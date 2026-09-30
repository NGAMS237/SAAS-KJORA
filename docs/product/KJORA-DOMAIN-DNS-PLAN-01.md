# KJORA — Plan domaine et DNS 01

## Statut

Plan uniquement. Aucun achat, changement DNS, domaine personnalisé, certificat ou déploiement n'est effectué par ce lot.

## Cibles proposées déjà documentées

| Surface | Cible | Rôle |
|---|---|---|
| Site commercial | `kjora.kjemostudios.com` | acquisition, offres, contact, partenaires publics |
| Application | `app.kjora.kjemostudios.com` | authentification, espaces Owner/locataire/partenaire/Admin |

Ces noms restent des cibles tant que leur propriété, leur zone DNS et leur rattachement Vercel ne sont pas vérifiés. Aucun code ne doit en déduire une autorisation ou un environnement.

## Ordre de préparation supervisé

1. Confirmer le propriétaire de la zone `kjemostudios.com` et exporter un état DNS hors Git.
2. Rattacher d'abord une Preview/staging vérifiable, puis obtenir les valeurs exactes demandées par Vercel; ne pas inventer de CNAME/A/AAAA.
3. Ajouter les redirect URLs Supabase Auth exactes pour l'environnement testé, sans joker.
4. Vérifier HTTPS, redirections canoniques, cookies, CSP et séparation site/app.
5. Pour Resend, copier les enregistrements SPF/DKIM exacts du Dashboard. Ajouter DMARC progressivement après revue; ne pas remplacer un SPF existant sans consolidation.
6. Tester réception, rebonds et alignement From sur une adresse de développement autorisée.
7. Promouvoir seulement après rollback documenté, sauvegarde, matrice navigateur et autorisation Production distincte.

## Rollback DNS futur

- Conserver avant changement les valeurs, TTL et horodatages existants hors Git.
- Réduire le TTL uniquement dans une fenêtre approuvée.
- En incident, retirer le rattachement applicatif ou restaurer les valeurs précédentes; ne jamais improviser un nouvel enregistrement.
- Les clés et tokens restent dans les gestionnaires de secrets des environnements, jamais dans la zone DNS, Git ou ce document.

## Décisions encore requises

- Registrar et compte autorisé à modifier la zone.
- Domaine exact d'envoi transactionnel Resend et adresse publique.
- Politique DMARC initiale et responsable de suivi des rapports.
- Fenêtre de bascule, TTL, tests et responsable rollback.
- Autorisation explicite Preview puis Production.
