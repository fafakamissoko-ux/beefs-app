# Rapport d'audit — Bugs résiduels (Phase 1 préalable)

**Date :** 31 mai 2026  
**Fichiers analysés :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Statut :** Exploration uniquement — **aucun correctif appliqué**

---

## Anomalie 1 — Aura Teaser sans Optimistic UI (`page.tsx`)

### Localisation
Fonction `handleTeaserAuraClick` — **lignes 743–770**.

### Extrait exact — `handleTeaserAuraClick`

```743:770:app/feed/page.tsx
  const handleTeaserAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingTeaser.current) return;
    isLikingTeaser.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    if (!targetBeef) {
      isLikingTeaser.current = false;
      return;
    }
    const isCurrentlyLiked = !!targetBeef.has_liked_teaser;

    try {
      if (isCurrentlyLiked) {
        const { error } = await supabase
          .from('teaser_likes')
          .delete()
          .match({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('teaser_likes').insert({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Erreur lors du vote Aura (teaser):', error);
    }
    setTimeout(() => {
      isLikingTeaser.current = false;
    }, 1000);
  };
```

**Commentaire source (l. 742) :**  
`Teaser : pas d'optimiste local (évite conflit avec Realtime sur beefs) — trigger SQL + canal beefs_changes → loadBeefs.`

### Extrait exact — `handleAuraClick` (référence avec Optimistic UI)

```702:740:app/feed/page.tsx
  const handleAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingCard.current) return;
    isLikingCard.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    if (!targetBeef) {
      isLikingCard.current = false;
      return;
    }
    const isCurrentlyLiked = !!targetBeef.has_liked_by_user;

    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          const wasLiked = !!b.has_liked_by_user;
          return {
            ...b,
            has_liked_by_user: !wasLiked,
            engagement_score: Math.max(0, (b.engagement_score || 0) + (wasLiked ? -1 : 1)),
          };
        }
        return b;
      }),
    );

    try {
      if (isCurrentlyLiked) {
        const { error } = await supabase.from('beef_likes').delete().match({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('beef_likes').insert({ beef_id: beefId, user_id: user.id });
        if (error) throw error;
      }
    } catch (error) {
      console.error('Erreur lors du vote Aura:', error);
    }
    setTimeout(() => {
      isLikingCard.current = false;
    }, 1000);
  };
```

### Confirmation diagnostic

| Critère | `handleAuraClick` | `handleTeaserAuraClick` |
|---------|-------------------|-------------------------|
| `setBeefs(...)` | ✅ **Présent** (l. 712–724) | ❌ **Absent** |
| Mise à jour `has_liked_*` | ✅ Immédiate | ❌ Attend refetch serveur |
| Mise à jour score | ✅ `engagement_score` | ❌ `teaser_score` inchangé localement |

**Confirmé :** `handleTeaserAuraClick` ne contient **aucun** appel `setBeefs`.

### Mécanisme du bug visuel « +2 »

1. `BeefCard` anime `+1` si `!has_liked_teaser` (prop stale).
2. Insert Supabase → trigger SQL met à jour `beefs.teaser_score`.
3. Realtime `beefs_changes` → `loadBeefs(true)` debouncé **1500 ms**.
4. Verrous locaux (`localTeaserAuraLock`, `isLikingTeaser`) libérés à **1000 ms**.
5. Fenêtre t+1 s : prop encore `false` → second clic → **second `+1` visuel**.

---

## Anomalie 2 — Erreur sémantique modale d'attente (`BeefCard.tsx`)

### Localisation `getPendingRefText`
**Lignes 222–229.**

### Extrait exact

```222:229:components/BeefCard.tsx
  const getPendingRefText = () => {
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validation…' : "En attente d'un Ref…";
  };
  const pendingRefText = getPendingRefText();
```

### Confirmation — usage de `intent`

```205:205:components/BeefCard.tsx
  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
```

**Confirmé :** la prop `intent` **n'est pas utilisée** dans `getPendingRefText`.  
Les textes ne distinguent pas **manifesto** vs **médiation standard**.

| Branche actuelle | Texte | Problème sémantique |
|------------------|-------|---------------------|
| Créateur ≠ médiateur | Validation Ref @nom | OK manifesto |
| Spectateur + `mediator_name` | « Ref en cours de validation… » | Ambigu — pour manifesto = candidat en attente du **créateur** |
| Spectateur sans Ref | « En attente d'un Ref… » | OK |

### Bloc de rendu (l. 803–807)

```803:807:components/BeefCard.tsx
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && pendingRefText && (
                      <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                        {pendingRefText}
                      </div>
                    )}
```

### Confirmation condition de rendu

- ✅ `status === 'pending'`
- ✅ `!!mediator_name`
- ✅ `!onValiderRef && !onSaisirAffaire`
- ✅ `pendingRefText` (guard anti-fantôme)
- ❌ **`intent` / `isManifesto` non testés**

**Confirmé :** la div s'affiche pour tout pending avec médiateur nommé, sans différencier manifesto vs médiation.

---

## Synthèse — correctifs Phase 1 (non implémentés)

| Anomalie | Fichier | Piste |
|----------|---------|-------|
| Teaser +2 / délai | `app/feed/page.tsx` | Optimistic UI miroir `handleAuraClick` sur `has_liked_teaser` + `teaser_score` |
| Confusion manifesto | `components/BeefCard.tsx` | Conditionner textes/rendu via `intent` ou `isManifesto` |

**En attente GO / VALIDÉ Architecte.**
