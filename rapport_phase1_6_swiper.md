# Rapport Phase 1.6 — Swiper mobile + Grille desktop

**Date :** 2026-05-31  
**Statut :** Swiper vertical mobile, grille CSS desktop, tutoriel Premium Glass

---

## 1. Préparation Feed — `app/feed/page.tsx`

### Imports Swiper
```typescript
import { Swiper, SwiperSlide } from 'swiper/react';
import 'swiper/css';
import { FeedTutorial } from '@/components/tutorial/FeedTutorial';
```

### Détecteur viewport
```typescript
const [isDesktop, setIsDesktop] = useState(false);

useEffect(() => {
  const checkDesktop = () => setIsDesktop(window.innerWidth >= 768);
  checkDesktop();
  window.addEventListener('resize', checkDesktop);
  return () => window.removeEventListener('resize', checkDesktop);
}, []);
```

- **SSR mobile-first** : `isDesktop` false par défaut
- **Breakpoint** : `768px` (`md:`)

---

## 2. Architecture conditionnelle

| Viewport | Conteneur | Rendu |
|----------|-----------|-------|
| **Desktop** | `#feed-scroll-container` grille | `md:grid-cols-2 lg:3 xl:4`, scroll classique |
| **Mobile** | `#feed-scroll-container` + `<Swiper>` | `direction="vertical"`, `slidesPerView={1}`, `h-[100dvh]` |

### `data-beef-id`
- **Desktop** : sur le wrapper `<div key={beef.id} data-beef-id={beef.id}>`
- **Mobile** : sur le wrapper Swiper `<div data-beef-id={beef.id} className="h-full w-full ...">`

### IntersectionObserver
- Inchangé — `root: #feed-scroll-container`, cible `[data-beef-id]`
- Dépendances : `[loading, beefs, isDesktop]` (re-bind au resize)

### DRY
- `renderBeefCard(beef, index)` — toutes les props BeefCard centralisées
- `renderHeroContent()` — carte appât partagée desktop / mobile

---

## 3. Module d'éducation — `components/tutorial/FeedTutorial.tsx`

| Élément | Détail |
|---------|--------|
| Design | Premium Glass : `bg-slate-950/75 backdrop-blur-md border-white/10` |
| Persistance | `useFeatureGuide('feed_swipe_tutorial')` + sync metadata Auth |
| Visibilité | Mobile uniquement (`max-width: 767px`) |
| Contenu | Swipe vertical, teaser, Aura, commentaires |
| Injection | Bas de `FeedPage`, après `AnimatePresence` CommentsDrawer |

---

## 4. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Exit 0

---

## Fichiers modifiés / créés

- `app/feed/page.tsx`
- `components/tutorial/FeedTutorial.tsx` (nouveau)
- `rapport_phase1_6_swiper.md` (ce fichier)

**Dépendance utilisée :** `swiper` `^12.2.0` (installée commit `c32b4bf`)

---

## Comportement attendu

1. **Mobile** : swipe vertical Swiper, une carte par écran, vidéo active via IO
2. **Desktop** : grille multi-colonnes, pas de Swiper
3. **Première visite mobile** : overlay tutoriel dismissible « Compris »
