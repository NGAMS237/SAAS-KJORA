# KJORA — Identité juridique, marque et produit v0.1

**Statut :** CANONIQUE — référence unique pour le site, l'application, les contrats, la facturation SaaS, les emails, le support et les pages légales
**Date :** 2026-09-08
**Source technique :** `src/core/legal/legal-facts.ts`
**Décision :** D-143

---

## 1. Hiérarchie

```
VERALUZ SARL          entité juridique — éditeur du service
   └── KJEMO Studios   activité / marque numérique et SaaS de VERALUZ SARL
          └── KJORA    produit SaaS développé et exploité par KJEMO Studios
```

**Formulation de référence, à réutiliser telle quelle :**

> KJORA est un logiciel SaaS développé et exploité par KJEMO Studios, activité numérique et SaaS de VERALUZ SARL.

---

## 2. Éditeur — VERALUZ SARL

| Champ | Valeur |
|---|---|
| Dénomination sociale | STE VERALUZ SARL |
| Forme juridique | Société à responsabilité limitée pluripersonnelle (SARL) |
| Capital social | 900 000 FCFA |
| NIU | M062618820539S |
| RCCM | CM-NSI-02-2026-B12-00615 |
| Date d'immatriculation | 29/06/2026 |
| Durée | 99 ans |
| Siège social | Yaoundé, AWAE – ESCALIER, Cameroun |

Le siège social est celui du RCCM. Il ne doit jamais être remplacé par une adresse bancaire, fiscale ou opérationnelle différente.

---

## 3. Marque — KJEMO Studios

KJEMO Studios est **une activité et une marque de VERALUZ SARL**, dédiée au développement logiciel, aux solutions SaaS, aux services numériques et à l'accompagnement informatique.

KJEMO Studios **n'a pas** :

- de personnalité morale distincte ;
- de RCCM propre ;
- de NIU propre ;
- de capital propre ;
- de siège légal autonome.

En l'absence de preuve documentaire d'une immatriculation séparée, ces éléments ne doivent jamais lui être attribués.

---

## 4. Produit — KJORA

KJORA est le produit SaaS de gestion locative développé et exploité par KJEMO Studios. L'éditeur juridique du service reste VERALUZ SARL.

---

## 5. Vocabulaire imposé

**À utiliser :**

- « Éditeur du service : VERALUZ SARL »
- « KJEMO Studios, activité numérique et SaaS de VERALUZ SARL »
- « KJORA, produit SaaS développé et exploité par KJEMO Studios »

**À proscrire :**

| Interdit | Raison |
|---|---|
| « KJEMO Studios SARL » | Attribue une forme juridique inexistante |
| « filiale » | Aucun statut juridique séparé ne l'établit |
| « sous-entreprise » | Terme non juridique, à bannir des mentions publiques |
| « groupe » | La structure n'est pas juridiquement constituée en groupe |
| « division » dans un sens juridique | Acceptable en langage commercial, jamais en mention légale |

---

## 6. Données à ne jamais publier

Coordonnées bancaires, IBAN, numéros de compte, données personnelles des associés, dates de naissance, numéros de pièces d'identité, signatures, et toute donnée privée non nécessaire à l'information légale du public.

---

## 7. Éléments encore soumis à revue juridique

Ces points portent la mention `LEGAL REVIEW REQUIRED` et bloquent une ouverture commerciale au public :

- Directeur de la publication
- Délégué à la protection des données, si applicable
- Droits des personnes selon les juridictions concernées (Cameroun et diaspora)
- Matrice de conservation légale par type de document et par juridiction
- Clauses contractuelles applicables au service
- Politique de confidentialité définitive
- Conditions générales d'utilisation
- Conditions générales de vente

Aucune conformité réglementaire n'est revendiquée. Aucune certification n'est détenue : ni SOC 2, ni ISO 27001, ni HDS, ni aucune autre.

---

## 8. Portée

Cette hiérarchie fait référence pour le site commercial, l'application, les contrats, la facturation SaaS, les emails, le support et les pages légales. Toute divergence constatée doit être corrigée vers ce document, et non l'inverse.

Implémentation : `src/core/legal/legal-facts.ts` est la source unique côté code ; les pages `/mentions-legales`, `/confidentialite` et `/securite` en dérivent, ainsi que le footer public.
