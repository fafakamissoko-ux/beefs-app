# Rapport — Phase 11.4 : Parcours commentaires complet

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté (frontend)

---

## 1. Couverture des points d'entrée (`BeefCard.tsx`)

| Point d'entrée | Accès commentaires | `beef_id` |
|----------------|-------------------|-----------|
| Carte feed (overlay bas) | Pill `MessageCircle` + `comment_count` | `id` |
| Modale teaser plein écran | Bouton `MessageCircle` (glass h-12) **à côté** du Sparkles Aura | `id` (même arène) |

Les deux appellent `onCommentClick?.()` → ouvre le même `CommentsDrawer` côté feed via `activeCommentsBeefId`.

Style teaser : `rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg`, aligné sur le bouton Sparkles adjacent.

---

## 2. Réponses imbriquées (`CommentsDrawer.tsx`)

| Fonctionnalité | Implémentation |
|----------------|----------------|
| State | `replyingTo: { commentId, username } \| null` |
| Bandeau input | « En réponse à @{username} » + bouton X → `setReplyingTo(null)` |
| INSERT | `parent_id: replyingTo?.commentId ?? null` |
| Profondeur | **1 niveau** — réponse à un enfant cible `parent_id` du parent racine |
| Rendu | Racines `parent_id == null` ; enfants indentés `ml-8 pl-4 border-l-2 border-white/10` |
| Action | Bouton « Répondre » sous chaque commentaire (parent ou enfant) |

Logique « Répondre » : `commentId: comment.parent_id ?? comment.id` — garantit qu'une réponse à un enfant reste rattachée au fil racine.

---

## 3. Flux utilisateur unifié

```
Feed BeefCard (carte ou teaser)
    → onCommentClick()
        → setActiveCommentsBeefId(beef.id)
            → CommentsDrawer(beefId)
                → beef_comments filtrés par beef_id
                → threads parent / enfant
                → Aura par commentaire (Sparkles + InlineAuraGivers type="comment")
```

---

## 4. Prérequis base de données

Colonne `beef_comments.parent_id` (nullable FK → `beef_comments.id` ou self-ref) requise pour les réponses. Absente des migrations repo à ce jour.

---

## 5. Fichiers modifiés

- `components/BeefCard.tsx` — bouton commentaires teaser
- `components/CommentsDrawer.tsx` — nested replies + bandeau réponse
- `rapport_parcours_commentaires_complet.md` (ce document)

---

## 6. Vérifications manuelles

1. Feed → pill commentaires carte → drawer.
2. Ouvrir teaser plein écran → clic MessageCircle → **même** drawer / mêmes fils.
3. Répondre à un commentaire racine → enfant indenté sous le parent.
4. Répondre à un enfant → nouveau message sous le parent (1 niveau max).
5. Annuler réponse (X) → input redevient commentaire racine.
