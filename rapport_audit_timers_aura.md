# Rapport d'audit — Timers Aura (`BeefCard.tsx`)

**Date :** 31 mai 2026  
**Fichier cible :** `components/BeefCard.tsx`  
**Objectif :** confirmer la fusion nettoyage particule + verrou logique dans un même `setTimeout` de **1500 ms**.  
**Statut :** audit uniquement — **aucun correctif implémenté**.

---

## Synthèse

| Emplacement | Particule | Verrou | Délai unique | Fusion confirmée |
|-------------|-----------|--------|--------------|------------------|
| Aura carte principale | `setCardFloatingAuras` | `localAuraLock.current` | **1500 ms** | ✅ Oui |
| Aura modale Teaser | `setTeaserFloatingAuras` | `localTeaserAuraLock.current` | **1500 ms** | ✅ Oui |

**Diagnostic :** le nettoyage visuel (retrait du chip `+1` du state React) et la libération du verrou anti-double-clic sont **couplés** dans le même callback `setTimeout`. Tant que la particule reste montée **1500 ms**, un refetch Realtime (~1500 ms debounce parent) peut provoquer un re-render avec `has_liked_*` encore en transition → **risque de rejouer l'animation** si le verrou est levé au même instant que la particule disparaît du DOM.

---

## 1. Timer Aura carte principale (~l. 469–480)

### Contexte guard

```471:474:components/BeefCard.tsx
                      if (!has_liked_by_user && !localAuraLock.current) {
                        localAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
```

### Extrait exact — `setTimeout` fusionné

```475:478:components/BeefCard.tsx
                        setTimeout(() => {
                          setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
                          localAuraLock.current = false;
                        }, 1500);
```

### Opérations dans le même timer

| Ligne | Opération | Type |
|-------|-----------|------|
| 476 | `setCardFloatingAuras(...filter...)` | **Nettoyage visuel** (state particule) |
| 477 | `localAuraLock.current = false` | **Verrou logique** (ref anti re-trigger animation) |

**Confirmé :** les deux opérations partagent **un seul** `setTimeout(..., 1500)`.

### Animation Framer Motion associée (carte)

```452:461:components/BeefCard.tsx
                    {cardFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                        animate={{ opacity: 0, y: -28, scale: 1.1 }}
                        exit={{ opacity: 0 }}
                        className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-amber-400"
                      >
                        +1
                      </motion.span>
```

**Note :** pas de `transition.duration` explicite — durée d'animation par défaut Framer (~0.3 s) **< 1500 ms**, mais la particule **reste dans le state** jusqu'au timeout complet.

---

## 2. Timer Aura modale Teaser (~l. 620–631)

### Contexte guard

```622:625:components/BeefCard.tsx
                      if (!has_liked_teaser && !localTeaserAuraLock.current) {
                        localTeaserAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
```

### Extrait exact — `setTimeout` fusionné

```626:629:components/BeefCard.tsx
                        setTimeout(() => {
                          setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                          localTeaserAuraLock.current = false;
                        }, 1500);
```

### Opérations dans le même timer

| Ligne | Opération | Type |
|-------|-----------|------|
| 627 | `setTeaserFloatingAuras(...filter...)` | **Nettoyage visuel** |
| 628 | `localTeaserAuraLock.current = false` | **Verrou logique** |

**Confirmé :** fusion identique à la carte principale — **1500 ms** unique.

### Animation Framer Motion associée (teaser)

```604:614:components/BeefCard.tsx
                    {teaserFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                        animate={{ opacity: 0, y: -40, scale: 1.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.65 }}
                        className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 text-sm font-black text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                      >
                        +1
                      </motion.span>
```

**Note :** animation visible ~**650 ms**, mais le chip reste en state **1500 ms** — fenêtre ~850 ms où la particule est logiquement présente post-animation.

---

## 3. Chaîne causale du glitch « +2 » au refetch Realtime

```
Clic Aura
  → particule ajoutée (state local)
  → onAuraClick / onTeaserAuraClick (parent, optimistic UI + API)
  → debounce Realtime loadBeefs ~1500 ms
  → setTimeout 1500 ms : cleanup particule + unlock EN MÊME TICK
```

| ms | Carte | Teaser |
|----|-------|--------|
| 0 | Clic, lock=true, particule mount | Idem |
| ~650 | Animation fade terminée (teaser) | Particule encore en state |
| ~1500 | Refetch peut mettre à jour props **et** unlock simultané | Idem |
| >1500 | Si prop `has_liked_*` stale une frame → **second +1 possible** | Idem |

**Cause structurelle confirmée :** impossibilité de séparer « durée visuelle particule » (≈650 ms) du « verrou anti re-animation » (1500 ms aligné Realtime) tant que les deux vivent dans le **même** timer.

---

## 4. Piste correctif anticipée (non implémentée)

Séparer en **deux timers** :

1. **Court (~650–800 ms)** : `setCardFloatingAuras` / `setTeaserFloatingAuras` filter — fin visuelle.
2. **Long (1500 ms)** : `localAuraLock` / `localTeaserAuraLock` = false — aligné debounce parent.

---

**Validation audit : fusion nettoyage + verrou confirmée aux deux emplacements (1500 ms). En attente GO pour implémentation.**
