# Rapport Phase 7.1 — Correction Ghost Unread (Header)

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_notifications.md` (§ 6.1, 6.6)  
**Fichier modifié :** `components/Header.tsx`  
**Statut :** ✅ refetch serveur strict appliqué

---

## Problème

Le badge cloche du Header pouvait diverger de l'état réel après des **UPDATE** (marquer comme lu) ou des rafales d'événements Realtime, car l'écoute était scindée entre `INSERT` et `UPDATE` avec des refetch immédiats non coordonnés — risque de course avec l'optimistic UI de la page `/notifications`.

---

## Changement

### Avant

- Canal unique `header_badges_${user.id}` avec deux handlers `notifications` :
  - `INSERT` → refetch immédiat + toast navigateur
  - `UPDATE` → refetch immédiat
- Pas d'incrément `prev + 1` dans le code actuel, mais refetch non debouncé à chaque événement.

### Après

- Canal dédié **`notifications_header`**
- Écoute **`event: '*'`** sur `public.notifications` filtré `user_id=eq.${user.id}`
- **Aucun calcul local** — source de vérité = `loadUnreadCounts()` :
  - RPC `count_unread_notifications`
  - Fallback count table `notifications`
  - + count vue `aura_notifications`
- **Debounce 500 ms** : `clearTimeout` + `setTimeout` avant refetch (rafales mark-all-read / bulk UPDATE)
- **INSERT** : toast navigateur conservé (préférences `beefs_notif_prefs`), sans refetch immédiat hors debounce
- Invitations beef : canal `header_badges_${user.id}` inchangé (hors scope notifications)

---

## Extrait cible

```typescript
let debounceTimer: ReturnType<typeof setTimeout>;

const channel = supabase
  .channel('notifications_header')
  .on(
    'postgres_changes',
    { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
    (payload) => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        void headerCallbacksRef.current.loadUnreadCounts();
      }, 500);
      // toast navigateur uniquement sur INSERT …
    },
  )
  .subscribe();
```

---

## Comportement attendu

| Événement Realtime | Badge Header |
|--------------------|--------------|
| INSERT notification | Refetch RPC après 500 ms max |
| UPDATE `is_read=true` | Idem — badge descend au compte serveur exact |
| DELETE (si activé) | Idem |
| « Tout marquer comme lu » (N UPDATE) | Un seul refetch debouncé |

Le ghost unread (badge bloqué haut après lecture) doit disparaître tant que `loadUnreadCounts` et le RPC restent alignés.

---

## Non modifié (hors 7.1)

- Compteur Aura (`aura_notifications` sans `is_read`) — ghost unread Radar reste possible ; traitement Phase ultérieure.
- Page `/notifications`, `TikTokStyleArena`, `MessagesUI` — abonnements Realtime propres.
- Debounce feed `beefs_changes` (1500 ms) — inchangé.

---

**Fin du rapport Phase 7.1.**
