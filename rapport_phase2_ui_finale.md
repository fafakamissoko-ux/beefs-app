# Rapport Phase 2 UI — Finale

**Date :** 31 mai 2026  
**Fichier modifié :** `components/BeefCard.tsx`  
**Périmètre :** CSS / layout modale Teaser uniquement. **Timers 800 ms / 1500 ms et logique React inchangés.**

---

## Étape 1 — Hashtags (contraste)

### Classes appliquées

```tsx
className="rounded border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-bold text-white/80"
```

| Token | Valeur |
|-------|--------|
| Bordure | `border-white/20` |
| Fond | `bg-black/40` |
| Texte | `text-white/80` |

Lisibilité renforcée sur fond Starry Glass (`bg-black/20 backdrop-blur-[2px]`).

---

## Étape 2 — Conteneur anti-collision (Flexbox unifié)

### Avant

- **Mute** : `absolute bottom-4 right-4 z-[9999]` (isolé dans le fragment vidéo)
- **Aura** : `absolute right-4 z-[9999]` + `bottom-24 | bottom-4` conditionnel

Deux ancres absolues indépendantes → collision possible sur mobile.

### Après

Conteneur parent unique :

```tsx
<div className="absolute bottom-4 right-4 z-[9999] flex flex-col-reverse items-center gap-3">
  {video_url && ( /* bouton Mute — sans absolute */ )}
  {onTeaserAuraClick && ( /* bloc Aura — relative flex flex-col */ )}
</div>
```

| Élément | Positionnement |
|---------|----------------|
| Parent | `absolute bottom-4 right-4 z-[9999]` |
| Layout | `flex flex-col-reverse items-center gap-3` |
| Mute | Flux flex (enfant, plus de `absolute`) |
| Aura + score | `relative flex flex-col items-center gap-1.5` |

**Empilement `flex-col-reverse` :** Mute ancré visuellement en bas de la pile ; bloc Aura/score au-dessus — espacement garanti par `gap-3` (12 px).

### Conservé intact

- `AnimatePresence` / `motion.span` animation `+1`
- `onClick` avec timers **800 ms** (particule) et **1500 ms** (verrou)
- Handlers `onTeaserAuraClick`, modale donateurs, toggle mute

---

## Validation

- ✅ Tags : contraste `text-white/80` + `bg-black/40`
- ✅ Mute + Aura encapsulés dans un seul conteneur flex
- ✅ Plus de `bottom-20` / double `absolute` concurrent
- ✅ Aucune modification des timers ni de la logique métier

**Statut : Phase 2 UI finale déployée.**
