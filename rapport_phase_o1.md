# Rapport Phase O.1 — Architecture transactionnelle côté client

**Date :** 2026-07-03  
**Statut :** Implémenté (zéro modification UI)  
**Validation TS :** `npx tsc --noEmit` → **exit code 0**

---

## Fichiers créés

### 1. `lib/constants/gifts.ts`

Single Source of Truth du catalogue cadeaux arène (12 items).

- Export `GiftItem` (interface)
- Export `GIFT_CATALOG` (array constant)

Aligné sur le seed SQL `supabase_migrations/53_send_gift_rpc_gift_logs.sql`.

---

### 2. `lib/stores/walletStore.ts`

Store Zustand portefeuille Lingots avec Realtime Supabase.

| Méthode / état | Rôle |
|----------------|------|
| `balance` | Solde courant (`users.points`) |
| `isInitialized` | Flag post-fetch initial |
| `activeUserId` | Utilisateur abonné au channel |
| `channel` | Référence `RealtimeChannel` |
| `initialize(userId)` | Fetch initial + `postgres_changes` sur `users` (UPDATE, filtre `id=eq.{userId}`) |
| `cleanup()` | `removeChannel` + reset état |
| `optimisticDebit(amount)` | Débit optimiste avant RPC (retourne `false` si solde insuffisant) |
| `sync()` | Re-fetch manuel `users.points` |

**Non branché à l'UI** — prêt pour intégration future (`AuthContext`, arène, `/points`).

---

## Fichier modifié

### 3. `lib/supabase/client.ts`

Ajout au type `Database.public.Tables` :

- **`users`** — `Row` avec `id`, `username`, `points` (+ Insert/Update partiels)
- **`transactions`** — `Row` avec `id`, `user_id`, `type`, `amount`, `balance_after`, `created_at`

Les tables legacy (`rooms`, `challenger_queue`, `messages`, `gifts` room-based) sont conservées.

---

## Hors scope (intentionnel)

- Aucun remplacement du catalogue inline dans `TikTokStyleArena.tsx`
- Aucun appel à `useWalletStore.initialize()` dans les composants
- Aucun remplacement de `userPoints` local state / React Query wallet

Ces branchements seront traités en phase O.2+.

---

## Prochaines étapes suggérées (O.2)

1. Appeler `useWalletStore.initialize(user.id)` depuis `AuthProvider` (mount / auth change)
2. Remplacer le catalogue inline arène par `GIFT_CATALOG`
3. Remplacer `userPoints` / polling par `useWalletStore` + `optimisticDebit` avant `POST /api/gifts/send`
4. Étendre le stub `Database` (`gift_types`, `gifts`, `gift_logs`) si besoin

---

*Fin du rapport Phase O.1.*
