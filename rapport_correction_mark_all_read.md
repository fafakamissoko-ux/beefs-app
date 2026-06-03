# Rapport Phase 7.3 — Mark all read unifié (Optimistic UI)

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_mark_all_read.md`  
**Fichier modifié :** `app/notifications/page.tsx`  
**Prérequis DB :** `aura_sparks.is_read` + RPC `mark_all_notifications_read` étendu (Architecte)  
**Statut :** ✅ optimistic UI unifiée déployée

---

## Synthèse

| Flux | Backend (RPC) | Optimistic UI client |
|------|---------------|----------------------|
| `notifications` | `UPDATE is_read = true` | `setNotifications` → tous `is_read: true` |
| `aura_sparks` | `UPDATE is_read = true` (via RPC étendu) | `setAuraNotifications` → tous `is_read: true` |

---

## Changements `markAllRead`

1. Appel RPC `mark_all_notifications_read` (deux tables côté serveur).
2. Fallback client inchangé sur `notifications` si RPC échoue.
3. **Double optimistic update** :
   ```typescript
   setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
   setAuraNotifications((prev) => prev.map((a) => ({ ...a, is_read: true })));
   ```
4. Toast succès : « Toutes les notifications ont été marquées comme lues ».
5. `beefs:badges-refresh` → Header refetch badge (debounce 500 ms Phase 7.1).

---

## Support affichage Aura (prérequis UI)

Pour que l'optimistic UI soit visible :

- État `auraNotifications` alimenté par fetch parallèle `aura_notifications` (vue avec `is_read`).
- Fusion chronologique `displayNotifications` = notifications + étincelles mappées type `aura`.
- `unreadCount` et liste rendue sur `displayNotifications` (points bleus / fond non-lu disparaissent instantanément sur les deux catégories).

Clic unitaire spark : `setAuraNotifications` synchronisé (cohérence avec mark-all).

---

## Comportement attendu

1. User clique « Tout marquer comme lu ».
2. RPC nettoie `notifications` + `aura_sparks` en base.
3. UI : plus de point bleu, plus de fond `bg-brand-500/5`, badge page → 0, bouton masqué.
4. Header : badge cloche descend après refetch debouncé (RPC `count_unread_notifications` + aura non lues filtrées si Header aligné Phase ultérieure).

---

## Hors scope

- Migration SQL locale (appliquée par Architecte en prod).
- Realtime `aura_sparks` UPDATE sur la page (refetch au prochain mount).
- Mise à jour Header `loadUnreadCounts` pour filtrer `aura_notifications` sur `is_read` — recommandé en Phase 7.4.

---

**Fin du rapport Phase 7.3.**
