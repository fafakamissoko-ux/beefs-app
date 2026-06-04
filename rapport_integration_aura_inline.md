# Rapport Phase 8.3 — Preuve sociale inline (InlineAuraGivers)

**Date :** 31 mai 2026  
**Référence audit :** `rapport_audit_aura_ui.md`  
**Fichiers :** `components/InlineAuraGivers.tsx` (nouveau), `components/BeefCard.tsx`  
**Statut :** ✅ intégration appliquée

---

## Étape 1 — `InlineAuraGivers.tsx`

**Props :**

| Prop | Type |
|------|------|
| `targetId` | `string` |
| `type` | `'beef' \| 'teaser' \| 'profile'` |
| `ownerId` | `string` |

**Comportement :**

- `useEffect` → `supabase.rpc('get_universal_aura_givers', { p_target_id, p_type, p_owner_id })`
- Conserve les **3 premiers** donateurs
- Rendu : `flex -space-x-1.5`, avatars `h-5 w-5 rounded-full border border-slate-900 object-cover`
- Fallback initiale si pas d’`avatar_url`
- Retourne **`null`** si aucun giver ou `targetId` / `ownerId` vide

---

## Étape 2 — Intégration `BeefCard.tsx`

**Import :**

```typescript
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
```

**Insertion (2 branches — avec et sans `onAuraClick`) :**

Dans le bouton « Voir les donateurs d'Aura » (ouvre `isBeefAuraModalOpen`), **avant** le score :

```tsx
<button
  type="button"
  className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 ..."
  onClick={... setIsBeefAuraModalOpen(true)}
>
  <InlineAuraGivers
    targetId={id}
    type="beef"
    ownerId={mediator_id || created_by || ''}
  />
  <span>{engagement_score.toLocaleString()}</span>
</button>
```

**Lignes approximatives :** ~493–505 et ~510–522 (bloc engagement carte principale).

**Non modifié :** compteur Aura **teaser** modale (`teaser_score`) — hors scope Phase 8.3 (beef uniquement).

---

## Rendu attendu

```
[ ✦ like ] [ 👤👤👤 1 234 ]  ← avatars empilés + score, clic → modale complète
```

---

## Dépendances

- RPC backend `get_universal_aura_givers` (déjà utilisé par `AuraGiversModal`)
- Session utilisateur pour résultats non vides (même logique RBAC que la modale)

---

**Fin du rapport Phase 8.3.**
