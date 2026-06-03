# Rapport d'audit — « Tout marquer comme lu » (Phase 7.3 prep)

**Date :** 31 mai 2026  
**Référence :** `rapport_audit_notifications.md` (§ 4.4, 6.1)  
**Cibles :** `app/notifications/page.tsx`, RPC `mark_all_notifications_read`  
**Statut :** exploration uniquement (aucun correctif)

---

## 1. Extraction React — `markAllRead`

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 169–195

```typescript
  const markAllRead = async () => {
    if (!user || markingAll) return;
    setMarkingAll(true);
    try {
      const { error: rpcErr } = await supabase.rpc('mark_all_notifications_read');
      if (rpcErr) {
        const { error: upErr } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .or('is_read.is.null,is_read.eq.false');
        if (upErr) {
          console.error('[notifications] markAllRead', rpcErr, upErr);
          toast('Impossible de tout marquer comme lu. Réessaie dans un instant.', 'error');
          return;
        }
      }
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } finally {
      setMarkingAll(false);
    }
  };
```

### Déclencheur UI

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 269–277

```tsx
          {notifications.length > 0 && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="self-start text-sm font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
            >
              {markingAll ? 'Mise à jour…' : 'Tout marquer comme lu'}
            </button>
          )}
```

### Comportement côté client (résumé)

| Étape | Action |
|-------|--------|
| 1 | RPC `mark_all_notifications_read` |
| 2 (fallback) | `UPDATE notifications SET is_read = true` pour `user_id` courant |
| 3 | Optimistic local : toutes les lignes en mémoire → `is_read: true` |
| 4 | `window.dispatchEvent('beefs:badges-refresh')` → Header refetch badge |

**Aucun appel** à `aura_sparks`, `aura_notifications`, ni RPC dédié Radar.

---

## 2. Appel API / RPC

| Paramètre | Valeur |
|-----------|--------|
| Méthode | `supabase.rpc('mark_all_notifications_read')` |
| Arguments | Aucun |
| Fallback | PostgREST `PATCH notifications` (client authentifié) |
| Retour RPC | `integer` — nombre de lignes `notifications` mises à jour |

Fichier migration canonique : `supabase_migrations/41_mark_notifications_read_rpc.sql`  
Duplicata consolidé : `supabase_migrations/init.sql` (l. 719–726)

---

## 3. Audit SQL — définition RPC

**Fichier :** `supabase_migrations/41_mark_notifications_read_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE user_id = auth.uid()
    AND is_read IS DISTINCT FROM true;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO service_role;
```

### Que met-elle à jour ?

| Table | Colonne(s) | Condition |
|-------|------------|-----------|
| `public.notifications` | `is_read = true` | `user_id = auth.uid()` AND `is_read IS DISTINCT FROM true` |
| `public.aura_sparks` | — | **Non touchée** |
| Vue `public.aura_notifications` | — | **Non touchée** (vue en lecture seule) |

### `aura_sparks` — colonne `is_read` ?

**Schéma actuel** (`supabase_migrations/54_radar_aura_dynamic.sql`, `55_aura_sparks_receiver_column.sql`) :

```sql
CREATE TABLE IF NOT EXISTS public.aura_sparks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  giver_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  entity_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  ...
);
-- + source_kind, receiver_id (GENERATED)
```

**Conclusion :** la table `aura_sparks` **n'a pas** de colonne `is_read`. Les étincelles Radar sont comptées « non lues » dans le Header via un **count total** sur la vue `aura_notifications` (`receiver_id = user.id`), indépendamment de tout état lu.

---

## 4. RPC associé — lecture unitaire (contexte)

**Fichier :** `supabase_migrations/41_mark_notifications_read_rpc.sql`

```sql
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS boolean
...
BEGIN
  UPDATE public.notifications
  SET is_read = true
  WHERE id = p_id
    AND user_id = auth.uid();
  RETURN FOUND;
END;
```

Utilisé par `handleRowClick` (l. 200) — **notifications table uniquement**. Les lignes spark (`id.startsWith('spark-')`) sont marquées lues **en local seulement** sans persistance serveur.

---

## 5. Écart Phase 7.3 — objectif Architecte vs état actuel

| Dimension | État actuel | Objectif Phase 7.3 |
|-----------|-------------|-------------------|
| Table `notifications` | ✅ RPC + fallback client | ✅ (déjà couvert) |
| Table `aura_sparks` | ❌ ignorée | Nettoyage simultané requis |
| Colonne `is_read` sur sparks | ❌ n'existe pas | À créer **ou** autre stratégie (DELETE dismiss, table junction, RPC dédié) |
| Badge Header post-action | Refetch via `beefs:badges-refresh` | Restera partiellement faux tant que `aura_notifications` count total ≠ « non lus dismissés » |
| Liste page `/notifications` | Fetch `notifications` seulement | Sparks absents de la liste — mark-all ne les voit pas |

---

## 6. Observations pour la Phase 7.3

1. **Unification impossible sans migration SQL** — le RPC actuel ne peut pas « marquer » des sparks sans colonne ou table d'état.
2. **Stratégies possibles** (analyse, pas décision) :
   - **A.** `ALTER TABLE aura_sparks ADD COLUMN is_read boolean DEFAULT false` + étendre RPC ;
   - **B.** Table `aura_spark_dismissals (user_id, spark_id)` ;
   - **C.** `DELETE` sparks reçus pour l'utilisateur (destructif — impact prestige Radar) ;
   - **D.** RPC `mark_all_notifications_read` renommé / étendu en `mark_all_inbox_read` avec UPDATE + UPDATE/INSERT sparks.
3. **React** — `markAllRead` devra appeler le RPC étendu (ou second RPC) ; l'optimistic local ne couvre aujourd'hui que `notifications[]`.
4. **RLS `aura_sparks`** — politique SELECT only pour authenticated ; tout UPDATE/DELETE sparks côté client nécessitera RPC `SECURITY DEFINER` (comme notifications).
5. **Realtime Header** (Phase 7.1) — refetch debouncé inclut toujours count `aura_notifications` ; tant que sparks non dismissés, ghost unread Radar persiste après mark-all notifications.

---

## 7. Synthèse

| Composant | Couvre `notifications` | Couvre `aura_sparks` |
|-----------|------------------------|----------------------|
| `markAllRead()` React | ✅ | ❌ |
| RPC `mark_all_notifications_read` | ✅ | ❌ |
| Fallback client UPDATE | ✅ | ❌ |
| Badge Header `loadUnreadCounts` | ✅ (RPC count) | ⚠️ count total vue |

**Prêt pour conception Phase 7.3** — extension RPC + schéma `aura_sparks` + alignement React/Header.

---

**Fin du rapport — aucune modification de code.**
