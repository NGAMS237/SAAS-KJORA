# Kjora UI System v1

> Langage visuel commun à l’espace interne et au Tenant Portal. Les composants métier restent hors de ce document.
>
> **Document historique.** La direction active et son déploiement global v2B sont désormais décrits dans [KJORA UI System v2](./KJORA-UI-SYSTEM-v2.md).

## Typographies

- **Inter Tight** : H1/H2, titres importants, KPI et montants financiers.
- **Inter** : navigation, boutons, formulaires, labels, aides et corps de texte.
- **Wordmark Kjora uniquement** : serif de marque ; aucun serif dans l’interface produit.
- Montants : graisse 700–800 et chiffres tabulaires. H1 : 28–32 px mobile, 38–42 px desktop. KPI : 26–30 px ; solde principal : 30–40 px selon le viewport.
- Les polices sont chargées avec `next/font` et servies par l’application.

## Palette et surfaces

- Vert profond `#1F2D27` : marque, navigation et actions principales.
- Ivoire chaud `#F3EFE6` : contraste de marque et fond chaleureux.
- Terre cuite `#C86A4A` : accent, portail et attention maîtrisée.
- Or muté `#C9A46A` : détail premium, jamais texte courant peu contrasté.
- Gris pierre `#8E908B` : référence neutre ; les couleurs sémantiques de texte, bordure et surface sont définies par thème.
- Trois niveaux : fond, surface, surface élevée. Bordures fines, ombres légères, aucun glassmorphism.

## Hiérarchie et espacement

- Ordre : contexte/eyebrow → titre → description → action → contenu.
- Échelle d’espacement : 4, 8, 12, 16, 20, 24 et 32 px.
- Rayons : 8 px pour les petits éléments, 10 px pour les contrôles, 16 px pour les cartes, plein rayon pour les badges.
- L’espace et le contraste priment sur la multiplication des cadres.

## Navigation

- Une seule destination active ; elle utilise un fond plein et un contraste fort.
- Interne mobile : Accueil, Biens, Locataires, Paiements, Activité. Fonctions secondaires hors barre principale.
- Portail mobile : Accueil, Loyers, Reçus, Compte. Il reste visuellement et structurellement distinct du RBAC interne.
- L’Organization active reste visible dans l’espace interne.

## Cartes et listes

- Les cartes portent un regroupement fonctionnel, pas chaque ligne individuelle.
- Les KPI utilisent Inter Tight et des chiffres tabulaires.
- Une ligne ouvrable reçoit un feedback discret de fond et de déplacement ; une ligne informative reste stable.
- Empty states : message bref, action éventuelle et motif discret autorisé hors données importantes.

## Badges de statut

- **À venir** : information.
- **Dû** : dû neutre/or muté.
- **Partiel / Partiellement payé** : avertissement.
- **Payé** : succès.
- **En retard** : danger.
- Les statuts proviennent de la vérité métier ; la couleur complète toujours un libellé textuel.

## Motion

- Transitions CSS utiles uniquement : 150 ms rapide, 180 ms standard.
- Propriétés privilégiées : opacité, transform, fond, bordure et couleur.
- Aucun mouvement permanent ni bibliothèque d’animation. `prefers-reduced-motion` neutralise les transitions et animations.

## Motifs africains

- Géométrie ou matière très discrète, limitée aux empty states, headers secondaires, onboarding ou branding Organization.
- Jamais derrière un montant, sur chaque carte, ni comme icône universelle. L’identité reste celle d’un SaaS premium international.

## Light / dark

- Les deux thèmes conservent la même hiérarchie, les mêmes statuts et les mêmes affordances.
- Les composants utilisent les tokens sémantiques de surface, texte, bordure et statut ; aucune duplication de données ou de structure par thème.
- En clair, le fond ivoire-grège est nettement distinct des surfaces crème et des cartes élevées ; les bordures restent chaudes et perceptibles.
- En sombre, les surfaces sont charbon neutre plutôt que vertes. Le vert reste réservé à la marque, aux actions et aux états de succès.

## Préparation financière et Locations — patch 6B.1

- Le montant périodique est la valeur financière dominante ; loyer hors charges et charges récurrentes restent lisibles comme composants du calcul.
- Dépôt de garantie et montant prépayé sont deux blocs sémantiques séparés. Une aide explique que le dépôt n’est pas un loyer payé.
- Les calculs de couverture et de prorata utilisent des chiffres tabulaires et une surface informative, sans prendre l’apparence d’un paiement ou d’un solde confirmé.
- La liste Locations propose deux présentations équivalentes : cartes et tableau compact. Le choix de présentation ne modifie jamais les données.
- Une situation financière indisponible affiche un texte explicite ; elle ne remplace jamais une donnée absente par `0 XAF`.
- La fin d’une location utilise une modale dédiée avec contexte, conséquence, date effective, motif facultatif et confirmation explicite.

## À éviter

- Look template IA, énorme typographie, effet magazine, néon, gradients flashy, glassmorphism ou surdécoration.
- Formulaires desktop denses comme expérience mobile, motifs folkloriques omniprésents et animations de layout lourdes.
