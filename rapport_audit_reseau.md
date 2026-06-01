# Rapport d'audit réseau — Listener Realtime Feed (`beefs_changes`)

**Date :** 31 mai 2026  
**Fichier analysé :** `app/feed/page.tsx`  
**Contexte :** Race condition double-like / double appel réseau sur le flux Aura principal  
**Statut :** Exploration uniquement — **aucun correctif appliqué**

---

## 1. Localisation du listener Realtime

Le `useEffect` responsable de l'abonnement Supabase se trouve aux **lignes 619–638** (référence post-refontes ; l'audit initial mentionnait ~423).

### Extrait exact du `useEffect` actuel

```619:638:app/feed/page.tsx
  useEffect(() => {
    if (authLoading) return;
    void loadBeefs();
    const channel = supabase
      .channel('beefs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => void loadBeefs(true))
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [
    authLoading,
    user?.id,
    feedType,
    selectedTags,
    selectedStatus,
    followingIds,
    fetchLimit,
    loadBeefs,
  ]);
```

---

## 2. Analyse du déclencheur — `loadBeefs(true)`

### Comportement du callback Realtime

| Critère | État actuel |
|---------|-------------|
| Délai / debounce | **Aucun** |
| Condition de filtrage | **Aucune** — tout événement `postgres_changes` sur `public.beefs` déclenche un refetch |
| Type d'événements | `event: '*'` (INSERT, UPDATE, DELETE) |
| Appel | **Instantané** : `() => void loadBeefs(true)` |
| Mode background | `isBackgroundRefresh = true` |

### Extrait — fin de `loadBeefs` (impact du flag `true`)

```542:547:app/feed/page.tsx
    } finally {
      if (!isBackgroundRefresh) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
```

**Interprétation :** `loadBeefs(true)` **évite le spinner** (`setLoading`) mais exécute **intégralement** la même requête Supabase lourde (beefs + joins + requêtes participants/invitations/profils). Ce n'est pas un refresh léger — c'est un **refetch complet** déclenché sans temporisation.

### Chaîne causale — like Aura → Realtime (confirmée)

```
Clic Aura (handleAuraClick)
  → INSERT/DELETE beef_likes
    → Trigger SQL trg_beef_likes_aura
      → UPDATE beefs (engagement_score)
        → postgres_changes sur table beefs
          → loadBeefs(true) IMMÉDIAT
```

Même mécanisme pour teaser (`teaser_likes` → `teaser_score` sur `beefs`), documenté ligne 730 :

```730:730:app/feed/page.tsx
  /** Teaser : pas d’optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
```

### Interaction avec l'optimistic update (lignes 690–727)

`handleAuraClick` applique un **toggle optimiste** local (`setBeefs`) puis appelle Supabase. Le listener Realtime peut **réécrire** `beefs[]` via `setBeefs(beefsWithData)` **avant ou pendant** la fenêtre debounce `isLikingCard` (1 s), provoquant :

- un **second round-trip réseau** (mutation + refetch),
- un **glitch visuel** (optimistic → état serveur → possible flicker score / `has_liked_by_user`).

---

## 3. Analyse du cleanup

### Extrait cleanup

```626:628:app/feed/page.tsx
    return () => {
      channel.unsubscribe();
    };
```

| Critère | Verdict |
|---------|---------|
| `channel.unsubscribe()` présent | ✅ Oui |
| Appelé au démontage / re-run du `useEffect` | ✅ Oui (React cleanup) |
| `supabase.removeChannel(channel)` | ❌ Non utilisé |
| Annulation requêtes `loadBeefs` en vol | ❌ Non — pas d'AbortController |

**Diagnostic cleanup :** le désabonnement basique est **correct** pour éviter les fuites d'écouteurs multiples. En revanche, **chaque changement de dépendance** (`fetchLimit`, filtres, `loadBeefs` recréé) provoque :

1. `unsubscribe()` de l'ancien canal  
2. `loadBeefs()` immédiat  
3. Nouvelle souscription `beefs_changes`

→ Risque de **rafales de refetch** lors de changements de filtres, en plus des événements Realtime.

---

## 4. Confirmation — absence de debounce / verrou temporel

### Sur le listener Realtime

```
❌ Pas de setTimeout / clearTimeout
❌ Pas de debounce (lodash, useDebouncedCallback, etc.)
❌ Pas de throttle
❌ Pas de flag "refreshInProgress"
❌ Pas de file d'attente d'événements
❌ Pas de filtre par payload (old/new record, colonne modifiée)
```

**Conclusion formelle :** l'appel `loadBeefs(true)` est **instantané et inconditionnel** à **chaque** événement Postgres reçu sur la table `beefs`.

### Debounce existant ailleurs (hors listener)

| Mécanisme | Emplacement | Portée |
|-----------|-------------|--------|
| `isLikingCard.current` + `setTimeout(..., 1000)` | `handleAuraClick` l. 691–727 | Bloque **re-clic utilisateur**, pas le Realtime |
| `isLikingTeaser.current` + `setTimeout(..., 1000)` | `handleTeaserAuraClick` l. 731–757 | Idem teaser |
| `localAuraLock` / `localTeaserAuraLock` | `BeefCard.tsx` | Bloque **animation +1** locale, pas le refetch parent |

**Aucun de ces verrous ne protège le listener `beefs_changes`.**

---

## 5. Synthèse diagnostic

| Question audit | Réponse |
|----------------|---------|
| Où est le listener ? | `useEffect` l. 619–638, canal `'beefs_changes'` |
| `loadBeefs(true)` est-il différé ? | **Non** — appel synchrone dans le callback |
| Y a-t-il un debounce Realtime ? | **Non** — absence totale de verrou temporel |
| Cleanup OK ? | **`channel.unsubscribe()`** — suffisant pour base, pas de cancel fetch |
| Cause probable double-like / double réseau ? | Optimistic `handleAuraClick` + refetch Realtime immédiat post-trigger SQL sur `beefs` |

---

## 6. Piste de correctif (non implémentée — attente GO Architecte)

Correctif anticipé Phase suivante : **debounce / coalescence** sur le callback Realtime (ex. 300–500 ms) et/ou merge intelligent avec l'état optimiste, sans bloquer les mises à jour légitimes du feed.

**En attente de validation GO / VALIDÉ avant implémentation.**
