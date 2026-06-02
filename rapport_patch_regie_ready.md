# Rapport patch — Régie accessible en statut `ready`

**Date :** 31 mai 2026  
**Référence :** `rapport_verrouillage_spectateur.md` (alerte hors scope Phase 6)  
**Fichier modifié :** `app/feed/page.tsx`  
**Statut :** ✅ condition injectée

---

## Changement

**Prop `onPrepareAudience` sur `BeefCard` (l. ~1028) :**

```tsx
onPrepareAudience={
  (beef.status === 'scheduled' || beef.status === 'pending' || beef.status === 'ready') &&
  (user?.id === beef.mediator_id || (!beef.mediator_id && user?.id === beef.created_by))
    ? () => router.push(`/arena/${beef.id}`)
    : undefined
}
```

**Avant :** `scheduled` | `pending` uniquement.  
**Après :** `scheduled` | `pending` | **`ready`**.

---

## Effet attendu

| Profil | Statut `ready` |
|--------|----------------|
| Ref (`mediator_id`) | « 🎛️ Préparer la Régie » visible et actif |
| Créateur sans Ref | Idem |
| Spectateur / challenger | Inchangé — CTAs Phase 6 dans `BeefCard` |

L'Arbitre et le Créateur conservent l'accès à la Régie juste avant le Live, aligné avec la branche CTA `ready` ajoutée en Phase 6 côté `BeefCard`.

---

**Fin du patch.**
