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

**Livré (v1)** :

- **Stripe Checkout** : `locale: 'fr'` ; commentaires sur Link / wallets (domaine vérifié côté Dashboard) ; `success_url` → `/live?purchase=success` et `cancel_url` → `/buy-points?purchase=cancelled` avec toasts côté client + nettoyage de l’URL.
- **PWA** : `theme_color` manifest aligné sur le layout ; **Web Share Target** : route `POST /share` (redirection vers `/` avec `shared=`) pour ne pas laisser le manifest pointer vers le vide.

**Reste** : vérification domaine / Apple Pay dans Stripe Dashboard ; tests réels Safari iOS (caméra, micro, Daily).

## Phase 6 — Sécurité (clôture, après le reste)

**Livré (v1)** — migration `31_phase6_rls_hardening.sql` :

- **`users`** : fonction `is_app_admin()` (SECURITY DEFINER) ; trigger `enforce_users_safe_self_update` (réinjecte les colonnes serveur depuis `OLD` pour le self-service — évite `OLD` dans les politiques RLS, peu portable) ; politiques UPDATE simples + admin `FOR ALL` pour le panel ; insertion initiale limitée.
- **`beef_access`** : suppression de la politique d’INSERT `WITH CHECK (true)` — écriture réservée au **service role** (API `beef/access`).
- **`notifications`** : INSERT limité à `auth.uid() = user_id` (les triggers SECURITY DEFINER continuent à ignorer le RLS).

**À valider en prod** : appliquer la migration sur le projet Supabase ; tester inscription, édition profil, achat points / accès beef, admin utilisateurs ; confirmer que les notifications système (DM, follow, etc.) arrivent toujours.

**Double contrôle** : relecture policies + API routes + usages client ; audit RLS sur tables restantes (`transactions` déjà en lecture seule côté user, etc.).

## Option monitoring avancé

- `@sentry/nextjs` + `instrumentation.ts` pour erreurs **serveur** et source maps (en complément de `NEXT_PUBLIC_SENTRY_DSN` + `ClientMonitoring`).
