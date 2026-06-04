# Rapport Phase 7.4 — Badge cloche Aura (non-lus uniquement)

**Date :** 31 mai 2026  
**Référence :** `rapport_extraction_vue_aura.md`, Phase 7.3 `mark_all_notifications_read`  
**Fichier modifié :** `components/Header.tsx`  
**Statut :** ✅ filtre `is_read` appliqué

---

## Changement

**Fonction :** `loadUnreadCounts` (l. ~211–214)

**Avant :**

```typescript
      supabase
        .from('aura_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id),
```

**Après :**

```typescript
      supabase
        .from('aura_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('is_read.is.null,is_read.eq.false'),
```

---

## Effet

| Composant badge | Règle |
|-----------------|--------|
| `notifications` (RPC) | `is_read IS DISTINCT FROM true` |
| `aura_notifications` | `is_read IS NULL OR is_read = false` (aligné PostgREST) |

Le badge cloche (`unreadNotifications = systemUnread + auraRows`) n'additionne plus **toutes** les étincelles Radar — seulement celles non lues, cohérent avec la page `/notifications` et le RPC `mark_all_notifications_read` Phase 7.3.

---

## Comportement attendu

1. Réception d'une étincelle Aura → badge +1 (si `is_read` false/null).
2. « Tout marquer comme lu » → RPC marque `aura_sparks` → vue expose `is_read = true` → badge Aura → 0 après refetch debouncé (Phase 7.1).
3. Plus de ghost unread Aura persistant après lecture.

---

**Fin du rapport Phase 7.4.**
