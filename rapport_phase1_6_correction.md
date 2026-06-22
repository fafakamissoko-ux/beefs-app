# Rapport Phase 1.6 — Correction Bleeding Container

**Date :** 2026-05-31  
**Statut :** Swiper relais `h-full`, overlay protégé de la nav système

---

## 1. Hauteur Swiper — `app/feed/page.tsx`

### Conteneur mobile `#feed-scroll-container`

```tsx
className="flex-1 min-h-0 w-full h-full relative z-10 bg-transparent"
```

- `flex-1 min-h-0` : occupe l'espace restant sous header/filtres (pas le viewport brut)
- `h-full` : relais de hauteur au Swiper enfant

### Swiper

```tsx
<Swiper direction="vertical" slidesPerView={1} className="h-full w-full">
```

- **Avant (régression)** : `h-[100dvh]` — débordait sous la barre de navigation app
- **Après** : `h-full` — épouse le conteneur flex parent

---

## 2. Overlay BeefCard — `components/BeefCard.tsx`

```tsx
className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-2.5 pb-[110px] sm:p-4 sm:pb-[120px] md:pb-4 pt-20"
```

| Breakpoint | Padding bas | Effet |
|------------|-------------|-------|
| Mobile default | `pb-[110px]` | Esquive nav bottom + safe area |
| `sm:` | `pb-[120px]` | Marge supplémentaire petits écrans |
| `md:` | `pb-4` | Desktop grille — padding standard |

Titre, VS, Ref et barre d'actions (Vues / Commentaires / Aura) remontés au-dessus de la chrome mobile.

---

## 3. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit 0

---

## Fichiers modifiés

- `app/feed/page.tsx`
- `components/BeefCard.tsx`
- `rapport_phase1_6_correction.md` (ce fichier)

---

## Comportement attendu

1. Une slide Swiper = exactement la hauteur disponible dans le feed (header inclus dans le layout parent)
2. Aucune carte suivante visible en bas (« bleeding »)
3. Overlays texte/boutons lisibles au-dessus de la barre de navigation mobile
