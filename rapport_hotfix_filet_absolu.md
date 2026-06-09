# Rapport — Hotfix filet absolu `/beef/` (notifications)

**Date :** 31 mai 2026  
**Statut :** ✅ Appliqué  
**Fichier modifié :** `app/notifications/page.tsx`

---

## 1. Problème identifié

L'intercepteur précédent ne filtrait que les liens contenant `view=comments` :

```typescript
if (finalLink.startsWith('/beef/') && finalLink.includes('view=comments')) { ... }
```

Les notifications historiques pointant vers `/beef/{id}` (sans query) ou avec d'autres paramètres passaient **sans transformation** → **404** (aucune route `app/beef/[id]/page.tsx`).

---

## 2. Correctif — filet absolu

**Emplacement :** `handleRowClick`, bloc final `if (n.link)`.

**Règle :** tout lien `/beef/{id}` **sauf** ceux contenant `/summary` est réécrit :

| Lien source (legacy) | Destination |
|----------------------|-------------|
| `/beef/{id}?view=comments` | `/feed?beefId={id}&view=comments` |
| `/beef/{id}` ou `/beef/{id}?…` (sans comments) | `/arena/{id}` |
| `/beef/{id}/summary` | **Inchangé** (route valide) |
| Autres (`/arena/`, `/feed?…`, `/profile/…`) | **Inchangés** |

**Code appliqué :**

```typescript
if (n.link) {
  let finalLink = n.link;

  if (finalLink.startsWith('/beef/') && !finalLink.includes('/summary')) {
    const match = finalLink.match(/^\/beef\/([a-zA-Z0-9-]+)(\?.*)?$/);
    if (match) {
      const beefId = match[1];
      const query = match[2] || '';

      if (query.includes('view=comments')) {
        finalLink = `/feed?beefId=${beefId}&view=comments`;
      } else {
        finalLink = `/arena/${beefId}`;
      }
    }
  }

  router.push(finalLink);
}
```

---

## 3. Matrice de validation

| Clic notification | `n.link` en DB | `finalLink` après intercepteur |
|-------------------|----------------|--------------------------------|
| Commentaire legacy | `/beef/uuid?view=comments` | `/feed?beefId=uuid&view=comments` |
| Aura / like / général legacy | `/beef/uuid` | `/arena/uuid` |
| Résumé post-match | `/beef/uuid/summary` | `/beef/uuid/summary` |
| Beef live (format actuel) | `/arena/uuid` | `/arena/uuid` |
| Commentaire (format Supabase) | `/feed?beefId=uuid&view=comments` | inchangé |

---

## 4. Checklist manuelle

- [ ] Notif legacy `/beef/{id}` → ouvre l'arène (pas de 404)
- [ ] Notif legacy `/beef/{id}?view=comments` → feed + drawer commentaires
- [ ] Notif `/beef/{id}/summary` → page résumé inchangée
- [ ] Notif `/arena/{id}` → arène inchangée
- [ ] Cas `beef_live` + invitation pending → `/invitations` (logique antérieure intacte)

---

*Filet absolu aligné sur l'audit `rapport_audit_complet_404.md` — purge 404 notifications finalisée côté front.*
