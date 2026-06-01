# Rapport de validation — Optimisation réseau (Debounce Realtime)

**Date :** 31 mai 2026  
**Fichier modifié :** `app/feed/page.tsx`  
**Objectif :** Debounce strict 1500 ms sur le listener `beefs_changes`

---

## Étape 1 — Remplacement du listener

### Action réalisée
Le `useEffect` (l. ~619–648) a été **intégralement remplacé** par l'implémentation debouncée.

### Mécanisme introduit

| Élément | Rôle |
|---------|------|
| `debounceTimer: NodeJS.Timeout` | Variable locale au `useEffect` |
| `clearTimeout(debounceTimer)` | Annule le refetch en attente si un nouvel événement arrive |
| `setTimeout(..., 1500)` | Retarde `loadBeefs(true)` de **1,5 s** après le dernier événement |
| Cleanup `clearTimeout(debounceTimer)` | Évite un refetch fantôme après démontage / re-run |

### Appel initial conservé
Au montage de l'effet : `void loadBeefs()` (sans debounce) — **inchangé**.

---

## Tableau de dépendances React

**Identique à l'implémentation précédente — non altéré :**

```typescript
[
  authLoading,
  user?.id,
  feedType,
  selectedTags,
  selectedStatus,
  followingIds,
  fetchLimit,
  loadBeefs,
]
```

---

## Vérification — absence d'appel instantané Realtime

Recherche dans `app/feed/page.tsx` :

| Pattern | Résultat |
|---------|----------|
| `() => void loadBeefs(true)` dans le callback `postgres_changes` | **Supprimé** |
| `loadBeefs(true)` dans le listener | **Uniquement** inside `setTimeout(..., 1500)` |

L'ancien appel asynchrone **instantané** à chaque événement Postgres **n'existe plus** dans le callback Realtime.

---

## Impact attendu

- Réduction des rafales de refetch lors de triggers SQL rapides (like Aura → UPDATE `beefs`).
- Atténuation des race conditions visuelles optimistic ↔ refetch serveur.
- Coalescence des événements multiples en **un seul** `loadBeefs(true)` 1,5 s après le dernier signal.

---

## Cleanup

```typescript
return () => {
  clearTimeout(debounceTimer);
  channel.unsubscribe();
};
```

Timer et canal libérés correctement au démontage.

**Validation : implémentation conforme à la spec Architecte.**
