# Rapport d'audit — Bugs résiduels (Phase 1 préalable)

**Date :** 31 mai 2026  
**Fichiers analysés :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Statut :** Exploration uniquement — **aucun correctif appliqué**

---

## Anomalie 1 — Aura Teaser sans Optimistic UI (`page.tsx`)

### Localisation
Fonction `handleTeaserAuraClick` — **lignes 742–770** (commentaire explicite l. 742).

### Extrait exact — `handleTeaserAuraClick`

```742:770:app/feed/page.tsx
  /** Teaser : pas d’optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
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

### Extrait comparatif — `handleAuraClick` (avec Optimistic UI)

```702:724:app/feed/page.tsx
  const handleAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingCard.current) return;
    isLikingCard.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    ...
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
    ...
  };
```

### Diagnostic

| Critère | `handleAuraClick` | `handleTeaserAuraClick` |
|---------|-------------------|-------------------------|
| `setBeefs(...)` optimiste | ✅ Oui | ❌ **Absent** |
| Toggle `has_liked_*` local | ✅ Immédiat | ❌ Attend refetch |
| Toggle score local | ✅ `engagement_score` | ❌ `teaser_score` inchangé jusqu'au serveur |
| Debounce refetch parent | 1500 ms (Realtime) | Même canal — **délai cumulé** |

### Chaîne du bug visuel « +2 »

Côté `BeefCard.tsx` (modale teaser, l. 612–623) :

```612:623:components/BeefCard.tsx
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_teaser && !localTeaserAuraLock.current) {
                        localTeaserAuraLock.current = true;
                        ...
                      }
                      onTeaserAuraClick();
                    }}
```

1. Clic 1 : `has_liked_teaser === false` → animation `+1` ; API insert ; prop **reste false**.
2. `localTeaserAuraLock` libéré après **1 s** ; `isLikingTeaser` libéré après **1 s**.
3. Refetch Realtime debouncé **1,5 s** → `has_liked_teaser` peut encore être stale à t+1 s.
4. Clic 2 (ou double-tap) : prop toujours `false` → **second `+1`** alors que le like existe déjà en DB.

**Cause racine confirmée :** absence de `setBeefs` optimiste sur `has_liked_teaser` / `teaser_score`, combinée à un délai de synchronisation supérieur au verrou UI local (1 s vs debounce 1,5 s).

---

## Anomalie 2 — Erreur sémantique modale d'attente (`BeefCard.tsx`)

### Localisation `getPendingRefText`
**Lignes 222–229** (post-refactors ; audit initial ~160).

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

### Usage de `intent`

La prop `intent` est **disponible** sur le composant (l. 66, 120) et utilisée ailleurs :

```205:205:components/BeefCard.tsx
  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
```

**Dans `getPendingRefText` : `intent` n'est jamais lu.**

Conséquence : pour un beef **manifesto** (`intent === 'manifesto'`) avec un candidat Ref (`mediator_name` renseigné), un spectateur voit **« Ref en cours de validation… »** — formulation pensée pour une médiation standard, alors que le flux manifesto implique une **validation par le créateur** (`onValiderRef` / `onRefuserRef` côté feed).

### Bloc de rendu (l. 803–807)

```803:807:components/BeefCard.tsx
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && pendingRefText && (
                      <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                        {pendingRefText}
                      </div>
                    )}
```

### Diagnostic condition de rendu

| Condition | Présente | Note |
|-----------|----------|------|
| `status === 'pending'` | ✅ | |
| `!!mediator_name` | ✅ | |
| `!onValiderRef` | ✅ | Masque le bloc si le créateur a les handlers validation |
| `!onSaisirAffaire` | ✅ | |
| `pendingRefText` | ✅ | Guard anti-fantôme |
| **`intent === 'manifesto'`** | ❌ **Absent** | Pas de branche sémantique manifesto vs standard |

**Cas problématique :** sur le feed « Pour toi », un manifesto pending avec `mediator_name` et **sans** `onValiderRef` passé à la carte (utilisateur non-créateur) affiche « Ref en cours de validation… » — **sémantiquement imprécis** (le Ref a postulé, il attend le créateur, pas une « validation » générique).

Sur l'onglet manifestes, `onValiderRef` est injecté pour le créateur — le bloc est masqué pour lui. Les **spectateurs / autres rôles** voient toutefois le message générique.

---

## Synthèse des correctifs anticipés (non implémentés)

| Anomalie | Fichier | Piste Phase 1 |
|----------|---------|---------------|
| Teaser +2 / délai | `app/feed/page.tsx` | `setBeefs` optimiste sur `has_liked_teaser` + `teaser_score` (miroir `handleAuraClick`) |
| Sémantique Ref | `components/BeefCard.tsx` | Brancher `intent` / `isManifesto` dans `getPendingRefText` et/ou condition de rendu |

**En attente GO / VALIDÉ Architecte avant implémentation.**
