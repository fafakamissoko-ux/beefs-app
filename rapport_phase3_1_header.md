# Rapport Phase 3.1 — Socle ProfileHeader unifié

**Date :** 2026-05-31  
**Phase :** 3.1 (création du composant, sans intégration pages)  
**Commande :** `npx tsc --noEmit`

## Statut de compilation TypeScript

**Résultat : SUCCÈS** (exit code 0, aucune erreur TypeScript)

## Fichier créé

| Fichier | Statut |
|---------|--------|
| `components/profile/ProfileHeader.tsx` | **Créé** (~175 lignes) |

## Fichiers non modifiés (conformément à l'ordre)

| Fichier | Statut |
|---------|--------|
| `app/profile/ProfileContent.tsx` | Inchangé (header L534–700 toujours en place) |
| `app/profile/[username]/page.tsx` | Inchangé (header L647–853 toujours en place) |

## Interfaces exportées

### `ProfileHeaderData`

Données d'identité et prestige passées au header :

- `id`, `username`, `display_name`, `bio`
- `avatar_url`, `banner_url`, `accent_color`, `is_premium`
- `lifetime_points` (Aura prestige, déjà normalisé côté parent)
- `created_at?` (date d'inscription — profil public)

### `ProfileHeaderStats`

Métriques sociales :

- `beefs_participated`, `beefs_hosted`
- `beefs_abandoned?` (optionnel — affiché si défini + activité > 0)
- `followers`, `following`

### `ProfileHeaderProps`

| Prop | Rôle |
|------|------|
| `mode: 'owner' \| 'public' \| 'preview'` | Variante contextuelle (réservée Phase 3.2+) |
| `profile`, `stats` | Données structurées |
| `backButton?` | Slot retour (ex. `AppBackButton`) |
| `actionButtons?` | Slot actions (Share, Settings, Follow…) |
| `uploadOverlayBanner?` | Slot upload bannière (owner) |
| `uploadOverlayAvatar?` | Slot upload avatar (owner) |
| `onBannerClick?` | Lightbox ou noop |
| `onAvatarClick?` | Lightbox ou noop |
| `onAuraClick?` | Ouverture modale donateurs Aura |
| `onStatsClick?` | Navigation / modales métriques |

## Design system Premium Glass — tokens appliqués

| Zone | Classes |
|------|---------|
| Conteneur | `rounded-[2rem] bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg` |
| Bannière fallback | Dégradé dynamique `accent_color` |
| Avatar | `rounded-full border-4`, premium gold `#D4AF37` si `is_premium` |
| Identité | `text-white`, `text-white/50`, `text-white/80` |
| Badge Aura | `border-white/10 bg-black/40 backdrop-blur-md shadow-inner` |
| Métriques | `text-white` + `text-white/50`, hover underline si `onStatsClick` |
| Date inscription | `text-white/40` + icône `Calendar` |

## Architecture slots (composition)

Le composant est **présentationnel** : aucune logique Supabase, upload ou navigation interne. Les différences owner / public / preview seront injectées via :

1. **Slots React** (`backButton`, `actionButtons`, overlays upload)
2. **Callbacks** (`onBannerClick`, `onAvatarClick`, `onAuraClick`, `onStatsClick`)
3. **Données** (`profile.created_at`, `stats.beefs_abandoned`)

## Dépendances

- `@/components/InlineAuraGivers`
- `@/lib/prestige` → `getAuraRank`
- `next/image`, `lucide-react` (`Flame`, `Calendar`)

## Prochaine étape (Phase 3.2)

Remplacer les blocs header inline dans :

- `ProfileContent.tsx` (L534–700) → `mode="owner"`
- `[username]/page.tsx` (L647–853) → `mode="public"`

**En attente GO / VALIDÉ Architecte pour l'intégration.**
