# Phases suivantes (après 1 & 2 livrées)

## Phase 3 — Après le live (produit)

**Livré (v1)** :

- **Replay / résumé** : page `/beef/[id]/summary` pour `ended` / `replay` / `cancelled` ; feed et toasts « beef terminé » y pointent ; lien depuis l’écran arène terminé ; notification navigateur quand un beef passe en `ended`.
- **Découverte** : bouton « Charger plus » sur le feed (fenêtre glissante `limit`) ; filtres (onglet Pour vous / Abonnements, statut, tags) persistés dans `localStorage` (`beefs_feed_filters_v1`).

**Reste / évolutions** :

- **Notifications** : email, invitations, retraits (hors scope de cette itération).

## Ordre recommandé (sécurité en dernier)

Les évolutions produit et perf (index, accessibilité, paiement, PWA, etc.) sont faites **en premier**.  
**En dernier** : passage **RLS + audit sécurité complet** de l’app (double contrôle une fois les implémentations stabilisées), pour valider policies cohérentes avec le code final et le moindre privilège.

## Phase 4 — Durcissement (hors RLS)

**Livré (v1)** :

- **Index SQL** : migration `30_phase4_feed_and_search_indexes.sql` — `beefs` (created_at, status+created_at, live+viewer_count), recherche `pg_trgm` sur titre beef + username / display_name users.
- **Accessibilité** : arène — paywall / fin de beef en `role="dialog"`, votes et micro/cam avec `aria-label`, chat (label saisie, envoi au clavier), réactions / cadeaux / cœur ; création beef — `htmlFor` / `id` titre et description.

**Poursuite possible** : autres formulaires (settings, login), focus piégé dans les modales, tests lecteurs d’écran.

## Phase 5 — Paiement & mobile

- **Stripe** : domaine vérifié, Apple Pay / wallets, parcours annulation.
- **PWA / Safari iOS** : tests caméra / micro / Daily.

## Phase 6 — Sécurité (clôture, après le reste)

- **Audit RLS** Supabase : `transactions`, `users`, `gifts`, `beef_access`, messages, et tables touchées par les livrables récents.
- **Double contrôle** : relecture policies + API routes + usages client ; checklist de non-régression sécurité sur l’ensemble de l’app.

## Option monitoring avancé

- `@sentry/nextjs` + `instrumentation.ts` pour erreurs **serveur** et source maps (en complément de `NEXT_PUBLIC_SENTRY_DSN` + `ClientMonitoring`).
