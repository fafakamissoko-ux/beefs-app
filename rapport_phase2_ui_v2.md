# Rapport Phase 2 — UI v2

**Date :** 31 mai 2026  
**Fichier modifié :** `components/BeefCard.tsx`  
**Périmètre :** contraste hashtags modale Teaser + anti-collision Aura / Mute (Chrome mobile).

---

## Étape 1 — Lisibilité des hashtags

### Localisation
Modale Teaser — boucle `tags.map` (panneau info, sous la description).

### Avant

```tsx
className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/40"
```

### Après (appliqué)

```tsx
className="rounded border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-bold text-white/80"
```

### Delta classes

| Token | Avant | Après |
|-------|-------|-------|
| Bordure | `border-white/10` | `border-white/20` |
| Fond | `bg-white/5` | `bg-black/40` |
| Texte | `text-white/40` | `text-white/80` |

**Effet attendu :** hashtags lisibles sur fond Starry Glass (`bg-black/20 backdrop-blur-[2px]`) — contraste renforcé sans changer la structure du markup.

---

## Étape 2 — Éradication collision Aura vs Mute

### Localisation
Modale Teaser — conteneur bloc Aura flottant (`onTeaserAuraClick`).

### Avant

```tsx
className={`absolute right-4 z-[60] flex flex-col items-center gap-1.5 ${
  video_url ? 'bottom-20' : 'bottom-4'
}`}
```

### Après (appliqué)

```tsx
className={`absolute right-4 z-[9999] flex flex-col items-center gap-1.5 ${
  video_url ? 'bottom-24' : 'bottom-4'
}`}
```

### Delta classes

| Propriété | Avant | Après |
|-----------|-------|-------|
| `z-index` | `z-[60]` | `z-[9999]` (aligné bouton Mute) |
| Offset vidéo | `bottom-20` (80 px) | `bottom-24` (96 px) |
| Sans vidéo | `bottom-4` | `bottom-4` (inchangé) |

**Référence Mute** (inchangé) : `absolute bottom-4 right-4 z-[9999]` — présent uniquement si `video_url`.

**Effet attendu :** marge verticale accrue (+16 px) entre le stack Aura/score et le FAB Volume ; même couche d'interaction que Mute pour éviter les taps fantômes sur Chrome mobile.

---

## Non modifié (volontairement)

- Bouton Mute : classes inchangées.
- Logique Phase 1 (timers 1500 ms, CTA salle d'attente) : inchangée.
- Autres badges / tags hors modale Teaser : inchangés.

---

**Statut : Phase 2 UI v2 appliquée — classes utilitaires conformes au cahier des charges.**
