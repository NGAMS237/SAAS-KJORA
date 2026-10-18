# KJORA — Gate B Supabase

Migration candidate unique : `20261017120000_paid_pilot_production_readiness_11.sql`.

## Préflight en lecture seule

- projet attendu `alvheiwlfzuefljcfrtv`, état `ACTIVE_HEALTHY`;
- migration absente exactement une fois;
- compteurs Organizations, memberships, abonnements, factures, intentions et webhooks consignés sans donnée personnelle;
- sauvegarde fraîche et procédure de restauration vérifiée;
- aucune divergence non expliquée entre migrations Git et historique distant.

## Application autorisée

Appliquer uniquement le fichier ci-dessus, jamais `supabase db push` global et jamais `db reset`. Contrôler l’allowlist default-deny, les nouveaux champs de synchronisation, l’index facture fournisseur, les RPC et leurs grants.

## Postflight

- migration présente exactement une fois;
- données métier et devises immobilières inchangées;
- `PUBLIC`/`anon` sans exécution des RPC sensibles;
- `process_stripe_event_v2` exécutable uniquement par `service_role`;
- Owner invité + `billing.manage` requis en Live;
- suite pgTAP et advisors relancés;
- compteurs avant/après identiques hors objets de schéma.

Au 17 octobre 2026, cette gate n’a pas été exécutée. Aucun changement distant n’a été effectué par le lot local.
