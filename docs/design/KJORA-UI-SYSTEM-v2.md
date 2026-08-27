# Kjora UI System v2

> Statut : **v2A PILOTE — Dashboard, dossier locataire et détail Location**
>
> Direction : **Horizon & héritage — immobilier africain premium, chaleureux, patrimonial et lisible**
>
> Portée actuelle : tokens globaux, navigation interne partagée et trois écrans pilotes. Le déploiement global v2B n’est pas commencé.

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
- Grande surface / hero : `26 px`.
- Carte standard : `22 px`.
- Champ et bouton : `15 px`.
- Petit bloc d’icône : `10–15 px`.
- Badge : pill.
- Ombre douce : `0 12px 34px` avec faible opacité.
- Ombre élevée : `0 18px 44px` pour un hero ou une carte interactive importante.
- Les bordures restent fines et secondaires ; aucun glassmorphism.

## 5. Iconographie

- Une seule famille : Lucide.
- Épaisseur standard : `1.8`.
- Taille courante : `18–22 px`.
- Les cartes importantes peuvent utiliser un petit bloc arrondi Ink, Blue, Gold ou neutre.
- Une icône n’est pas répétée sur chaque ligne si elle n’aide pas la lecture.

## 6. Boutons

- **Primary** : Ink/Navy. Une seule action dominante par vue.
- **Accent CTA** : Gold/Amber, réservé aux actions ponctuelles majeures.
- **Secondary** : surface neutre avec bordure subtile.
- **On dark** : surface translucide discrète sur hero bleu nuit.
- **Ghost** : navigation et actions secondaires.
- **Danger** : rouge uniquement, jamais l’accent Gold.
- Cible tactile minimale : `44 px`.
- Focus visible avec le token `focus`.

## 7. Champs

- Hauteur minimale `48 px`.
- Fond `surface`, légèrement teinté en clair et neutre bleu/charbon en sombre.
- Rayon `15 px`.
- Label persistant, aide courte, placeholder discret.
- Focus Gold visible ; erreur Danger avec texte explicite.
- Aucun fond vert en mode sombre hors succès métier.

## 8. Cartes financières

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

## 9. Mode clair

- Fond page bleu-gris chaud, jamais une grande nappe blanche pure.
- Cartes ivoire très clair distinctes du fond.
- Champs et sous-cartes légèrement bleutés.
- Bordures atténuées et ombres diffuses.
- Ink porte les titres, Gold l’accent et Green seulement les succès.

## 10. Mode sombre

- Fond charbon bleu `#0C141E`.
- Surfaces `#141F2A`, `#1A2733` et `#22313E`.
- Sidebar et heroes Ink/Navy.
- Aucun panneau vert dominant.
- Gold reste ponctuel, Blue structure l’information, Green indique uniquement un état positif.

## 11. Navigation interne

- Sidebar desktop Ink/Navy conservée.
- Organization active compacte avec monogramme Gold.
- Destination active : fond Gold translucide et repère latéral.
- Icônes Lucide homogènes.
- Navigation mobile inchangée fonctionnellement et adaptée aux capacités du rôle.
- Aucun onglet, droit ou parcours métier supplémentaire.

## 12. Écrans pilotes

### Dashboard

- Hero Ink/Navy avec Organization active et CTA Gold ponctuel.
- Cartes de patrimoine issues uniquement des données réelles : Biens, Unités, Occupation, Locataires actifs.
- Cycle des Locations réel : actives, brouillons, terminées.
- Bloc **Suivi financier bientôt disponible** sans revenu estimé.

### Dossier locataire

- Hero de dossier avec avatar initiales, identité, contacts autorisés, Location actuelle et statut.
- Sections Profil, Location actuelle, Historique, Paiements, Documents et Notes.
- Zone financière prête pour Solde actuel, Crédit disponible et Prochaine échéance, honnêtement indisponible avant 6C.
- Les contacts et pièces restent filtrés par les permissions existantes.

### Détail Location

- Hero Unit / Property / Tenant / statut.
- Valeurs dominantes : total périodique, jour limite, J-X.
- Loyer, charges, dépôt et prépaiement séparés.
- Informations complètes ; Échéances, Paiements, Documents et Activité restent explicitement futurs.
- Fin de Location conservée dans sa modale sécurisée existante.

## 13. Tables et listes

- Fond calme et carte élevée.
- Header compact mais lisible.
- Lignes espacées, hover subtil, séparation fine.
- Montants à droite en chiffres tabulaires.
- Badges sobres et limités.
- Sur mobile, une liste ou des cartes remplacent toujours le tableau horizontal lorsque nécessaire.

## 14. Accessibilité et motion

- Focus clavier global visible.
- Cibles tactiles de `44 px` minimum.
- États toujours textuels en plus de la couleur.
- Contrastes maintenus en clair et sombre.
- `prefers-reduced-motion` réduit toutes les animations et transitions à une durée quasi nulle.
- Micro-interactions uniquement : hover, focus, légère translation et apparition courte.

## 15. Portée de la version

v2A ne modifie aucun schéma, RLS, Auth, Membership, Tenant, Lease ou contrat métier. Elle ne crée ni Due, Payment, Ledger, Receipt, solde ou revenu.

Le déploiement global reste une étape séparée :

**Visual Direction v2B — déploiement global du design system**, seulement après validation visuelle de Blaise.

**v2B et 6C1 restent non commencés.**
