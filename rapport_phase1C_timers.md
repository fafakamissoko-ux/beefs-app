# Rapport Phase 1.C — Découplage timers Aura

**Date :** 31 mai 2026  
**Fichier modifié :** `components/BeefCard.tsx`  
**Objectif :** séparer cycle de vie visuel (800 ms) et verrou anti-spam (1500 ms).

---

## Problème adressé

Fusion précédente dans un seul `setTimeout(1500)` :
- retrait particule `+1` du state React
- libération `localAuraLock` / `localTeaserAuraLock`

Conséquence : particule montée ~1500 ms alors que l'animation Framer (~650 ms) est terminée → re-render Realtime pouvait rejouer l'animation (« +2 »).

---

## Étape 1 — Aura carte principale (~l. 475)

### Avant

```typescript
setTimeout(() => {
  setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
  localAuraLock.current = false;
}, 1500);
```

### Après

```typescript
setTimeout(() => {
  setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
}, 800);

setTimeout(() => {
  localAuraLock.current = false;
}, 1500);
```

| Timer | Délai | Rôle |
|-------|-------|------|
| Visuel | **800 ms** | Retrait particule du DOM/state |
| Verrou | **1500 ms** | Anti double animation (aligné debounce Realtime parent) |

---

## Étape 2 — Aura modale Teaser (~l. 626)

### Avant

```typescript
setTimeout(() => {
  setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
  localTeaserAuraLock.current = false;
}, 1500);
```

### Après

```typescript
setTimeout(() => {
  setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
}, 800);

setTimeout(() => {
  localTeaserAuraLock.current = false;
}, 1500);
```

Même schéma : **800 ms** visuel / **1500 ms** verrou logique.

---

## Synthèse — 2 emplacements découplés

| Emplacement | Particule | Verrou | Asynchrone |
|-------------|-----------|--------|------------|
| Carte principale | `setCardFloatingAuras` @ 800 ms | `localAuraLock` @ 1500 ms | ✅ |
| Modale Teaser | `setTeaserFloatingAuras` @ 800 ms | `localTeaserAuraLock` @ 1500 ms | ✅ |

**Effet attendu :** à t+800 ms la particule n'est plus en state → refetch Realtime ne remonte pas un second `motion.span` ; le verrou reste actif jusqu'à t+1500 ms pour bloquer les double-clics.

---

**Statut : Phase 1.C validée.**
