# Rapport — Phase 11.3 : CommentsDrawer & intégration Feed

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté (frontend)

---

## 1. Nouveau composant `components/CommentsDrawer.tsx`

| Élément | Détail |
|---------|--------|
| Animation | Overlay `fixed inset-0 z-50 bg-black/60` + panneau `y: 100% → 0` (framer-motion) |
| Panneau | `h-[80vh]`, `bg-slate-950`, `rounded-t-3xl`, `border-t border-white/10` |
| Fetch | `beef_comments` + join `users(username, display_name, avatar_url)` par `beef_id` |
| Likes | Lecture `beef_comment_likes` pour l'utilisateur courant |
| Aura | `toggleCommentAura` → insert/delete `beef_comment_likes` + `aura-refresh` |
| Preuve sociale | `<InlineAuraGivers type="comment" targetId={comment.id} ownerId={comment.user_id} />` |
| Envoi | INSERT `beef_comments` + refetch liste |
| Input | Zone sticky bas : champ texte + bouton Send |

---

## 2. Intégration Feed (`app/feed/page.tsx`)

| Élément | Détail |
|---------|--------|
| State | `activeCommentsBeefId: string \| null` |
| BeefCard | `onCommentClick={() => setActiveCommentsBeefId(beef.id)}` |
| Montage | `<AnimatePresence>` + `<CommentsDrawer beefId={...} onClose={...} />` en bas du return |

---

## 3. Dépendances base de données (hors repo)

Le drawer suppose l'existence de :

- Table `beef_comments` (`beef_id`, `user_id`, `content`, …)
- Table `beef_comment_likes` (`comment_id`, `user_id`, …)
- RPC `get_universal_aura_givers` avec branche `p_type = 'comment'`
- FK `beef_comments.user_id` → `users` (pour le `.select('*, users(...)')`)

Sans migration appliquée, le fetch affichera un toast d'erreur.

---

## 4. Fichiers modifiés / créés

- `components/CommentsDrawer.tsx` (nouveau)
- `app/feed/page.tsx`
- `rapport_comments_drawer.md` (ce document)

---

## 5. Vérifications manuelles

1. Feed → clic pill Commentaires → drawer slide-up.
2. Liste vide → message « Sois le premier ».
3. Envoi commentaire (connecté) → apparition dans la liste.
4. Sparkles sur commentaire d'un autre → `aura-refresh` + avatars `InlineAuraGivers`.
5. Fermeture overlay / X → `activeCommentsBeefId` null.
