# Rapport de validation — Correction bugs résiduels

**Date :** 31 mai 2026  
**Fichiers modifiés :** `app/feed/page.tsx`, `components/BeefCard.tsx`

---

## Étape 1 — Optimistic UI Teaser (`app/feed/page.tsx`)

### Cible
`handleTeaserAuraClick` — injection après `const isCurrentlyLiked = !!targetBeef.has_liked_teaser;`, avant le bloc `try`.

### Modification confirmée

```typescript
setBeefs((prev) =>
  prev.map((b) => {
    if (b.id === beefId) {
      const wasLiked = !!b.has_liked_teaser;
      return {
        ...b,
        has_liked_teaser: !wasLiked,
        teaser_score: Math.max(0, (b.teaser_score || 0) + (wasLiked ? -1 : 1)),
      };
    }
    return b;
  }),
);
```

### Effet attendu
- `has_liked_teaser` bascule **immédiatement** côté UI (miroir `handleAuraClick`).
- `teaser_score` incrémenté/décrémenté localement sans attendre le refetch Realtime debouncé (1,5 s).
- Suppression de la fenêtre de désynchronisation provoquant le glitch visuel **+2** sur la modale teaser.

---

## Étape 2 — Correction sémantique (`components/BeefCard.tsx`)

### Cible
Fonction `getPendingRefText` — remplacement intégral.

### Logique confirmée

| Contexte | Texte affiché |
|----------|---------------|
| `intent !== 'manifesto'` (médiation standard) | **« En attente des participants… »** |
| Manifesto + créateur ≠ médiateur | « En attente de ta validation du Ref (@…)… » |
| Manifesto + `isWaitingForMe` | `null` (pas de bloc fantôme) |
| Manifesto + `mediator_name` | « Ref en cours de validation… » |
| Manifesto sans Ref | « En attente d'un Ref… » |

### Effet attendu
- Distinction claire **manifesto** vs **médiation standard** dans la modale d'attente.
- Fin de la confusion « Ref en cours de validation » sur les affaires où le Ref est déjà assigné.

---

## Non modifié (volontairement)

- Bloc de rendu l. 803 : `{status === 'pending' && !!mediator_name && ... && pendingRefText && (` — inchangé ; le guard `pendingRefText` suffit.
- Styles CSS : aucun changement.
- `handleAuraClick` carte principale : inchangé.

**Validation : correctifs résiduels Phase 1 appliqués.**
