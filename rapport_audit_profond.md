# Rapport d'audit profond — Feed / BeefCard (Phase 1 Logique + Phase 2 UI)

**Date :** 31 mai 2026  
**Périmètre :** `app/feed/page.tsx`, `components/BeefCard.tsx`  
**Objectif :** Confirmer 3 anomalies production avant correctif. **Aucun correctif implémenté.**

---

## Synthèse exécutive

| # | Anomalie | Statut audit | Gravité |
|---|----------|--------------|---------|
| 1 | Glitch « +2 » décalé — Aura Teaser (désync timers) | **Confirmée** | Haute |
| 2 | Absence de bouton « rejoindre l'Arène » (scheduled) | **Confirmée** | Haute |
| 3 | Contraste hashtags + superposition Mute / Aura | **Confirmée** | Moyenne |

---

## Anomalie 1 — Désynchronisation des timers (Teaser Aura)

### 1.1 `setTimeout` 1000 ms — `handleTeaserAuraClick` (`page.tsx`)

**Confirmé :** libération du verrou réseau `isLikingTeaser` après **1000 ms**.

```783:785:app/feed/page.tsx
    setTimeout(() => {
      isLikingTeaser.current = false;
    }, 1000);
```

Contexte complet de la fonction (optimistic UI présente depuis correctif résiduel, commentaire JSDoc **obsolète**) :

```742:786:app/feed/page.tsx
  /** Teaser : pas d'optimiste local (évite conflit avec Realtime sur `beefs`) — trigger SQL + canal `beefs_changes` → loadBeefs. */
  const handleTeaserAuraClick = async (beefId: string) => {
    if (!user?.id || isLikingTeaser.current) return;
    isLikingTeaser.current = true;
    const targetBeef = beefs.find((b) => b.id === beefId);
    if (!targetBeef) {
      isLikingTeaser.current = false;
      return;
    }
    const isCurrentlyLiked = !!targetBeef.has_liked_teaser;

    // --- AJOUT OPTIMISTIC UI ---
    setBeefs((prev) =>
      prev.map((b) => {
        if (b.id === beefId) {
          const wasLiked = !!b.has_liked_teaser;
          return {
            ...b,
            has_liked_teaser: !wasLiked,
            teaser_score: Math.max(0, (b.teaser_score || 0) + (wasLiked ? -1 : 1)),
          };
        }
        return b;
      }),
    );
    // ---------------------------

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

> **Note audit :** le commentaire l. 742 nie l'optimistic UI alors qu'il est injecté l. 753–767. Incohérence doc/code.

---

### 1.2 Debounce Realtime 1500 ms — `useEffect` (`page.tsx`)

**Confirmé :** écoute `beefs_changes` avec debounce **1500 ms** avant `loadBeefs(true)`.

```619:640:app/feed/page.tsx
  useEffect(() => {
    if (authLoading) return;
    void loadBeefs();

    let debounceTimer: NodeJS.Timeout;

    const channel = supabase
      .channel('beefs_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => {
        // Bouclier réseau : annule la requête précédente si la DB spamme les événements
        clearTimeout(debounceTimer);
        // Attend 1.5s que la base soit stabilisée avant de déclencher le refetch
        debounceTimer = setTimeout(() => {
          void loadBeefs(true);
        }, 1500);
      })
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      channel.unsubscribe();
    };
  }, [
```

---

### 1.3 Verrou UI local 1000 ms — modale Teaser (`BeefCard.tsx`)

**Confirmé :** second timer **1000 ms** côté enfant, indépendant du parent.

```618:629:components/BeefCard.tsx
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_teaser && !localTeaserAuraLock.current) {
                        localTeaserAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                        setTimeout(() => {
                          setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                          localTeaserAuraLock.current = false;
                        }, 1000);
                      }
                      onTeaserAuraClick();
                    }}
```

Référence parallèle — Aura carte (même pattern 1000 ms) :

```469:476:components/BeefCard.tsx
                      if (!has_liked_by_user && !localAuraLock.current) {
                        localAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                        setTimeout(() => {
                          setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
                          localAuraLock.current = false;
                        }, 1000);
```

---

### 1.4 Diagnostic — faille temporelle « +2 » décalé

| Couche | Timer | Rôle |
|--------|-------|------|
| `BeefCard` | **1000 ms** | `localTeaserAuraLock` + animation flottante `+1` (guard `!has_liked_teaser`) |
| `page.tsx` | **1000 ms** | `isLikingTeaser.current` — anti double requête API |
| `page.tsx` | **1500 ms** | Debounce Realtime → `loadBeefs(true)` écrase l'état local |

**Chaîne causale confirmée :**

1. **Fenêtre morte 1000 ms < 1500 ms** : à t+1 s, les deux verrous UI/API sont relâchés alors que le refetch serveur peut ne pas avoir encore convergé (debounce + latence réseau).
2. **Double couche d'animation** : l'animation `+1` est déclenchée **avant** la propagation React de `setBeefs` optimiste ; en cas de re-render tardif ou de rollback Realtime, un second clic dans la fenêtre t+1 s…t+1,5 s peut relancer l'animation alors que le like existe déjà en DB → **deux particules `+1` visibles** (effet « +2 décalé »).
3. **Refetch Realtime vs optimiste** : `loadBeefs(true)` peut réinjecter un `teaser_score` serveur **après** l'incrément local, provoquant un **saut de score perceptible** (+1 optimiste puis +1 serveur cumulé visuellement si les valeurs divergent).
4. **Asymétrie documentée** : `handleAuraClick` et `handleTeaserAuraClick` partagent le pattern 1000 ms, mais seul le teaser subit le trigger SQL sur `beefs` + canal Realtime — amplifiant la fenêtre de désync.

**Conclusion :** la faille temporelle **1000 ms / 1500 ms** entre verrous locaux et refetch Realtime est **confirmée**. L'optimistic UI atténue le stale `has_liked_teaser` mais **ne résout pas** la collision des timers ni le risque de double animation / saut de score post-refetch.

---

## Anomalie 2 — Logique d'accès à l'Arène (statut `scheduled`)

### 2.1 Bloc CTA modale Teaser — branche `scheduled`

**Extrait exact** (`BeefCard.tsx`, l. 733–750) :

```733:750:components/BeefCard.tsx
                ) : status === 'scheduled' ? (
                  onPrepareAudience ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrepareAudience();
                        setIsTeaserOpen(false);
                      }}
                      className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-[1.02] active:scale-95"
                    >
                      🎛️ Préparer la Régie
                    </button>
                  ) : (
                    <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-sm font-bold text-white/50">
                      En attente du direct
                    </div>
                  )
                ) : (
```

**Constat :** pour les utilisateurs sans `onPrepareAudience`, le CTA est une **`<div>` statique** sans `onClick`, sans lien, sans navigation vers `/arena/[id]`.

---

### 2.2 Injection parent — qui reçoit `onPrepareAudience` ?

**Extrait exact** (`page.tsx`, l. 1050–1054) :

```1050:1054:app/feed/page.tsx
                    onPrepareAudience={
                      beef.status === 'scheduled' && user?.id === beef.mediator_id
                        ? () => router.push(`/live/${beef.id}`)
                        : undefined
                    }
```

**Constat :** seul le **médiateur (Ref)** obtient un bouton actif, redirigé vers `/live/[id]` (régie), **pas** `/arena/[id]`.

---

### 2.3 Contraste avec les autres chemins d'accès

| Chemin | Statut | Cible | Disponibilité spectateur |
|--------|--------|-------|--------------------------|
| Clic carte (`handleBeefClick`) | non terminé | `/arena/${beef.id}` | ✅ (hors modale) |
| `liveAudienceAction` | `live` | `/arena/${beef.id}` | ✅ modale Teaser |
| CTA modale `scheduled` | `scheduled` | — | ❌ **div passive** |
| `onPrepareAudience` | `scheduled` | `/live/${beef.id}` | Ref uniquement |

```788:798:app/feed/page.tsx
  const handleBeefClick = (beef: Beef) => {
    if (
      beef.status === 'ended' ||
      beef.status === 'replay' ||
      beef.status === 'completed' ||
      beef.status === 'cancelled'
    ) {
      router.push(`/beef/${beef.id}/summary`);
      return;
    }
    router.push(`/arena/${beef.id}`);
  };
```

```1091:1097:app/feed/page.tsx
                    liveAudienceAction={
                      beef.status === 'live'
                        ? {
                            variant: beef.user_is_live_ring ? 'return' : 'join',
                            onClick: () => router.push(`/arena/${beef.id}`),
                          }
                        : undefined
                    }
```

---

### 2.4 Diagnostic — faille logique salle d'attente

**Confirmé :** un beef **programmé** (`scheduled`) n'expose **aucun bouton** dans la modale Teaser permettant à un spectateur / combattant / créateur non-Ref de **rejoindre la salle d'attente** (`/arena/[id]`).

- Le flux `live` est couvert (`liveAudienceAction`).
- Le flux `scheduled` laisse une impasse UX : message « En attente du direct » **sans action**.
- L'utilisateur doit fermer la modale et cliquer la carte — comportement **non découvrable** depuis le Teaser.

**Conclusion :** absence de CTA « Rejoindre l'Arène / Salle d'attente » pour `status === 'scheduled'` — **faille logique confirmée**.

---

## Anomalie 3 — Superposition UI et contraste CSS (modale Teaser)

### 3.1 Contraste hashtags — `tags.map`

**Extrait exact** (l. 690–697) :

```690:697:components/BeefCard.tsx
              {tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {tags.map((tag, idx) => (
                    <span key={idx} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/40">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
```

**Classes Tailwind relevées :**

| Propriété | Classe | Opacité effective |
|-----------|--------|-------------------|
| Texte | `text-white/40` | 40 % |
| Fond | `bg-white/5` | 5 % |
| Bordure | `border-white/10` | 10 % |
| Taille | `text-[10px] font-bold` | micro-texte |

**Contexte de fond :** modale Starry Glass `bg-black/20 backdrop-blur-[2px]` (l. 544) + panneau info sans fond opaque dédié.

**Diagnostic :** ratio de contraste **insuffisant** sur fond glass/clair (Safari, écrans HDR, luminosité élevée) — hashtags **illisibles**. `text-white/40` sur `bg-white/5` ≈ double atténuation.

---

### 3.2 Superposition Mute vs Aura/Score

#### Bouton Volume / Mute (présent **uniquement si `video_url`**)

```579:586:components/BeefCard.tsx
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="absolute bottom-4 right-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
                    aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
```

#### Bloc Aura Teaser + score

```595:599:components/BeefCard.tsx
              {onTeaserAuraClick && (
                <div
                  className={`absolute right-4 z-[60] flex flex-col items-center gap-1.5 ${
                    video_url ? 'bottom-20' : 'bottom-4'
                  }`}
                >
```

**Tableau comparatif des positions :**

| Média | Mute | Aura bloc | `bottom` Aura | Risque collision |
|-------|------|-----------|---------------|------------------|
| `video_url` | `bottom-4 right-4 z-[9999]` h-10 | `bottom-20 right-4 z-[60]` colonne h-12 + score | **80 px** vs **16 px** | **Élevé** (voir ci-dessous) |
| `thumbnail` seul | *absent* | `bottom-4 right-4 z-[60]` | **16 px** | Faible |
| aucun média | *absent* | `bottom-4` | **16 px** | Faible |

**Mécanisme de collision confirmé :**

1. **Même axe horizontal** : les deux blocs sont ancrés `right-4` — colonne verticale unique.
2. **Hauteur variable du stack Aura** : bouton `h-12` (48 px) + `gap-1.5` + score cliquable (`text-xs`, padding `-mx-3 -my-2`) → hauteur totale **> 64 px**.
3. **Offset conditionnel insuffisant** : `bottom-20` (80 px) laisse ~24 px de marge entre le bas du bouton Mute (top ≈ 56 px) et le bas du stack Aura — sur mobile / zoom / barres d'UI navigateur, le score **empiète** sur la zone Mute.
4. **Z-index asymétrique** : Mute `z-[9999]` vs Aura `z-[60]` — en cas de chevauchement, Mute **masque** Aura ; les taps peuvent être captés par le mauvais contrôle (surtout Chrome Android / Safari iOS avec `backdrop-blur`).
5. **Variation vidéo vs image** : passage de `bottom-4` (image) à `bottom-20` (vidéo) est la **seule** mitigation — non testée cross-browser, pas de breakpoint safe-area.

**Diagnostic :** superposition Mute / Aura **confirmée** comme risque structurel (même colonne, z-index divergent, offset `bottom-20` marginal pour un stack flex multi-éléments).

---

## Cartographie Phase 1 / Phase 2 (pistes — non implémentées)

| Phase | Anomalie | Fichier(s) | Piste |
|-------|----------|------------|-------|
| **1 Logique** | Timers Teaser | `page.tsx`, `BeefCard.tsx` | Aligner verrous (≥ debounce Realtime), rollback optimiste on error, unifier guard animation |
| **1 Logique** | Arène scheduled | `BeefCard.tsx`, `page.tsx` | CTA `router.push(/arena/[id])` pour non-Ref ; conserver `/live` pour Ref |
| **2 UI** | Contraste tags | `BeefCard.tsx` | `text-white/80` + fond `bg-black/40` ou token DS |
| **2 UI** | Collision FAB | `BeefCard.tsx` | Grille fixe (ex. stack unique `bottom-4`, Mute au-dessus Aura), z-index cohérent, `safe-area-inset-bottom` |

---

## Validation audit

- ✅ `setTimeout` **1000 ms** présent en fin de `handleTeaserAuraClick`
- ✅ Debounce Realtime **1500 ms** présent dans le `useEffect` (~l. 630)
- ✅ CTA `scheduled` sans `onClick` pour utilisateurs standards — **impasse Arène confirmée**
- ✅ Hashtags `text-white/40` — **contraste insuffisant confirmé**
- ✅ Conteneurs Mute (`z-[9999] bottom-4`) vs Aura (`z-[60] bottom-20|bottom-4`) — **collision confirmée** en présence vidéo

**En attente GO / VALIDÉ Architecte pour implémentation Phase 1 + Phase 2.**
