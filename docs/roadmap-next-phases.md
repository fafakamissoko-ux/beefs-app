# Phases suivantes (après 1 & 2 livrées)

## Phase 3 — Après le live (produit)

- **Replay / résumé** : carte ou page dédiée quand `status === 'ended'` (CTA clair, pas de badge « Suite » trompeur).
- **Notifications** : fiabiliser in-app + email pour beef suivi en live, invitations, retraits.
- **Découverte** : pagination feed, filtres sauvegardés.

## Phase 4 — Durcissement

- **Audit RLS** Supabase sur `transactions`, `users`, `gifts`, `beef_access`, messages.
- **Index SQL** pour requêtes feed / live à fort volume.
- **Accessibilité** : arène (vote, modales), paywall, formulaires.

## Phase 5 — Paiement & mobile

- **Stripe** : domaine vérifié, Apple Pay / wallets, parcours annulation.
- **PWA / Safari iOS** : tests caméra / micro / Daily.

## Option monitoring avancé

- `@sentry/nextjs` + `instrumentation.ts` pour erreurs **serveur** et source maps (en complément de `NEXT_PUBLIC_SENTRY_DSN` + `ClientMonitoring`).
