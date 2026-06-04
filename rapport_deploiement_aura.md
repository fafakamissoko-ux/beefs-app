# Rapport — Phase 9.2 : Déploiement `InlineAuraGivers`

**Date :** 31 mai 2026  
**Statut :** ✅ Implémenté

---

## 1. Extension du moteur (`InlineAuraGivers.tsx`)

| Avant | Après |
|-------|-------|
| `'beef' \| 'teaser' \| 'profile'` | `'beef' \| 'teaser' \| 'profile' \| 'avatar' \| 'banner'` |

Type exporté : `InlineAuraGiversTargetType`.  
RPC inchangée : `get_universal_aura_givers` (alignée sur `AuraGiversModal`).

---

## 2. Injections par fichier

| Fichier | Zone | `type` | `targetId` / `ownerId` |
|---------|------|--------|-------------------------|
| `BeefCard.tsx` | Modale teaser plein écran — score à côté du bouton Sparkles | `teaser` | `id` / `created_by \|\| ''` |
| `BeefCard.tsx` | *(existant Phase 8.3)* engagement carte | `beef` | `id` / `mediator_id \|\| created_by` |
| `app/profile/[username]/page.tsx` | Bloc prestige Aura (lifetime) | `profile` | `profile.id` |
| `app/profile/[username]/page.tsx` | Lightbox avatar / bannière | `avatar` ou `banner` | `profile.id` |
| `app/profile/ProfileContent.tsx` | Édition profil — bloc Aura | `profile` | `profile.id` |
| `app/profile/ProfileContent.tsx` | Aperçu public (preview) | `profile` | `profile.id` |

Disposition : `flex items-center gap-1.5` (ou `gap-3` sur le conteneur parent prestige).

---

## 3. Comportement UI

- Affiche jusqu’à **3 avatars empilés** (`-space-x-1.5`) si la RPC retourne des donateurs.
- Rendu **null** si liste vide (pas de placeholder).
- Lightbox : avatars des donateurs **média** (`avatar` / `banner`), distincts du prestige `profile`.

---

## 4. Vérifications recommandées

1. Ouvrir un teaser en plein écran → avatars visibles à gauche du score si des givers existent.
2. Profil public → avatars à gauche de la flamme / compteur Aura lifetime.
3. Lightbox photo de profil ou bannière → avatars avant le compteur média.
4. `ProfileContent` (mon profil + preview) → même rendu prestige.

---

## 5. Fichiers modifiés

- `components/InlineAuraGivers.tsx`
- `components/BeefCard.tsx`
- `app/profile/[username]/page.tsx`
- `app/profile/ProfileContent.tsx`
- `rapport_deploiement_aura.md` (ce document)
