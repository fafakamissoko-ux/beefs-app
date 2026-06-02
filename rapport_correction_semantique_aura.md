# Rapport de validation — Sémantique pending & Aura Teaser

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_semantique_aura.md`  
**Statut :** ✅ 2 correctifs UX appliqués

---

## Synthèse

| Anomalie | Correctif | Fichier |
|----------|-----------|---------|
| Score teaser « +2 » au vote | Optimistic UI **partiel** : toggle `has_liked_teaser` uniquement | `app/feed/page.tsx` |
| Texte pending générique pour challengers | `getPendingRefText()` par rôle (Ref, challenger, spectateur) | `components/BeefCard.tsx` |

---

## Étape 1 — Neutralisation double-score Aura Teaser

**Avant :** `handleTeaserAuraClick` incrémentait localement `teaser_score` (+1/−1) **en plus** du trigger SQL et du refetch Realtime (debounce 1,5 s) → glitch visuel « +2 ».

**Après :**

```typescript
setBeefs((prev) =>
  prev.map((b) => {
    if (b.id === beefId) {
      return {
        ...b,
        has_liked_teaser: !b.has_liked_teaser,
        // Pas d'incrémentation locale de teaser_score
      };
    }
    return b;
  }),
);
```

**Comportement attendu :**

1. Clic → étoile **allumée/éteinte** instantanément (`has_liked_teaser`).
2. Score numérique **inchangé** jusqu’au refetch Realtime (~1,5 s).
3. `loadBeefs` recharge `teaser_score` exact depuis la DB (trigger SQL = +1).

---

## Étape 2 — Personnalisation sémantique par rôle

**Nouvelle matrice (`intent !== 'manifesto'`) :**

| Profil | Condition | Texte `pendingRefText` |
|--------|-----------|------------------------|
| **Ref** | `user?.id === mediator_id` | « En attente des combattants… » |
| **Challenger convoqué** | `userInviteStatus === 'pending'` | `null` (pas de bandeau — CTA « ⚠️ Convocation en attente » seul) |
| **Challenger accepté** | `userInviteStatus === 'accepted'` | « En attente de ton adversaire… » |
| **Spectateur** | défaut | « En attente des participants… » |

**Manifestes :** logique existante conservée (créateur, Ref en validation, etc.).

**Effet anti-doublon :** challenger `pending` ne voit plus le bandeau générique sous le CTA convocation.

---

## Plan de test manuel

1. **Teaser Aura** — voter une fois : étoile immédiate, compteur +1 après ~1,5 s, **pas** de saut +2.
2. **Ref pending** — modale : « En attente des combattants… ».
3. **Challenger pending** — modale : uniquement « ⚠️ Convocation en attente », sans texte italic en dessous.
4. **Challenger accepted** — modale : « En attente de ton adversaire… » + bouton Rejoindre.
5. **Spectateur** — modale : « En attente des participants… ».

---

**Corrections validées en code.**
