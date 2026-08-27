# Kjora UI System v2

> Statut : **v2B GLOBAL — TERMINÉ / TESTÉ / DÉPLOYÉ — VALIDATION VISUELLE BLAISE EN ATTENTE**
>
> Direction : **Horizon & héritage — immobilier africain premium, chaleureux, patrimonial et lisible**
>
> Portée actuelle : design system v2 déployé sur les écrans principaux internes, l’authentification et les états futurs du portail, sans changement métier.

## 1. Principes

- Le bleu nuit / Ink structure l’application, la navigation, les titres forts et les surfaces sombres.
- L’ambre / Kjora Gold signe les actions importantes, la sélection et quelques blocs d’icône.
- Le bleu Horizon porte les liens, l’information et les futurs graphiques.
- Le vert est réservé aux états métier positifs : actif, payé, à jour, succès.
- Le rouge est réservé à la dette, au retard, à l’erreur et aux actions destructives.
- Les surfaces remplacent la multiplication des bordures : fond teinté, carte claire, carte élevée et ombre diffuse.
- La couleur accompagne toujours un libellé. Elle ne porte jamais seule le sens.
- Aucune donnée financière absente n’est remplacée par zéro, une estimation ou une fixture.

## 2. Tokens sémantiques

| Rôle | Clair | Sombre | Usage |
|---|---|---|---|
| `background` | `#EDF1F3` | `#0C141E` | Fond de page bleuté / charbon bleu |
| `surface` | `#F7F7F3` | `#141F2A` | Contrôles et regroupements calmes |
| `surface-raised` | `#FFFDF8` | `#1A2733` | Cartes principales |
| `surface-muted` | `#E6ECEF` | `#22313E` | Champs, sous-cartes et états neutres |
| `text-primary` | `#14212D` | `#F5F3ED` | Titres et contenu principal |
| `text-secondary` | `#536370` | `#B9C4CC` | Texte secondaire |
| `text-muted` | `#6F7C86` | `#96A4AF` | Aides et métadonnées |
| `border` | `#D6DFE3` | `#2B3B48` | Séparation subtile |
| `brand-ink` | `#13253A` | `#101B29` | Sidebar, hero, primaire |
| `brand-blue` | `#356886` | `#78AAC6` | Liens et information |
| `brand-gold` | `#C8892F` | `#D7A44E` | Accent identitaire et CTA ponctuel |
| `success` | `#39755A` | `#87C5A1` | États positifs uniquement |
| `warning` | `#9B641F` | `#E4B66E` | Attention métier |
| `danger` | `#A44242` | `#EC9690` | Dette, erreur, destruction |
| `focus` | `#D69A40` | `#E1AE58` | Focus clavier visible |

Les alias historiques `kjora-forest`, `kjora-terracotta`, `kjora-gold` et `text` restent temporairement disponibles pour permettre une migration progressive. Les nouveaux composants utilisent les rôles sémantiques.

## 3. Typographie

- **Inter Tight**, déjà chargée avec `next/font`, porte les titres, KPI et montants.
- **Inter** porte navigation, corps, formulaires, labels et aides.
- Aucun téléchargement ou ajout de police n’est nécessaire.
- Titres de page : `32–48 px`, graisse `800`, tracking compact `-0.045em`.
- Titres de section : `20–24 px`, graisse `700–780`.
- Titres de carte : `16–20 px`.
- Corps : `14–16 px`.
- Labels et aides : `11–13 px`, contraste adapté.
- Montants : Inter Tight, graisse `750–820`, `font-variant-numeric: tabular-nums`.

Un montant important doit être lisible immédiatement, par exemple `55 000 XAF`, sans signe ambigu et avec son sens métier.

## 4. Espacement, rayons et ombres

- Échelle d’espacement conservée : `4, 8, 12, 16, 20, 24, 32 px`.
- Grande surface / hero : `32 px` de base.
- Carte standard : `24 px`.
- Champ et bouton : `15 px`.
- Petit bloc d’icône : `10–15 px`.
- Badge : pill.
- Ombre douce : `0 12px 34px` avec faible opacité.
- Ombre élevée : `0 18px 44px` pour un hero ou une carte interactive importante.
- Les bordures restent fines et secondaires ; aucun glassmorphism.

## 5. Organic Signature Geometry

### Radius scale

| Token | Valeur desktop | Usage |
|---|---:|---|
| `radius-sm` | `14 px` | petit bloc régulier |
| `radius-md` | `18 px` | navigation, icône, contrôle composé |
| `radius-lg` | `24 px` | carte standard |
| `radius-xl` | `32 px` | grande surface régulière |
| `radius-organic` | `48 px` | variante asymétrique douce |
| `radius-signature` | `64 px` | coin signature fortement accentué |
| `radius-pill` | `9999 px` | badge et contrôle pill uniquement |

Sur smartphone, `radius-organic` descend à `40–34 px` et `radius-signature` à `48–42 px` afin de préserver la composition sans débordement.

### Variantes

- **Standard card** : `24 px` sur les quatre coins pour formulaires secondaires, listes, tableaux et statistiques simples.
- **Soft asymmetric right** : `24 / 24 / 48 / 24 px` pour un bloc éditorial ou une surface de contexte.
- **Soft asymmetric left** : `24 / 24 / 24 / 48 px` comme complément dans une composition.
- **Signature asymmetric right** : `24 / 24 / 64 / 24 px` pour un hero ou une synthèse majeure.
- **Signature asymmetric left** : `24 / 24 / 24 / 64 px` pour une carte contractuelle, financière ou d’authentification forte.

### Usage

- Dashboard : hero signature à droite ; capacité financière future en complément doux à gauche.
- Dossier Locataire : hero à droite, zone financière et historique à gauche, Location actuelle en variante douce.
- Détail Location : hero à gauche et carte contractuelle à droite.
- Biens / Units : headers majeurs et synthèses importantes asymétriques ; cartes de listes et formulaires réguliers.
- Équipe, Profil et Paramètres : une seule surface forte par composition ; les listes de membres restent régulières.
- Auth et verrouillage : panneau principal signature, champs strictement réguliers.

### Anti-patterns

- Ne jamais appliquer l’asymétrie aux inputs, selects, textareas, cellules de tableau, petites lignes ou tous les boutons.
- Ne pas donner un coin signature à chaque carte d’une grille.
- Ne pas combiner plusieurs coins extrêmes sur une même petite surface.
- Ne pas sacrifier le contraste, la cible tactile, le focus ou la lisibilité pour la forme.

## 6. Iconographie

- Une seule famille : Lucide.
- Épaisseur standard : `1.8`.
- Taille courante : `18–22 px`.
- Les cartes importantes peuvent utiliser un petit bloc arrondi Ink, Blue, Gold ou neutre.
- Une icône n’est pas répétée sur chaque ligne si elle n’aide pas la lecture.

## 7. Boutons

- **Primary** : Ink/Navy. Une seule action dominante par vue.
- **Accent CTA** : Gold/Amber, réservé aux actions ponctuelles majeures.
- **Secondary** : surface neutre avec bordure subtile.
- **On dark** : surface translucide discrète sur hero bleu nuit.
- **Ghost** : navigation et actions secondaires.
- **Danger** : rouge uniquement, jamais l’accent Gold.
- Cible tactile minimale : `44 px`.
- Focus visible avec le token `focus`.

## 8. Champs

- Hauteur minimale `48 px`.
- Fond `surface`, légèrement teinté en clair et neutre bleu/charbon en sombre.
- Rayon `15 px`.
- Label persistant, aide courte, placeholder discret.
- Focus Gold visible ; erreur Danger avec texte explicite.
- Aucun fond vert en mode sombre hors succès métier.

## 9. Cartes financières

Variants préparés :

- `neutral` : solde indéterminé ou équilibre ;
- `positive` : crédit disponible ou état à jour ;
- `warning` : attention non destructive ;
- `danger` : montant dû ou dette ;
- `info` : échéance ou information contextuelle.

Le variant utilise une barre latérale, une icône et une couleur de texte contrôlée. La carte n’est pas entièrement remplie de rouge ou de vert.

Avant 6C, les cartes affichent **Disponible avec le suivi financier 6C**. Elles n’affichent jamais `0 XAF`.

Après 6C :

- dette : **Vous devez / Solde dû — 55 000 XAF** ;
- crédit : **Crédit disponible — 20 000 XAF** ;
- équilibre : **À jour — 0 XAF**.

Un nombre signé isolé, par exemple `-55 000`, est interdit.

## 10. Mode clair

- Fond page bleu-gris chaud, jamais une grande nappe blanche pure.
- Cartes ivoire très clair distinctes du fond.
- Champs et sous-cartes légèrement bleutés.
- Bordures atténuées et ombres diffuses.
- Ink porte les titres, Gold l’accent et Green seulement les succès.

## 11. Mode sombre

- Fond charbon bleu `#0C141E`.
- Surfaces `#141F2A`, `#1A2733` et `#22313E`.
- Sidebar et heroes Ink/Navy.
- Aucun panneau vert dominant.
- Gold reste ponctuel, Blue structure l’information, Green indique uniquement un état positif.

## 12. Navigation interne

- Sidebar desktop Ink/Navy conservée.
- Organization active compacte avec monogramme Gold.
- Destination active : fond Gold translucide et repère latéral.
- Icônes Lucide homogènes.
- Navigation mobile inchangée fonctionnellement et adaptée aux capacités du rôle.
- Aucun onglet, droit ou parcours métier supplémentaire.

## 13. Écrans et déploiement global

### Dashboard

- Hero Ink/Navy avec Organization active et CTA Gold ponctuel.
- Cartes de patrimoine issues uniquement des données réelles : Biens, Unités, Occupation, Locataires actifs.
- Cycle des Locations réel : actives, brouillons, terminées.
- Bloc de suivi financier 6C1 réel, soumis à `due.view`, sans revenu estimé ni paiement fabriqué.
- Salutation issue uniquement d’un prénom ou nom d’affichage propre ; fallback exact `Bonjour`, jamais un slug d’email ou identifiant interne.

### Dossier locataire

- Hero de dossier avec avatar initiales, identité, contacts autorisés, Location actuelle et statut.
- Sections Profil, Location actuelle, Historique, Paiements, Documents et Notes.
- Zone financière réelle séparant **Solde dû / À jour**, **Crédit disponible**, **Périodes couvertes** et **Prochaine échéance non couverte**.
- Les contacts et pièces restent filtrés par les permissions existantes.

### Détail Location

- Hero Unit / Property / Tenant / statut.
- Valeur dominante : **Montant mensuel total** ou **Total périodique**, toujours ventilé en loyer + charges et jamais présenté comme un crédit décroissant.
- Date limite et avis formulés naturellement avec la prochaine date calculée lorsqu’elle existe ; `J-X` reste dans la règle contractuelle, pas dans le hero.
- Loyer, charges, dépôt et prépaiement séparés.
- Informations complètes ; Échéances, Paiements, Documents et Activité restent explicitement futurs.
- Fin de Location conservée dans sa modale sécurisée existante.

### Écrans globalisés en v2B

- Biens : liste, création, détail, édition et Units contextuelles.
- Units : création contextuelle, détail et édition.
- Locataires : liste, création, dossier et édition.
- Locations : liste cartes/tableau, création, détail et édition brouillon.
- Équipe : invitation, membres, rôles, transfert Owner et audit.
- Profil / Paramètres : identité, préférences, Organization et sécurité PIN.
- Auth : connexion email, OTP alternatif, onboarding Organization et verrouillage PIN.
- Paiements, Activité et portail non encore réels : placeholders v2 explicites, sans chiffres fictifs.

## 14. Tables et listes

- Fond calme et carte élevée.
- Header compact mais lisible.
- Lignes espacées, hover subtil, séparation fine.
- Montants à droite en chiffres tabulaires.
- Badges sobres et limités.
- Sur mobile, une liste ou des cartes remplacent toujours le tableau horizontal lorsque nécessaire.

## 15. Accessibilité et motion

- Focus clavier global visible.
- Cibles tactiles de `44 px` minimum.
- États toujours textuels en plus de la couleur.
- Contrastes maintenus en clair et sombre.
- `prefers-reduced-motion` réduit toutes les animations et transitions à une durée quasi nulle.
- Micro-interactions uniquement : hover, focus, légère translation et apparition courte.

## 16. Portée de la version

v2B ne modifie aucun schéma, RLS, Auth, Membership, Tenant, Lease ou contrat métier. Elle ne crée ni Due, Payment, Ledger, Receipt, solde ou revenu.

Les données réelles restent utilisées pour Biens, Units, Locataires et Locations. Toute fonction future utilise une carte courte avec icône, statut **À venir** et lot de disponibilité explicite ; aucun grand rectangle gris ou chiffre fictif.

## 17. Extension financière Lot 6C1

- Le dossier locataire qualifie le montant principal en **Solde dû**, **Crédit disponible** ou **À jour** ; aucun signe comptable nu.
- Le détail Location affiche un tableau mobile des périodes, dates limites, loyer, charges, total, restant et statut.
- L’état de compte utilise une grille Ink/Navy, des montants tabulaires et des filtres période/type ; chaque ligne conserve date, opération, référence, débit, crédit, solde et période.
- Dette utilise le rouge sémantique ; crédit/couverture le vert ; Gold reste un accent de hiérarchie.
- `covered` signifie couvert par un crédit d’ouverture documenté et ne doit jamais être traduit visuellement par un faux paiement.
- Les rôles sans `due.view` ne reçoivent ni composant financier ni valeur masquée.
- Le même résumé financier réel est visible depuis le dossier Locataire et le détail Location, sans dupliquer ni recalculer la vérité 6C1 dans le client.

**Visual Direction v2B reste déployée et sa validation visuelle par Blaise est en attente. Le Lot 6C1 étend le système avec la vérité financière réelle, sans démarrer les paiements 6C2 ni le portail sécurisé 6E.**
