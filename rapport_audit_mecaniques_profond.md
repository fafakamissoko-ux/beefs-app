# Rapport d'audit clinique — 10 mécaniques clés

**Date :** 2026-05-31  
**Périmètre :** `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase_migrations/`  
**Mode :** lecture seule — aucune modification de code  
**Objectif :** état des lieux avant refonte des modules Arène et Feed

---

## Synthèse exécutive

| # | Mécanique | Statut | Risque refonte |
|---|-----------|--------|----------------|
| 1 | Lingots (gifts / achats) | **[OPÉRATIONNEL]** | Moyen — drift migrations SQL |
| 2 | Étincelles / Sparks | **[PARTIEL / STUB]** | Élevé — systèmes parallèles, RPC orphelines |
| 3 | Indice de Sagesse | **[PARTIEL / STUB]** | Moyen — formule ≠ spec, profil public absent |
| 4 | Call Out | **[OPÉRATIONNEL]** | Faible — flux complet, dettes UX mineures |
| 5 | Halo vs Grille (layout arène) | **[OPÉRATIONNEL]** | Faible — 100 % client, bien isolé |
| 6 | Vote du public | **[PARTIEL / STUB]** | Élevé — pas de vote persisté / jury |
| 7 | Lever la main | **[PARTIEL / STUB]** | Élevé — API OK, bouton UI absent |
| 8 | Pouvoirs du Ref | **[OPÉRATIONNEL]** | Faible — ban Ref absent |
| 9 | Filtres Feed | **[PARTIEL / STUB]** | Moyen — libellés ≠ spec, pas de Replay |
| 10 | Swipes Feed | **[PARTIEL / STUB]** | Élevé — pas de gesture TikTok |

**Hubs monolithiques identifiés :**
- Arène live : `components/TikTokStyleArena.tsx` (~4 000 lignes)
- Feed home : `app/feed/page.tsx` (~1 250 lignes)

---

## 1. L'ÉCONOMIE

### 1.1 Lingots (Gamification & Monétisation)

**Statut : [OPÉRATIONNEL]**

| Couche | Fichiers clés |
|--------|---------------|
| **Achat Stripe** | `app/buy-points/page.tsx`, `app/api/stripe/checkout/route.ts`, `app/api/stripe/webhook/route.ts`, `lib/stripe/client.ts` (`POINT_PACKS`) |
| **Envoi cadeaux live** | `components/TikTokStyleArena.tsx` → `POST /api/gifts/send` → `app/api/gifts/send/route.ts` |
| **Solde / historique** | `app/points/page.tsx`, `app/settings/page.tsx`, `components/Header.tsx` (polling solde) |
| **Retraits** | `components/settings/WithdrawalWizard.tsx`, `app/api/withdrawals/*` |
| **Animations UI** | `components/Arena/FullscreenGiftAnimation.tsx` |
| **SQL — tables** | `users.points`, `transactions`, `gift_types`, `gifts`, `gift_logs`, `withdrawal_requests` — `supabase_migrations/05_monetization_gamification.sql` |
| **SQL — RPCs** | `update_user_balance`, `send_gift` — `05_…`, `53_send_gift_rpc_gift_logs.sql`, refonte `supabase/migrations/99_aura_absolute_economy.sql`, split `100_gift_split.sql` |
| **Archive (obsolète)** | `components/_archive/GiftSystem.tsx` |

**Flux connectés :**
1. **Achat** : Stripe Checkout → webhook → RPC `update_user_balance` → crédit `users.points`.
2. **Cadeau arène** : UI arène → API route (service role) → RPC `send_gift` → débit émetteur, crédit destinataire, logs `gifts` / `gift_logs`.

**Alertes :**
- **Drift migrations** : deux versions de `send_gift` coexistent (`53` : 100 % médiateur ; `100` : split 70/30, clé JSON `newBalance` vs `new_balance`). Risque d'écart prod vs repo.
- **`99_aura_absolute_economy.sql`** : chaque mouvement Lingot augmente aussi `lifetime_points` — mélange économie dépensable / prestige.
- **`distribute_gift_revenue`** (70 % médiateur) définie en SQL mais **jamais appelée** par l'app.
- Double arbre migrations (`supabase_migrations/` vs `supabase/migrations/`) à harmoniser avant refonte.

---

### 1.2 Étincelles / Sparks (Like live & prestige)

**Statut : [PARTIEL / STUB]**

Le projet mélange **plusieurs systèmes parallèles** sous le label « Aura ».

| Sous-système | Fichiers | Connexion DB | Statut |
|--------------|----------|--------------|--------|
| **Like beef feed** | `app/feed/page.tsx` (`handleAuraClick`), `components/BeefCard.tsx` | `beef_likes` + trigger `trg_beef_likes_aura` (`57_beef_likes_aura_trigger.sql`) | ✅ Connecté |
| **Like teaser** | `app/feed/page.tsx` (`handleTeaserAuraClick`) | `teaser_likes` + trigger (`58_teaser_likes_teaser_score.sql`) | ✅ Connecté |
| **Follow (+10/−10 prestige)** | `components/FollowButton.tsx`, `app/profile/[username]/page.tsx` | trigger sur `followers` (`54_radar_aura_dynamic.sql`) | ✅ Connecté |
| **Étincelle profil (`transmit_aura`)** | RPC `transmit_aura`, table `aura_sparks` (`54_…`) | Notifications lues dans `app/notifications/page.tsx` | ❌ **Aucun appel frontend** |
| **Donateurs universels** | `components/InlineAuraGivers.tsx`, `components/AuraGiversModal.tsx` | RPC `get_universal_aura_givers` | ⚠️ **RPC absente du repo SQL** |
| **Likes commentaires** | `components/CommentsDrawer.tsx` | table `beef_comment_likes` | ⚠️ **Aucune migration trouvée** |
| **Tap arène live** | `components/TikTokStyleArena.tsx` (compteurs `auras`, `auraMed`, buffer broadcast) | insert `beef_reactions` (analytics) | ❌ **Local only** — pas de `lifetime_points` |
| **Prestige beef (triggers)** | `supabase/migrations/101_…`, `102_…` | `prestige_ledger`, `adjust_prestige_aura` | ✅ Backend seul (volontaire) |

**Alertes :**
- **Sécurité sémantique** : le trigger `beef_likes` crédite à la fois `lifetime_points` **et** `points` (Lingots) — conflit avec la séparation prestige/solde visée par migration 99.
- **`transmit_aura`** : RPC prête, UI jamais câblée → mécanique « étincelle profil » = stub.
- **`get_universal_aura_givers`** : appelée en prod potentielle, SQL non versionné → risque 404 RPC.
- **Arène live** : tap support / réactions = pure UI temps réel + broadcast Supabase ; pas de transfert prestige persistant.

---

### 1.3 Indice de Sagesse

**Statut : [PARTIEL / STUB]**

| Couche | Fichiers clés |
|--------|---------------|
| **Écriture statut résolution** | `app/api/beef/manage/route.ts` (`resolutionFromEndReason`) → `beefs.resolution_status` |
| **Classification affichage** | `lib/mediation-resolution.ts` (`mediationCategoryForBeef`) |
| **Labels UI** | `lib/mediation-outcome-labels.ts` |
| **Calcul stats client** | `app/profile/ProfileContent.tsx` (compteurs `beefs_resolved`, `beefs_abandoned`, `beefs_hosted`) |
| **Édition médiateur** | `components/MediationBeefEditorPanel.tsx` |
| **SQL** | Colonne `beefs.resolution_status` — `supabase_migrations/init.sql`, migration 10 |

**Formule implémentée (≠ spec demandée) :**

```
Indice de Sagesse = (beefs_resolved / beefs_hosted) × 100
```

- Affiché uniquement si `beefs_resolved >= 3`.
- Visible **uniquement dans la modale preview privée** (`ProfileContent.tsx` L841–847).
- **Absent** du profil public (`app/profile/[username]/page.tsx`, `components/profile/ProfileHeader.tsx`).
- `beefs_abandoned` est compté et affiché en tuile « Désertions » mais **n'entre pas** dans l'Indice.
- Pas de RPC/vue SQL dédiée — calcul 100 % client à partir des beefs médiés chargés.

**Alertes :**
- Spec audit : `resolved / abandoned` → **non implémentée**.
- Données historiques sans `resolution_status` classées « abandoned » par défaut (`mediation-resolution.ts` L29–30) — peut fausser les ratios.
- Pas de persistance serveur du score → recalcul à chaque chargement profil.

---

## 2. L'ARÈNE (Live / WebRTC)

### 2.1 Le Call Out (invitation / défi vers session Live)

**Statut : [OPÉRATIONNEL]**

| Étape | Fichiers |
|-------|----------|
| Création | `app/create/page.tsx` → `components/CreateBeefForm.tsx` → `lib/submitNewBeef.ts` |
| DB | insert `beefs` + `beef_participants` (`invite_status: pending`) + `beef_invitations` |
| Notifications | trigger `trigger_notify_beef_invitation` sur `beef_invitations` INSERT |
| Réception | `app/invitations/page.tsx`, `components/GlobalDuelAmbush.tsx`, badge `components/Header.tsx` |
| Acceptation | update invitations/participants → redirect `/arena/{beefId}` ; trigger `update_beef_status_on_acceptance` |
| Feed CTA | `components/BeefCard.tsx` |
| Invite Ref live | `app/api/beef/manage/route.ts` (`INVITE_PARTICIPANT`), `lib/beef-manage-client.ts` |

**Tables / triggers :** `beefs`, `beef_participants`, `beef_invitations`, `notifications` — schéma `supabase_migrations/init.sql`.

**Alertes (UX, non bloquantes) :**
- Pas de route API dédiée « call out » — tout passe par insert client + RLS + triggers.
- `invite_type` (`combatant` / `ref_request` / `ref_offer`) utilisé dans `GlobalDuelAmbush.tsx` **sans colonne SQL** dans les migrations → fallback `'combatant'`.
- Expiration silencieuse (`expires_at`) vs participants encore `pending`.
- Convocations filtrées sur `beef_invitations` uniquement (pas de fallback `beef_participants.pending`).

---

### 2.2 Mode Halo vs Grille (layout arène)

**Statut : [OPÉRATIONNEL]**

| Terme audit | Équivalent code |
|-------------|-----------------|
| **Grille** | **`nexus`** — grille CSS (`NexusGrid`) |
| **Halo / orbite** | **`constellation`** — orbites autour du médiateur (`ConstellationOrbit`) |

| Fichier | Rôle |
|---------|------|
| `lib/arena-layout-mode.ts` | `ArenaLayoutMode = 'nexus' \| 'constellation'` ; `resolveArenaLayoutMode()` |
| `components/Arena/ArenaLayoutManager.tsx` | Orchestrateur layout |
| `components/Arena/nexus/NexusGrid.tsx`, `nexusGridTemplates.ts` | Mode grille |
| `components/Arena/constellation/ConstellationOrbit.tsx`, `orbitGeometry.ts` | Mode orbite |
| `components/Arena/useArenaLayoutTiles.ts`, `types.ts` | Slots / tuiles |
| `components/Arena/shared/ArenaVideoSurface.tsx`, `MediatorOrb.tsx` | Surfaces vidéo |
| `components/TikTokStyleArena.tsx` | Consommateur via `ArenaLayoutManager` |

**Règle de bascule :** `nexus` si `effectiveVideoCount === expectedCount` ; sinon `constellation` (participants manquants / grâce bootstrap 1,5 s).

**Backend :** aucune table/RPC — layout 100 % client (Daily tracks + `beef_participants`).

**Alertes :**
- Terminologie « halo » ≠ nom de code ; confusion possible avec `MediatorSupportHalo.tsx` (support aura) et `ChallengerSupportHalo.tsx` (**défini mais jamais importé** — code mort).
- Fichiers Arena en cours de modification locale non commités (`types.ts`, `useArenaLayoutTiles.ts`) — vérifier cohérence avant refonte.

---

### 2.3 Le Vote du public

**Statut : [PARTIEL / STUB]**

Il n'existe **pas** de table `beef_votes`, poll persisté, ni jury public en base.

| Mécanisme existant | Fichiers | Persisté ? |
|--------------------|----------|------------|
| Tap panneau challenger | `TikTokStyleArena.tsx` → `emitTapSupport` / `preferSide` | ❌ Local + broadcast `aura_batch` |
| Réactions emoji (❤️ 🔥 👍) | `handleReaction` → insert `beef_reactions` | ⚠️ Analytics seulement |
| Pulse voice A vs B | `lib/stores/arenaPulseVoicesStore.ts`, `hooks/useArenaRealtime.ts` | ❌ **`handlePulseVoice` jamais branché à l'UI** |
| Verdict Ref (médiateur) | `handleMediatorVerdict` → `END_BEEF` | ✅ Médiateur, pas jury public |
| Poll archivé | `components/_archive/LivePoll.tsx` | ❌ Non utilisé |
| Notation post-beef | `app/beef/[id]/summary/page.tsx` → `mediator_viewer_reviews` | ⚠️ Note médiateur, pas vote challengers |

**Ce que ça déclenche en live :** aura visuelle, heat index, flying reactions, sync broadcast canal `live_{roomId}`. Fin de beef : résumé `resonanceA`–`F` dans overlay (`TikTokStyleArena.tsx` ~L3237). Commentaire explicite dans le code : « pas de compteur de votes ».

**Alertes :**
- **Pas de vote unique par utilisateur**, pas de jury, pas de poll serveur.
- `myVote` = préférence locale pour cibler réactions, pas enregistrement serveur.
- Réactions intégrées ne broadcastent pas toujours `supportSlot` (local seulement pour ❤️/👍).
- Refonte Feed/Arène : décider si « vote populaire » (marketing onboarding slide 3) = nouvelle feature ou rebranding de l'aura tap.

---

### 2.4 Lever la main (Raise Hand)

**Statut : [PARTIEL / STUB]**

| Couche | Fichiers | État |
|--------|----------|------|
| **API spectateur** | `app/api/beef/raise-hand/route.ts` | ✅ Opérationnel — upsert `beef_participants` (`is_main: false`, `invite_status: pending`) |
| **Handler arène** | `components/TikTokStyleArena.tsx` L1627 (`handleRaiseHand`) | ❌ **Défini mais jamais appelé** — aucun bouton JSX |
| **File Ref** | `components/MediatorSidebar.tsx` (Accepter / Refuser) | ✅ Connecté |
| **API manage** | `app/api/beef/manage/route.ts` (`ACCEPT_PARTICIPANT`, `REMOVE_PARTICIPANT`) | ✅ Opérationnel |
| **Realtime** | `hooks/useArenaRealtime.ts` (postgres_changes + `spectator_invite_sync`) | ✅ Opérationnel |
| **RLS** | `supabase_migrations/51_nuke_and_reset_rls_beef_participants.sql` (`bp_insert_self_raisehand`) | ✅ |
| **WebRTC post-accept** | `app/api/beef/access/route.ts` → ticket Daily `participant` | ✅ |

**États morts dans `TikTokStyleArena.tsx` :** `participationRequests`, `ringParticipants`, `acceptRequest` — jamais alimentés.

**Alertes :**
- **Gap critique refonte Arène** : backend + file Ref prêts ; il manque uniquement le CTA spectateur « Lever la main ».
- Limité au beef **`live`** (pas en salle d'attente `pending`/`ready`).
- Pas de table `speaker_queue` dédiée — file = lignes `beef_participants.pending`.

---

### 2.5 Les Pouvoirs du Ref (mute / kick / ban)

**Statut : [OPÉRATIONNEL]** *(ban Ref : **[MANQUANT]**)*

| Pouvoir | Implémentation | Fichiers |
|---------|----------------|----------|
| **Mute challenger** | Daily `setAudio(false)` + broadcast `mediator_mute_challenger` | `hooks/useDailyMeetingEngine.ts`, `TikTokStyleArena.tsx`, `MediatorSidebar.tsx`, `useArenaRealtime.ts` |
| **Mute all** | `handleMuteAll` | idem |
| **Kick / eject** | Daily `ejectRemoteParticipant` + `REMOVE_PARTICIPANT` (`removeKind: 'kick'`) → delete DB | `app/api/beef/manage/route.ts` L181–220 |
| **Refus file d'attente** | `REMOVE_PARTICIPANT` (`removeKind: 'decline'`) → `invite_status: declined` | idem |
| **Ban participant Ref** | — | **[MANQUANT]** en contexte live |
| **Ban plateforme** | Admin only | `app/api/admin/users/moderation/route.ts`, `users.is_banned` |

**Autres pouvoirs Ref (contexte) :** démarrer/terminer beef, verdict, chrono, hot mic, invite participant — `manage/route.ts` + `MediatorSidebar.tsx`.

**Alertes :**
- Médiateur doit être **owner token Daily** (`is_owner` dans `access/route.ts`) pour mute/eject efficaces.
- Kick = eject Daily + delete DB ; pas de blocage reconnexion explicite.
- Archive : `components/_archive/MultiParticipantGrid.tsx` (UI mute grid legacy).

---

## 3. LE FEED (Navigation)

### 3.1 Filtres (En cours / À venir / Replay)

**Statut : [PARTIEL / STUB]**

| Spec audit | Implémenté | Match |
|------------|------------|-------|
| En cours | **Live** (`status = 'live'`) | Partiel (libellé différent) |
| À venir | **À venir** (`scheduled` + `pending` + filtre date client) | ✅ |
| Replay | **Terminés** (`status = 'ended'` seulement) | ❌ `replay` / `completed` exclus |

**Fichier unique :** `app/feed/page.tsx`

```typescript
const STATUS_FILTERS = [
  { id: 'all', label: 'Tous statuts' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'À venir' },
  { id: 'ended', label: 'Terminés' },
];
```

**Requête Supabase (`loadBeefs`) :**
- Direct `.from('beefs').select('*')` — **pas de RPC `get_feed`**.
- Tri : `feed_position DESC`, `created_at DESC`, limit 20 + « Charger plus ».
- Filtres additionnels : `feedType` (pour-vous / abonnements / manifestes), tags (client-side), persistance `localStorage` (`beefs_feed_filters_v1`).
- Realtime : canal `beefs_changes`, debounce 1,5 s → refetch.
- Tri client « Pour toi » : `compareArenaOrder` (Live → à venir → terminés).

**Fichiers connexes :**
- `components/BeefCard.tsx` — badges `LIVE`, `REPLAY`, `À VENIR`
- `app/live/page.tsx` — route parallèle hardcodée `status=live` (auth requise)
- `supabase_migrations/30_phase4_feed_and_search_indexes.sql` — index `(status, created_at DESC)`

**Alertes :**
- **Pas de filtre « Replay »** dédié malgré statut DB `replay` existant.
- Filtre « Tous statuts » inclut `pending`, `ready`, `cancelled` sans distinction UX.
- Abonnements / tags filtrés **côté client** après fetch — risque de pages vides.
- « En cours » existe ailleurs (`ProfileContent.tsx` onglet profil) — sémantique divergente du feed.

---

### 3.2 Les Swipes (navigation beef suivant)

**Statut : [PARTIEL / STUB]**

| Attendu | Trouvé |
|---------|--------|
| Lib Swiper / gesture drag | **Aucune** dépendance (`package.json` : pas de `swiper`, `embla`, `react-swipeable`) |
| Swipe vertical TikTok | **Absent** |
| Scroll-snap CSS | **Partiel** — mode `list` mobile uniquement (`snap-y snap-mandatory`) |
| Mode par défaut mobile | **`grid`** (2 colonnes, scroll classique, pas de snap) |

**Fichiers clés :**
- `app/feed/page.tsx` — toggle Grid/List, `#feed-scroll-container`, `IntersectionObserver` pour virtualisation vidéo
- `components/BeefCard.tsx` — `<video autoPlay>` si `isActiveVideo`
- `feed_phase1_report.md` — doc virtualisation (1 seule vidéo active)

**Comportement actuel :**
- Navigation = scroll manuel ou bouton « Charger plus ».
- `framer-motion` sur le feed = chips tags, FAB, modales — **pas de drag feed**.
- Desktop : `md:snap-none` + grille multi-colonnes.
- Pas de prefetch du beef adjacent.

**Alertes :**
- Expérience Reels/TikTok **non implémentée** — refonte Feed devra choisir entre scroll-snap CSS amélioré vs lib gesture dédiée.
- Scroll restoration basé sur `window`, pas `#feed-scroll-container` (gap UX documenté).

---

## Cartographie des dépendances critiques (refonte)

```
┌─────────────────────────────────────────────────────────────┐
│                        FEED                                  │
│  app/feed/page.tsx ──► beefs (direct query)                 │
│       │                                                      │
│       ├── BeefCard.tsx (likes → beef_likes trigger)         │
│       └── realtime beefs_changes                            │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                       ARÈNE LIVE                             │
│  TikTokStyleArena.tsx (monolithe)                           │
│       │                                                      │
│       ├── ArenaLayoutManager (nexus / constellation)        │
│       ├── useDailyMeetingEngine (WebRTC mute/eject)         │
│       ├── useArenaRealtime (broadcast live_{roomId})        │
│       ├── MediatorSidebar (Ref UI)                          │
│       ├── /api/gifts/send (Lingots)                         │
│       ├── /api/beef/manage (verdict, kick, invite)          │
│       └── /api/beef/raise-hand (ORPHELIN côté UI)           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                      ÉCONOMIE / AURA                         │
│  users.points ←→ send_gift / update_user_balance            │
│  users.lifetime_points ← triggers multiples (conflits)      │
│  prestige_ledger ← adjust_prestige_aura (triggers beef)     │
│  aura_sparks ← transmit_aura (RPC ORPHELINE frontend)       │
└─────────────────────────────────────────────────────────────┘
```

---

## Recommandations pré-refonte (priorisées)

| Priorité | Action | Mécaniques impactées |
|----------|--------|----------------------|
| P0 | Brancher bouton « Lever la main » → `handleRaiseHand` | Raise Hand |
| P0 | Versionner / créer RPC `get_universal_aura_givers` + migration `beef_comment_likes` | Sparks |
| P1 | Harmoniser migrations `send_gift` (53 vs 100) et séparer Lingots / prestige (99) | Lingots, Sparks |
| P1 | Décider spec « Vote populaire » : aura tap vs poll persisté | Vote public |
| P1 | Aligner filtres feed : Replay, libellé En cours, RPC feed optionnelle | Feed |
| P2 | Câbler `transmit_aura` ou retirer RPC morte | Sparks |
| P2 | Exposer Indice de Sagesse profil public + formule `resolved/abandoned` | Sagesse |
| P2 | Supprimer code mort : `ChallengerSupportHalo`, `LivePoll`, états queue arène | Layout, Vote, Raise Hand |
| P3 | Évaluer extraction `TikTokStyleArena.tsx` + `app/feed/page.tsx` en modules | Tous |

---

## Méthodologie

- Scan grep + lecture ciblée sur `app/`, `components/`, `lib/`, `supabase/migrations/`, `supabase_migrations/`.
- Vérification croisée des RPC appelées en TS vs définies en SQL.
- Traçage des handlers définis vs branchés en JSX (`handleRaiseHand`, `handlePulseVoice`, `transmit_aura`).
- Aucune modification de code effectuée.

**Prochaine étape suggérée :** valider avec l'Architecte la spec cible (vote, sagesse, filtres Replay) avant découpage des modules Arène / Feed.
