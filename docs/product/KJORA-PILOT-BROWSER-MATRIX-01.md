# KJORA — Matrice navigateur du pilote 01

Cette matrice exige une Preview isolée et des comptes de développement identifiables. Aucun identifiant n'est conservé dans Git.

| Profil | Précondition éphémère | Parcours principal | Contrôles de refus | Mobile / clavier |
|---|---|---|---|---|
| Owner Découverte | Organization active, plan gratuit | connexion → `/app` → bien → locataire → location → documents | aucun plan payant depuis URL ; Admin 404 | 360 px, focus visible, cibles tactiles |
| Owner payant Test | abonnement Test enregistré | `/app/billing`, fonctionnalités du plan, annulation programmée | aucun paiement Live ; devise URL ignorée | 390 px et desktop |
| Collaborateur | Membership non-owner actif | connexion → Organization autorisée → actions selon capabilities | paramètres sensibles, autre Organization et Admin refusés | clavier seul |
| Locataire | accès portail actif | `/portal/connexion` → bail → échéances → reçus | `/app`, autre bail/Organization et Admin refusés | 360 px, retour arrière |
| Partenaire | partenaire approuvé avec code | `/partenaires/connexion` → `/partenaire` → copier code/lien | aucune donnée de loyers, contrats, locataires ou paiements clients | 360 px, lecteur d'écran sur statuts |
| platform_admin | identité explicitement autorisée | `/administration/operations` → liens contrôle → partenaires/finances | aucune valeur secrète, payload ou adresse privée | clavier seul, tableau horizontal |

## Scénarios transversaux

1. Session valide : revisiter chaque page de connexion et confirmer la redirection vers l'espace autorisé sans nouveau code.
2. Session expirée : confirmer un message clair et un retour sûr après OTP/Magic Link.
3. URL hostile : `next`, rôle, Organization, plan, devise et entitlement externes ne modifient aucun droit.
4. Multi-Organization : changer d'Organization et vérifier qu'aucune donnée/carte/cache de l'ancienne ne subsiste.
5. Hors ligne : `/hors-ligne/` reste visible ; `/app`, `/portal`, `/administration` et `/api` ne sont jamais servis depuis le cache.
6. Fin de mois : mois local implicite puis mois explicite, neuf compteurs, une seule devise, aucun changement métier et aucun envoi.
7. Partenaires : candidature FR/EN, suivi privé, état vide, erreur réseau, copie du code/lien.
8. Centre Admin : dix systèmes, exactement quatre états possibles, noms des variables manquantes seulement, liens internes valides.
9. Fournisseurs : clé Stripe Live refusée, origine de retour externe refusée, Resend sans preuve non déclaré opérationnel, WhatsApp désactivé.
10. Documents : brouillon → aperçu → approbation ou report → mise en file seulement si le canal est activé; distinguer avis, quittance et facture SaaS.

## Résultat de ce lot local

Les scénarios authentifiés ci-dessus nécessitent des comptes et une base Preview : **NON EXÉCUTÉS** dans OPERATIONS-03. La compilation des 78 pages et les tests statiques ne remplacent pas cette matrice navigateur. Lighthouse, mobile réel et lecteur d'écran : **NON EXÉCUTÉS** sans navigateur supervisé.

## Preuves à conserver hors Git

- URL et SHA de Preview, date, navigateur et largeur.
- Captures sans donnée personnelle, résultat de chaque ligne, logs expurgés.
- Comptages avant/après des fixtures, puis preuve de nettoyage.
