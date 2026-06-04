# Rapport — Phase 10.1 : Moteur de réactivité `aura-refresh`

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté  
**Hors scope :** UI modales (Phase 10.2)

---

## 1. Problème corrigé

`InlineAuraGivers` ne refetchait qu'au montage (`useEffect` dépendant de `targetId`, `type`, `ownerId`). Après like/unlike, la RPC backend était à jour mais les 3 avatars empilés restaient figés.

---

## 2. Architecture événementielle

| Élément | Détail |
|---------|--------|
| Événement | `CustomEvent('aura-refresh')` |
| Payload | `{ detail: { targetId: string } }` |
| Écouteur | `InlineAuraGivers` — incrémente `refreshKey` si `e.detail.targetId === targetId` |
| Re-fetch | `refreshKey` ajouté aux deps du `useEffect` RPC |

### Flux

```
Like/Unlike (Profil média | Beef | Teaser)
    → dispatch aura-refresh { targetId }
        → InlineAuraGivers (même targetId) → refreshKey++
            → get_universal_aura_givers re-exécuté
```

---

## 3. Émetteurs branchés

| Fichier | Point d'émission | `targetId` |
|---------|------------------|------------|
| `app/profile/[username]/page.tsx` | `handleMediaAuraClick` — après insert/delete Supabase réussi | `profile.id` |
| `components/BeefCard.tsx` | Bouton Sparkles beef — après `onAuraClick?.()` | `id` (beef) |
| `components/BeefCard.tsx` | Sparkles teaser — `onClick` + `onKeyDown` — après `onTeaserAuraClick?.()` | `id` (beef) |

**Note :** en cas d'erreur Supabase (rollback du compteur média), l'événement **n'est pas** dispatché.

---

## 4. Fichiers modifiés

- `components/InlineAuraGivers.tsx` — `refreshKey` + listener `aura-refresh`
- `app/profile/[username]/page.tsx` — dispatch post-like média
- `components/BeefCard.tsx` — dispatch post-like beef & teaser
- `rapport_moteur_reactivite.md` — ce document

---

## 5. Vérifications recommandées

1. Lightbox avatar — like puis unlike : l'avatar du viewer apparaît / disparaît dans la pile sans fermer la lightbox.
2. Carte beef — like Aura : pile inline mise à jour sur la même carte.
3. Teaser plein écran — idem après Sparkles.
4. Carte voisine avec même beef id (N/A) — seuls les composants partageant le `targetId` refresh.

---

## 6. Prochaine phase (10.2)

Séparation clic like vs ouverture modale (lightbox média, conflits UI) — non traitée ici.
