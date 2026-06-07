# Rapport — Fix CommentsDrawer (PGRST201 + responsive)

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté

---

## 1. Correction PGRST201 (ambiguïté jointure)

| Avant | Après |
|-------|-------|
| `.select('*, users(username, display_name, avatar_url)')` | `.select('*, users!beef_comments_user_id_fkey(username, display_name, avatar_url)')` |

PostgREST ne peut plus hésiter entre plusieurs FK `users` sur `beef_comments` — la jointure cible explicitement l'auteur (`user_id`).

---

## 2. Refonte responsive Tier-1

### Overlay
- `fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm`
- Recouvre toute l'application au-dessus du feed

### Panneau (`z-[101]`)
| Breakpoint | Comportement |
|------------|--------------|
| **Mobile** (`max-md`) | Bottom sheet — `bottom-0`, `h-[80vh]`, `rounded-t-3xl`, `border-t` |
| **Desktop** (`md+`) | Side panel droit — `top-0 right-0`, `w-[450px]`, `h-full`, `border-l` |

### Animations (framer-motion)
- **Mobile :** entrée/sortie `y: 100% → 0`
- **Desktop :** entrée/sortie `x: 100% → 0`
- Spring : `damping: 25`, `stiffness: 200`

Détection via `matchMedia('(max-width: 767px)')`.

### Scroll
- **Header** : `sticky top-0 bg-slate-950 z-10` (titre + fermer)
- **Liste** : `flex-1 min-h-0 overflow-y-auto` (seule zone scrollable)
- **Input** : `sticky bottom-0 bg-slate-950 z-10` (bandeau réponse + champ)

---

## 3. Fichiers modifiés

- `components/CommentsDrawer.tsx`
- `rapport_fix_commentaires.md` (ce document)

---

## 4. Vérifications manuelles

1. Ouvrir le drawer → plus d'erreur **PGRST201** dans la console réseau.
2. Mobile / viewport étroit → bottom sheet depuis le bas.
3. Desktop ≥ 768px → panneau latéral 450px à droite, pleine hauteur.
4. Overlay cliquable ferme le panneau ; header/input restent visibles pendant le scroll de la liste.
