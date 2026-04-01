# Phases suivantes (après 1 & 2 livrées)

## Phase 3 — Après le live (produit)

**Livré (v1)** :

- **Replay / résumé** : page `/beef/[id]/summary` pour `ended` / `replay` / `cancelled` ; feed et toasts « beef terminé » y pointent ; lien depuis l’écran arène terminé ; notification navigateur quand un beef passe en `ended`.
- **Découverte** : bouton « Charger plus » sur le feed (fenêtre glissante `limit`) ; filtres (onglet Pour vous / Abonnements, statut, tags) persistés dans `localStorage` (`beefs_feed_filters_v1`).

**Reste / évolutions** :

- **Notifications** : email, invitations, retraits (hors scope de cette itération).

## Phase 4 — Durcissement

- **Audit RLS** Supabase sur `transactions`, `users`, `gifts`, `beef_access`, messages.
- **Index SQL** pour requêtes feed / live à fort volume.
- **Accessibilité** : arène (vote, modales), paywall, formulaires.

## Phase 5 — Paiement & mobile

- **Stripe** : domaine vérifié, Apple Pay / wallets, parcours annulation.
- **PWA / Safari iOS** : tests caméra / micro / Daily.

## Option monitoring avancé

- `@sentry/nextjs` + `instrumentation.ts` pour erreurs **serveur** et source maps (en complément de `NEXT_PUBLIC_SENTRY_DSN` + `ClientMonitoring`).
