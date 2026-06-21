# Rapport Phase 1 — Feed Swipe TikTok

**Date :** 2026-05-31  
**Statut :** Grille/Liste supprimée, flux vertical 100dvh verrouillé, fond étoilé Desktop

---

## 1. Ablation mode Grille / Liste

| Élément | Action |
|---------|--------|
| `mobileViewMode` / `setMobileViewMode` | Supprimé |
| Boutons `<List />` / `<LayoutGrid />` | Supprimés |
| Imports `List`, `LayoutGrid` | Retirés |
| `useEffect` IntersectionObserver | Dépendances : `[loading, beefs]` (sans `mobileViewMode`) |

L'utilisateur n'a plus de choix d'affichage : un seul flux vertical.

---

## 2. Fond étoilé Desktop

Calque fixe en tête du `return` principal :

```tsx
<div className="fixed inset-0 z-[-1] bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900 via-obsidian-950 to-black overflow-hidden">
  <StarField isOverlay />
</div>
```

**Note :** Aucun `stars-pattern.svg` dans `public/`. Réutilisation du composant interne `StarField` (déjà utilisé dans `CommentsDrawer`) plutôt qu'une URL SVG inexistante.

---

## 3. Moteur Swipe — `#feed-scroll-container`

Classes strictes (loading + contenu) :

```
flex-1 min-h-0 w-full h-[100dvh] overflow-y-auto snap-y snap-mandatory hide-scrollbar relative z-10
```

Enveloppes par carte (BeefCard + Carte Appât + skeletons) :

```
h-[100dvh] w-full shrink-0 snap-center snap-always flex justify-center items-center
```

Wrapper interne `[data-beef-id]` :

```
h-full w-full max-w-[450px]
```

**Conservé :** `IntersectionObserver` existant sur `[data-beef-id]` → `isActiveVideo`.

---

## 4. Recadrage BeefCard

| Zone | Avant | Après |
|------|-------|-------|
| `motion.div` | `aspect-[3/4] max-h-[70dvh]` | `h-[100dvh] w-full max-w-[450px] shadow-2xl` |
| `mediaBlockRef` | `rounded-[1.2rem] md:rounded-[1.5rem]` | `h-full w-full md:rounded-2xl` (plein écran mobile) |

---

## 5. Validation

```bash
npx tsc --noEmit
```

**Résultat :** ✅ Aucune référence résiduelle à `mobileViewMode`.

---

## Fichiers modifiés

- `app/feed/page.tsx`
- `components/BeefCard.tsx`
- `rapport_phase1_feed_swipe.md` (ce fichier)

**Aucune librairie externe ajoutée.** CSS natif (`snap-y`, `100dvh`) + `IntersectionObserver` existant.

---

## Layout Desktop vs Mobile

| Viewport | Comportement |
|----------|--------------|
| Mobile | Carte `w-full`, vidéo bord à bord (`md:rounded-2xl` inactif) |
| Desktop | Carte centrée `max-w-[450px]`, coins arrondis, fond étoilé visible sur les côtés |
| Scroll | 1 carte = 1 viewport (`100dvh`), snap au centre |
