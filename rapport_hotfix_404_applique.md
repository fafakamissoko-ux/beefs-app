# Rapport — Hotfix 404 notifications commentaires

**Date :** 31 mai 2026  
**Statut :** ✅ Appliqué  
**Contexte :** Trigger Supabase corrigé côté Architecte ; réparation front des anciennes notifications + deep-link feed

---

## 1. Résumé

| Étape | Fichier | Action |
|-------|---------|--------|
| **1 — Intercepteur** | `app/notifications/page.tsx` | Réécriture à la volée `/beef/{id}?view=comments` → `/feed?beefId={id}&view=comments` |
| **2 — Déclencheur tiroir** | `app/feed/page.tsx` | `OpenCommentsFromQuery` dans boundary `Suspense` → ouvre `CommentsDrawer` |
| **3 — Source Supabase** | (hors repo) | Nouveaux liens déjà au format `/feed?beefId=…&view=comments` |

---

## 2. Étape 1 — Intercepteur (`handleRowClick`)

**Emplacement :** fin de `handleRowClick`, après le cas `beef_live` / invitations pending.

**Comportement :**

```
Ancien lien DB : /beef/{uuid}?view=comments
        ↓ intercepteur
Nouveau lien     : /feed?beefId={uuid}&view=comments
        ↓ router.push
Feed + OpenCommentsFromQuery → CommentsDrawer
```

**Code ajouté :**

```typescript
if (n.link) {
  let finalLink = n.link;
  if (finalLink.startsWith('/beef/') && finalLink.includes('view=comments')) {
    const match = finalLink.match(/^\/beef\/([a-zA-Z0-9-]+)(\?.*)?$/);
    if (match) {
      const beefId = match[1];
      finalLink = `/feed?beefId=${beefId}&view=comments`;
    }
  }
  router.push(finalLink);
}
```

**Couverture :**

- Notifications historiques en base avec lien cassé → réparées au clic sans migration SQL des lignes existantes.
- Liens déjà au format `/feed?beefId=…` → passent inchangés.
- Autres liens (`/arena/…`, `/profile/…`, etc.) → inchangés.

---

## 3. Étape 2 — Déclencheur tiroir (`OpenCommentsFromQuery`)

**Emplacement :** sous `OpenCreateModalFromQuery` (~l.35), monté dans le même `<Suspense>` que la modale création.

**Comportement :**

1. Lit `beefId` et `view=comments` via `useSearchParams`.
2. Appelle `setActiveCommentsBeefId(beefId)` → monte `<CommentsDrawer />`.
3. `router.replace('/feed', { scroll: false })` — évite ré-ouverture au refresh.

**Injection JSX :**

```typescript
<Suspense fallback={null}>
  <OpenCreateModalFromQuery setOpen={setShowCreateModal} />
  <OpenCommentsFromQuery setOpenId={setActiveCommentsBeefId} />
</Suspense>
```

**Parcours utilisateur unifié :**

| Entrée | Résultat |
|--------|----------|
| Clic notif ancienne (`/beef/…?view=comments`) | Intercepteur → feed + drawer |
| Clic notif nouvelle (`/feed?beefId=…&view=comments`) | Feed + drawer direct |
| URL partagée / bookmark avec query | Feed + drawer direct |

---

## 4. Fichiers modifiés

- `app/notifications/page.tsx` — intercepteur `finalLink`
- `app/feed/page.tsx` — composant `OpenCommentsFromQuery` + Suspense
- `rapport_hotfix_404_applique.md` — ce document

---

## 5. Checklist validation manuelle

- [ ] Notification **ancienne** (lien `/beef/{id}?view=comments` en DB) → clic → feed s’ouvre + drawer commentaires
- [ ] Notification **nouvelle** (lien `/feed?beefId={id}&view=comments`) → même comportement
- [ ] Refresh sur `/feed` après ouverture → drawer **ne** se rouvre **pas**
- [ ] Notification beef_live / invite / profile → navigation inchangée
- [ ] `/feed?create=1` → modale création toujours fonctionnelle

---

*Hotfix front aligné sur la correction Supabase — Phase Profil débloquée côté routage commentaires.*
