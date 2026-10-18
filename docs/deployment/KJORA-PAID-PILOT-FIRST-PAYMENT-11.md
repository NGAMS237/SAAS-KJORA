# KJORA — Checklist du premier paiement Live

Cette checklist décrit une action financière réelle. Elle relève de la Gate D et ne doit pas être exécutée sans autorisation explicite.

- [ ] Organization pilote explicitement approuvée, active, Owner vérifié.
- [ ] Contrat commercial et conditions d’abonnement acceptés.
- [ ] Plan, cycle, montant CAD et taxes éventuelles confirmés avec Blaise.
- [ ] Migration 11 appliquée et pgTAP distant vert.
- [ ] Catalogue et webhook Live audités en lecture seule.
- [ ] Variables Hostinger Live complètes ; aucune variable Test active.
- [ ] Coupe-circuits testés et fenêtre d’intervention planifiée.
- [ ] Checkout affiche le bon produit, la bonne cadence et le bon montant avant saisie.
- [ ] Blaise saisit lui-même les données de paiement sur Stripe.
- [ ] `checkout.session.completed` reçu, puis `invoice.paid` reçu et traité une fois.
- [ ] Facture SaaS KJORA créée avec `generation_source=provider`; aucune écriture dans les loyers.
- [ ] Abonnement et entitlement activés uniquement après événement vérifié.
- [ ] Portail client ouvert ; résiliation testée seulement si Blaise la confirme.
- [ ] Rejeu du webhook sans deuxième facture ni deuxième transition.
- [ ] Journaux sans carte, secret, email complet ou payload sensible.

Avant Stripe Live public : revue juridique/fiscale des taxes, remboursement, rétractation, facture, droit applicable et litiges — **À VALIDER PAR BLAISE et le conseil juridique**.
