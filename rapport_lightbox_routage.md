# Rapport — Phase 10.2 : Lightbox UI & routage profond

**Date :** 31 mai 2026  
**Fichier cible :** `app/profile/[username]/page.tsx`  
**Statut :** ✅ Implémenté

---

## 1. Modale média (`AuraGiversModal`)

| Élément | Détail |
|---------|--------|
| State | `isMediaModalOpen` |
| Montage | `{profile && viewingImage && <AuraGiversModal ... />}` |
| Props | `type={viewingImage.type}` (`avatar` \| `banner`), `targetId` / `ownerId` = `profile.id` |
| Distinction | Modale prestige inchangée : `type="profile"` + `isAuraModalOpen` |

---

## 2. Résolution conflit de clic (lightbox)

**Avant :** un seul `<button>` englobait Sparkles + `InlineAuraGivers` + compteur → tout clic = `handleMediaAuraClick`.

**Après :** conteneur flex (pattern BeefCard) :

| Zone | Action |
|------|--------|
| Bouton Sparkles | `handleMediaAuraClick` — like/unlike média |
| Bouton registre | `setIsMediaModalOpen(true)` — liste des donateurs |

Les deux boutons utilisent `e.stopPropagation()` pour ne pas fermer la lightbox.

---

## 3. Deep-link (`?view=`)

Nouveau `useEffect` (au-dessus du listener hash) :

| URL | Comportement |
|-----|--------------|
| `?view=avatar` | Ouvre la lightbox si `profile.avatar_url` existe |
| `?view=banner` | Ouvre la lightbox si `profile.banner_url` existe |

URL cible pour notifications / liens externes :

```
/profile/{username}?view=avatar
/profile/{username}?view=banner
```

Le hash existant (`#followers`, `#beefs`, etc.) reste inchangé.

---

## 4. Synergie Phase 10.1

`handleMediaAuraClick` dispatch toujours `aura-refresh` après succès Supabase → la pile `InlineAuraGivers` du bouton « registre » se met à jour sans rouvrir la modale.

---

## 5. Vérifications recommandées

1. Lightbox → clic avatars/compteur ouvre la modale donateurs (pas de like).
2. Lightbox → clic Sparkles like/unlike sans ouvrir la modale.
3. Navigation `/profile/foo?view=avatar` ouvre automatiquement la lightbox avatar.
4. Modale prestige profil (`type="profile"`) toujours indépendante.

---

## 6. Fichiers modifiés

- `app/profile/[username]/page.tsx`
- `rapport_lightbox_routage.md` (ce document)
