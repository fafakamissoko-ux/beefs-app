# Rapport d'audit — Profil UI (Phase 2 Sagesse)

**Date :** 2026-05-31  
**Mode :** extraction lecture seule — aucune modification de code  
**Objectif :** préparer l'affichage public du « Taux de Fiabilité » et le nettoyage de l'ancien calcul client

---

## Synthèse

| Zone | Fichier | Rôle | Prêt Phase 2 ? |
|------|---------|------|----------------|
| Header public | `components/profile/ProfileHeader.tsx` | Avatar, identité, Aura, métriques sociales | ⚠️ Pas de slot Sagesse — insertion après bloc Aura (L118–136) ou métriques (L138–157) |
| Profil public | `app/profile/[username]/page.tsx` | Fetch + `<ProfileHeader mode="public" />` | ❌ Colonnes `beefs_resolved` / `beefs_abandoned` **non fetchées** |
| Hub privé | `app/profile/ProfileContent.tsx` | Stats owner + modale preview | ⚠️ Calcul client à remplacer par colonnes DB |
| Vue SQL | `user_public_profile` (prod) | Profil tiers authentifié | ❌ Colonnes absentes de la vue |
| RPC anon | `get_public_profile_by_username` | Profil visiteur non connecté | ❌ Colonnes absentes du RETURNS TABLE |

**Colonnes DB (migration 104, prod vérifiée) :** `users.beefs_resolved`, `users.beefs_abandoned` existent en table `users`, mais **ne sont pas exposées** au profil public actuel.

---

## 1. Header du profil public — code intégral

**Composant cible :** `components/profile/ProfileHeader.tsx`  
**Consommé par :**
- `app/profile/[username]/page.tsx` (`mode="public"`)
- `app/profile/ProfileContent.tsx` (`mode="owner"` | `mode="preview"`)

### Point d'insertion recommandé pour le badge « Taux de Fiabilité »

Entre le bloc **Aura** (L118–136) et les **Métriques sociales** (L138–157), ou en extension de `ProfileHeaderStats` / props dédiées (`reliabilityRate?: number`).

### Code brut — `ProfileHeader.tsx` (intégralité)

```tsx
import React from 'react';
import Image from 'next/image';
import { Flame, Calendar } from 'lucide-react';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import { getAuraRank } from '@/lib/prestige';

export interface ProfileHeaderData {
  id: string;
  username: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  accent_color?: string;
  is_premium?: boolean;
  lifetime_points: number;
  created_at?: string; // Pour la date d'inscription (profil public)
}

export interface ProfileHeaderStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
}

export interface ProfileHeaderProps {
  mode: 'owner' | 'public' | 'preview';
  profile: ProfileHeaderData;
  stats: ProfileHeaderStats;
  backButton?: React.ReactNode;
  actionButtons?: React.ReactNode; // Slot (Partager, Modifier, Suivre...)
  uploadOverlayBanner?: React.ReactNode; // Slot (Input file Camera)
  uploadOverlayAvatar?: React.ReactNode; // Slot (Input file Camera)
  onBannerClick?: () => void;
  onAvatarClick?: () => void;
  onAuraClick?: () => void;
  onStatsClick?: (type: 'participated' | 'hosted' | 'followers' | 'following') => void;
}

export function ProfileHeader({
  mode,
  profile,
  stats,
  backButton,
  actionButtons,
  uploadOverlayBanner,
  uploadOverlayAvatar,
  onBannerClick,
  onAvatarClick,
  onAuraClick,
  onStatsClick,
}: ProfileHeaderProps) {
  const rank = getAuraRank(profile.lifetime_points);
  const accent = profile.accent_color || '#E83A14';

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg mb-8">
      {/* --- BANNIÈRE --- */}
      <div className="relative h-48 w-full overflow-hidden group bg-white/5">
        <div className="absolute top-4 left-4 z-20">
          {backButton}
        </div>

        {profile.banner_url ? (
          <button
            type="button"
            onClick={onBannerClick}
            disabled={!onBannerClick}
            className={`absolute inset-0 w-full h-full p-0 border-0 ${onBannerClick ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Image src={profile.banner_url} alt="Bannière" fill className="object-cover" sizes="100vw" priority />
          </button>
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }} />
        )}

        {uploadOverlayBanner}
      </div>

      {/* --- CONTENU INFÉRIEUR --- */}
      <div className="px-6 pb-6 -mt-16 relative z-10">

        <div className="flex items-end justify-between mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={onAvatarClick}
              disabled={!onAvatarClick}
              className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 bg-slate-900 text-4xl font-black text-white transition-transform ${onAvatarClick ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'} ${profile.is_premium ? 'shadow-[0_0_24px_rgba(212,175,55,0.35)] border-[#D4AF37]' : 'border-slate-900'}`}
              style={{ borderColor: profile.is_premium ? '#D4AF37' : accent }}
            >
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" sizes="128px" priority />
              ) : (
                profile.username[0].toUpperCase()
              )}
            </button>
            {uploadOverlayAvatar}
          </div>

          <div className="flex gap-2 justify-end items-center">
            {actionButtons}
          </div>
        </div>

        {/* Identité */}
        <div className="mb-4">
          <h1 className="font-sans text-2xl font-black text-white flex items-center gap-2">
            {profile.display_name}
          </h1>
          <p className="text-white/50 text-sm mb-2">@{profile.username}</p>
          {profile.bio && <p className="text-white/80 text-sm mb-4 leading-relaxed max-w-2xl">{profile.bio}</p>}

          {/* Aura — INSERTION BADGE FIABILITÉ possible ici (sous Aura ou à côté) */}
          <div
            className={`mb-4 flex flex-wrap items-center gap-3 transition-transform ${onAuraClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}`}
            onClick={onAuraClick}
            role={onAuraClick ? 'button' : 'generic'}
            tabIndex={onAuraClick ? 0 : -1}
          >
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md shadow-inner">
              <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
              <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                {rank.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-white/50">
              <InlineAuraGivers targetId={profile.id} type="profile" ownerId={profile.id} />
              <Flame className="h-4 w-4 text-brand-500" aria-hidden />
              <span className="font-bold text-white">{profile.lifetime_points.toLocaleString('fr-FR')}</span> Aura
            </div>
          </div>

          {/* Métriques Sociales */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <button type="button" onClick={() => onStatsClick?.('participated')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.beefs_participated}</span>
              <span className="text-white/50">Affaires</span>
            </button>
            <button type="button" onClick={() => onStatsClick?.('hosted')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.beefs_hosted}</span>
              <span className="text-white/50">Ref</span>
            </button>
            <button type="button" onClick={() => onStatsClick?.('followers')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.followers}</span>
              <span className="text-white/50">Abonnés</span>
            </button>
            <button type="button" onClick={() => onStatsClick?.('following')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.following}</span>
              <span className="text-white/50">Abonnements</span>
            </button>
          </div>

          {profile.created_at && (
            <div className="flex items-center gap-2 text-white/40 text-xs mt-4">
              <Calendar className="w-3.5 h-3.5" />
              <span>Rejoint en {new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Passage parent public — `app/profile/[username]/page.tsx` (L631–654)

```tsx
        <ProfileHeader
          mode="public"
          profile={{
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            bio: profile.bio,
            avatar_url: profile.avatar_url,
            banner_url: profile.banner_url,
            accent_color: profile.accent_color,
            is_premium: profile.is_premium,
            lifetime_points: prestigeAuraDisplay(profile),
            created_at: profile.created_at,
          }}
          stats={{
            beefs_participated: stats.beefs_participated,
            beefs_hosted: stats.beefs_hosted,
            followers: stats.followers,
            following: stats.following,
          }}
          // ... backButton, actionButtons, handlers
        />
```

**Aucune donnée Sagesse transmise au header aujourd'hui.**

---

## 2. Ancien calcul client — code mort à nettoyer (`ProfileContent.tsx`)

### 2.1 Interface stats locale (L44–54)

```typescript
interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  beefs_resolved: number;
  beefs_unresolved: number;
  beefs_in_progress: number;
  beefs_abandoned: number;
  total_views: number;
  followers: number;
  following: number;
}
```

### 2.2 Calcul client via `mediationCategoryForBeef` (L177–262)

**Requête source :** liste complète des beefs médiés (`beefs` WHERE `mediator_id = user.id`), puis filtrage client.

```typescript
          const { data: mediatedRows } = await supabase
            .from('beefs')
            .select('*')
            .eq('mediator_id', data.id)
            .order('created_at', { ascending: false });

          // ...

          const beefsHostedCount = mediatedList.length;

          // Résolution stats = uniquement beefs médiés (catégorie dérivée status + resolution_status)
          const resolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'resolved').length || 0;
          const unresolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'unresolved').length || 0;
          const inProgressBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'in_progress').length || 0;
          const abandonedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'abandoned').length || 0;

          setStats({
            beefs_participated: beefsParticipatedCount,
            beefs_hosted: beefsHostedCount,
            beefs_resolved: resolvedBeefs,
            beefs_unresolved: unresolvedBeefs,
            beefs_in_progress: inProgressBeefs,
            beefs_abandoned: abandonedBeefs,
            total_views: 0,
            followers: followersData?.length || 0,
            following: followingData?.length || 0,
          });
```

**Import :** `import { mediationCategoryForBeef } from '@/lib/mediation-resolution';`

**Note :** ce calcul **ignore** les colonnes DB `users.beefs_resolved` / `beefs_abandoned` même si `select('*')` les retourne.

### 2.3 Recalcul optimiste après édition médiateur (L289–304)

```typescript
  const applyMediationBeefPatch = useCallback(
    (beefId: string, patch: { resolution_status?: string; mediation_summary?: string | null }) => {
      setBeefs((prev) => prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b)));
      setMediationBeefs((prev) => {
        const next = prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b));
        setStats((s) => ({
          ...s,
          beefs_resolved: next.filter((b) => mediationCategoryForBeef(b) === 'resolved').length,
          beefs_unresolved: next.filter((b) => mediationCategoryForBeef(b) === 'unresolved').length,
          beefs_in_progress: next.filter((b) => mediationCategoryForBeef(b) === 'in_progress').length,
          beefs_abandoned: next.filter((b) => mediationCategoryForBeef(b) === 'abandoned').length,
        }));
        return next;
      });
    },
    [],
  );
```

### 2.4 « Taux de réussite » onglet stats privé (L708–728)

**Formule actuelle :** `resolved / hosted × 100` (pas `resolved / (resolved + abandoned)`).

```tsx
              {/* Success Rate */}
              <div className="bg-white/5 rounded-[2px] p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Taux de réussite</h3>
                    <p className="text-gray-400 text-sm">Pourcentage de beefs résolus avec succès</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                      {stats.beefs_hosted > 0 ? Math.round((stats.beefs_resolved / stats.beefs_hosted) * 100) : 0}%
                    </p>
                  </div>
                </div>
                <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${stats.beefs_hosted > 0 ? (stats.beefs_resolved / stats.beefs_hosted) * 100 : 0}%` }}
                  />
                </div>
              </div>
```

### 2.5 « Indice de Sagesse » — modale preview privée uniquement (L840–848)

**Visible uniquement** si `stats.beefs_resolved >= 3`. **Absent du profil public.**

```tsx
              <div className="px-2">
                {/* Indice de Sagesse (Spécifique Modale / Médiateur) */}
                {stats.beefs_resolved >= 3 && (
                  <div className="mb-6 flex items-center gap-1.5 text-sm text-gray-400 bg-white/[0.04] p-3 rounded-xl border border-white/5 w-fit" title="Indice de Sagesse">
                    <span className="font-bold text-prestige-gold">
                      ✦ Indice de Sagesse : {(stats.beefs_resolved / Math.max(stats.beefs_hosted, 1) * 100).toFixed(0)}
                    </span>
                  </div>
                )}
```

**Code mort / dette Phase 2 :**
- Double source de vérité : colonnes DB (trigger 104) vs filtre client `mediationCategoryForBeef`
- Formule legacy `resolved / hosted` ≠ spec « Fiabilité » basée sur `beefs_resolved` + `beefs_abandoned`
- Tuiles stats L638–669 et filtre résolution peuvent rester en client ou migrer partiellement

---

## 3. Hydratation Supabase — statut des requêtes fetch

### 3.1 Profil public — `app/profile/[username]/page.tsx`

| Cas | Requête | `beefs_resolved` / `beefs_abandoned` |
|-----|---------|--------------------------------------|
| **Auth — profil tiers** | `user_public_profile.select('*')` L174–178 | ❌ **Absentes de la vue** (prod MCP) |
| **Auth — propre profil** | `users.select('*')` L184–188 | ✅ Retournées par `*` mais **interface `UserProfile` ne les déclare pas** (L31–49) — données ignorées au mapping L251–258 |
| **Anonyme** | RPC `get_public_profile_by_username` L198–241 | ❌ **Non incluses** dans RETURNS TABLE (migration `61_user_public_profile_original_media.sql`) |

**Interface bloquante — `UserProfile` (page publique) :**

```typescript
interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  // ... avatar, points, lifetime_points, is_premium, created_at
  // ❌ pas de beefs_resolved / beefs_abandoned
}
```

**Interface bloquante — `UserStats` (page publique) :**

```typescript
interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
  // ❌ pas de compteurs Sagesse
}
```

**Typage RPC anon (L210–225) :** liste explicite sans `beefs_resolved` / `beefs_abandoned` — reconstruction manuelle L226–241 les exclut.

### 3.2 Profil owner — `app/profile/ProfileContent.tsx`

| Requête | Colonnes Sagesse |
|---------|------------------|
| `users.select('*')` L115–118 | ✅ Présentes en réponse réseau |
| Mapping `setProfile` L145–164 | ❌ **Non mappées** — `UserProfile` sans ces champs |
| Stats | ❌ Recalculées depuis `beefs` + `mediationCategoryForBeef`, pas depuis `users.beefs_*` |

### 3.3 Vue SQL prod — `user_public_profile` (MCP, post-migration 104)

Colonnes exposées (extrait) : `beefs_mediated`, `beefs_created`, `beefs_attended` — **pas** `beefs_resolved`, **pas** `beefs_abandoned`.

**Action Phase 2 requise (hors scope audit) :**
1. Migration `105` : étendre `user_public_profile` + RPC `get_public_profile_by_username`
2. Typer `UserProfile` / `ProfileHeaderData` + props badge
3. Remplacer calcul client dans `ProfileContent` par lecture DB (+ invalidation si édition manuelle `resolution_status`)

### 3.4 Formule cible suggérée pour « Taux de Fiabilité »

Avec colonnes trigger (terminaison `status = ended`) :

```text
Taux de Fiabilité = beefs_resolved / (beefs_resolved + beefs_abandoned) × 100
```

Seuil d'affichage public à définir (actuellement preview exige `beefs_resolved >= 3`).

---

## 4. Cartographie fichiers Phase 2

```
app/profile/[username]/page.tsx     ← fetch public + props ProfileHeader
app/profile/ProfileContent.tsx      ← code mort calcul client + preview Sagesse
components/profile/ProfileHeader.tsx ← badge Fiabilité à insérer
lib/mediation-resolution.ts         ← mediationCategoryForBeef (legacy stats)
supabase_migrations/61_*.sql        ← vue + RPC à étendre (nouvelle migration)
supabase/migrations/104_*.sql       ← colonnes users source de vérité
```

---

## Méthodologie

- Lecture fichiers `ProfileHeader.tsx`, `ProfileContent.tsx`, `[username]/page.tsx`
- Vérification vue `user_public_profile` en prod via MCP Supabase
- Aucune modification de code effectuée
