# Rapport de validation — Hotfix UX Commentaires

**Date :** 31 mai 2026  
**Statut :** ✅ Hotfix appliqué  
**Fichiers modifiés :** `components/CommentsDrawer.tsx`, `app/feed/page.tsx`

---

## 1. Sauvetage des données (alias JSON Supabase)

| Critère | Statut |
|---------|--------|
| Alias `users:` forcé sur la jointure FK | ✅ |
| Clé JSON alignée avec `BeefComment.users` | ✅ |

**Requête en place :**

```typescript
.select('*, users:users!beef_comments_user_id_fkey(username, display_name, avatar_url)')
```

PostgREST renvoie désormais l’embed sous la clé `users`, lue par `resolveCommentUser(comment.users)`. Les fallbacks « Anonyme @user » ne s’activent plus lorsque la jointure réussit.

---

## 2. Élévation via React Portal

| Critère | Statut |
|---------|--------|
| Import `createPortal` depuis `react-dom` | ✅ |
| Guard SSR `mounted` + `useEffect` | ✅ |
| Rendu `null` avant hydratation | ✅ |
| Contenu drawer porté vers `document.body` | ✅ |

Le tiroir n’est plus enfant du conteneur feed (`overflow-hidden`). Il s’affiche au-dessus de toute la hiérarchie AppShell / Header sans être rogné par un ancêtre.

---

## 3. Viewport, z-index et Safe Areas

### CommentsDrawer

| Élément | Avant | Après |
|---------|-------|-------|
| Overlay | `z-[100]` | `z-[9999]` |
| Panneau | `z-[101]`, `h-[80vh]` | `z-[10000]`, `h-[80dvh]` |
| Bandeau input | `p-4` | `p-4 pb-[max(1rem,env(safe-area-inset-bottom))]` |

- **dvh** : hauteur mobile dynamique (barre d’URL Android / iOS).
- **Safe area bas** : le champ de saisie reste au-dessus de l’indicateur d’accueil / barre gestuelle.

### Feed (`#feed-scroll-container`)

| Élément | Avant | Après |
|---------|-------|-------|
| Padding bas scroll | `pb-28` (fixe) | `pb-[calc(7rem+env(safe-area-inset-bottom))]` |

Appliqué aux deux instances (état loading + contenu beefs). Le bas des cartes (micro, caméra, actions) n’est plus amputé sur Android.

---

## 4. Checklist de validation manuelle

- [ ] Ouvrir un beef avec commentaires → pseudos et avatars corrects (plus « Anonyme @user »).
- [ ] Mobile Android : dernière carte du feed entièrement visible ; contrôles non tronqués.
- [ ] iOS PWA / Safari : input commentaire au-dessus de la safe area.
- [ ] Drawer au-dessus du Header et de la nav bottom (`z-[9999]` / `z-[10000]`).
- [ ] Fermeture overlay / swipe spring inchangée.
- [ ] Réponses imbriquées et Aura commentaires fonctionnels.

---

## 5. Synthèse

| Faille audit | Résolution |
|--------------|------------|
| Mapping JSON users | Alias `users:users!beef_comments_user_id_fkey(...)` |
| Superposition / clipping | Portal `document.body` + z-index 9999/10000 |
| Troncature mobile feed | `pb-[calc(7rem+env(safe-area-inset-bottom))]` |
| Hauteur drawer Android | `80dvh` + safe area input |

**Compilation TypeScript :** à valider via `npm run build` ou `npx tsc --noEmit` avant déploiement.
