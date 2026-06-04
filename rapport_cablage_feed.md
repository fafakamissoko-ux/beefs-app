# Rapport — Phase 11.2 : Câblage Feed & bouton Commentaires

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté (UI + flux données front)

---

## 1. Extension moteur Aura

**Fichier :** `components/InlineAuraGivers.tsx`

`InlineAuraGiversTargetType` inclut désormais :

```typescript
| 'beef' | 'teaser' | 'profile' | 'avatar' | 'banner' | 'comment'
```

Prêt pour les donateurs d'Aura sur un commentaire individuel (RPC `get_universal_aura_givers` côté Supabase à aligner).

---

## 2. Flux Feed (`app/feed/page.tsx`)

| Étape | Détail |
|-------|--------|
| Interface `Beef` | `comment_count?: number` |
| Mapping `loadBeefs` | `comment_count: Number(beef.comment_count) \|\| 0` |
| `BeefCard` | `comment_count={beef.comment_count \|\| 0}` |
| Callback stub | `onCommentClick={() => console.log('Ouverture Drawer Commentaires', beef.id)}` |

**Note données :** la requête reste `.select('*')` sur `beefs`. Si la colonne `comment_count` n'existe pas encore en base, le mapping renvoie **0** pour toutes les cartes (comportement attendu jusqu'à migration DB).

---

## 3. UI BeefCard (`components/BeefCard.tsx`)

| Élément | Détail |
|---------|--------|
| Import | `MessageCircle` (lucide-react) |
| Props | `comment_count = 0`, `onCommentClick?: () => void` |
| Placement | Pill **entre** Vues (`Eye`) et Aura (`Sparkles`) |
| Style | Premium Glass — identique pill Vues : `bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg` |
| Interaction | `stopPropagation` + `role="button"` + `aria-label="Voir les commentaires"` |

Ordre barre d'actions (droite) : **Vues → Commentaires → Aura**.

---

## 4. Vérification compteur à zéro

| Scénario | Résultat attendu |
|----------|------------------|
| Colonne `beefs.comment_count` absente | Affichage **0** sur chaque carte |
| Colonne présente, valeur null | **0** |
| Phase drawer non branchée | Clic → log console `Ouverture Drawer Commentaires {beefId}` |

---

## 5. Fichiers modifiés

- `components/InlineAuraGivers.tsx`
- `app/feed/page.tsx`
- `components/BeefCard.tsx`
- `rapport_cablage_feed.md` (ce document)

---

## 6. Prochaines étapes (hors 11.2)

1. Migration SQL : `beefs.comment_count` + trigger ou agrégat `beef_comments`
2. Remplacer `console.log` par drawer / sheet commentaires
3. RPC `get_universal_aura_givers` : branche `p_type = 'comment'`
