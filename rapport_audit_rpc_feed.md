# Rapport d'audit Zero-Blind — RPC `get_universal_aura_givers` & flux Feed

**Date :** 31 mai 2026  
**Phase cible :** 11.2 (interface commentaires + Aura)  
**Statut :** extraction uniquement — **aucun fichier modifié**

---

## Synthèse exécutive

| Élément | État |
|---------|------|
| Migration SQL `get_universal_aura_givers` dans le repo | ❌ **Absente** (`supabase_migrations/`, `supabase/migrations/`, `lib/supabase/schema.sql`) |
| RPC consommée côté frontend | ✅ Oui — `InlineAuraGivers`, `AuraGiversModal` |
| Type `'comment'` supporté aujourd'hui | ❌ **Non** (ni SQL local, ni types TS frontend) |
| `comment_count` dans requête feed | ❌ **Absent** |
| Hook dédié feed | ❌ Pas de `useFeed` — logique dans `app/feed/page.tsx` → `loadBeefs` |

**Action Architecte requise :** extraire le corps SQL depuis Supabase Dashboard (requête ci-dessous) ou ajouter une migration versionnée avant Phase 11.2.

---

## 1. Extraction RPC — `get_universal_aura_givers`

### 1.1 Recherche locale (résultat négatif)

Fichiers parcourus :

- `supabase_migrations/*.sql` (72 fichiers)
- `supabase/migrations/*.sql`
- `lib/supabase/schema.sql`
- Recherche `get_universal_aura_givers`, `get_profile_aura_givers`, `universal_aura` → **0 occurrence SQL**

**Constat :** la fonction est déployée en production (le frontend l'appelle depuis la Phase 8+) mais **n'est pas versionnée** dans ce dépôt, au même titre que `get_beef_viewers` et `record_beef_view` (cf. historique projet).

### 1.2 Contrat frontend (source de vérité partielle)

**Appel RPC (extrait `components/InlineAuraGivers.tsx`) :**

```typescript
const { data } = await supabase.rpc('get_universal_aura_givers', {
  p_target_id: targetId,
  p_type: type,
  p_owner_id: ownerId,
});
```

**Appel identique (`components/AuraGiversModal.tsx`, branche non-`views`) :**

```typescript
const { data } = await supabase.rpc('get_universal_aura_givers', {
  p_target_id: targetId,
  p_type: type,
  p_owner_id: ownerId,
});
```

| Paramètre | Rôle observé |
|-----------|----------------|
| `p_target_id` | ID cible (beef `id`, profil `id`, etc.) |
| `p_type` | Discriminant de source de likes |
| `p_owner_id` | Propriétaire / bénéficiaire (souvent `created_by` ou `profile.id`) |

**Types `p_type` utilisés aujourd'hui (frontend) :**

| Composant | Types passés |
|-----------|----------------|
| `InlineAuraGivers` | `'beef' \| 'teaser' \| 'profile' \| 'avatar' \| 'banner'` |
| `AuraGiversModal` | `'profile' \| 'beef' \| 'teaser' \| 'avatar' \| 'banner' \| 'views'` (views → autre RPC) |

**Type `'comment'` :** ❌ absent des unions TypeScript — **à ajouter** en Phase 11.2 (RPC + `InlineAuraGiversTargetType` + modale).

**Forme de retour attendue (interface TS partagée) :**

```typescript
interface AuraGiverRow {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}
```

Tableau ordonné (les 3 premiers affichés côté UI via `.slice(0, 3)`).

### 1.3 Tables migrations susceptibles d'alimenter la RPC (inférence)

Sans le `prosrc`, les sources probables par `p_type` :

| `p_type` (actuel) | Tables / colonnes repo |
|-------------------|-------------------------|
| `beef` | `beef_likes` → `beefs.engagement_score` (`57_beef_likes_aura_trigger.sql`) |
| `teaser` | `teaser_likes` → `beefs.teaser_score` (`58_teaser_likes_teaser_score.sql`) |
| `profile` | `aura_sparks` (`source_kind = 'profile'`) — `54_radar_aura_dynamic.sql` |
| `avatar` / `banner` | `profile_media_likes` — `60_profile_media_likes.sql` |
| **`comment`** | ❌ **Aucune table** `beef_comments` / `comment_likes` dans le repo |

### 1.4 Requêtes SQL à exécuter sur Supabase (Dashboard → SQL Editor)

**Extraire la définition complète :**

```sql
SELECT
  p.proname,
  pg_get_function_identity_arguments(p.oid) AS args,
  pg_get_function_result(p.oid) AS result_type,
  p.prosrc AS source
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_universal_aura_givers';
```

**Vérifier les surcharges / ancienne RPC :**

```sql
SELECT proname, prosrc
FROM pg_proc
WHERE proname LIKE '%aura_giver%'
ORDER BY proname;
```

**Vérifier si `comment` est déjà géré dans le corps (après extraction) :**

```sql
SELECT prosrc
FROM pg_proc
WHERE proname = 'get_universal_aura_givers'
  AND prosrc ILIKE '%comment%';
```

### 1.5 Évolution attendue Phase 11.2 (non implémentée ici)

La migration à créer devra typiquement :

1. Étendre le `CASE p_type` (ou équivalent) avec branche `'comment'`.
2. Joindre la future table de likes commentaire (ex. `beef_comment_likes` sur `comment_id`).
3. Retourner les mêmes colonnes que les autres branches (`giver_id`, `display_name`, `username`, `avatar_url`, `created_at`).

**Coller le `prosrc` extrait du dashboard dans la prochaine migration** `supabase_migrations/6X_get_universal_aura_givers_comment.sql` pour fermer le Zero-Blind.

---

## 2. Extraction flux Feed — chargement des arènes (`BeefCard`)

### 2.1 Fichier responsable

| Fichier | Rôle |
|---------|------|
| **`app/feed/page.tsx`** | Page feed principale — fonction **`loadBeefs`** (pas de hook `useFeed`) |
| `app/admin/beefs/page.tsx` | Admin — requête séparée, hors scope cartes publiques |

Aucun `app/page.tsx` ne charge les beefs du feed TikTok.

### 2.2 Requête Supabase principale (extrait intégral)

**Fonction :** `loadBeefs` — L267–296

```typescript
  const loadBeefs = useCallback(async (isBackgroundRefresh = false) => {
    try {
      if (!isBackgroundRefresh) setLoading(true);
      let query = supabase
        .from('beefs')
        .select('*, beef_participants(count), beef_likes!left(user_id), teaser_likes!left(user_id)')
        .order('feed_position', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(fetchLimit);

      if (feedType === 'manifestes') {
        query = query.eq('intent', 'manifesto');
        if (user?.id) {
          query = query.or(`mediator_id.is.null,created_by.eq.${user.id}`);
        } else {
          query = query.is('mediator_id', null);
        }
      }

      if (feedType === 'pour-vous') {
        query = query.or('intent.is.null,intent.neq.manifesto,mediator_id.not.is.null');
      }

      if (selectedStatus !== 'all' && selectedStatus !== 'scheduled') {
        query = query.eq('status', selectedStatus);
      }
      if (selectedStatus === 'scheduled') {
        query = query.in('status', ['scheduled', 'pending']);
      }
      const { data, error } = await query;
      if (error) throw error;
      // ... enrichissement participants, host, likes ...
```

**Chaîne PostgREST équivalente :**

```
beefs.select(
  *,
  beef_participants(count),
  beef_likes!left(user_id),
  teaser_likes!left(user_id)
)
```

### 2.3 Champs explicitement mappés vers `BeefCard`

**Interface locale `Beef` (L35–76) — pas de `comment_count` :**

```typescript
interface Beef {
  id: string;
  title: string;
  // ...
  viewer_count?: number;
  engagement_score?: number;
  has_liked_by_user?: boolean;
  teaser_score?: number;
  has_liked_teaser?: boolean;
  participants_count?: number;
  // ... challengers, mediator, video_url, user_is_live_ring, etc.
}
```

**Mapping post-requête (L447–509) — champs dérivés pour la carte :**

```typescript
      let beefsWithData = beefList.map((beef: Record<string, unknown>) => {
        // ...
        return {
          ...beefFields,
          host_name: hostN,
          host_username: hostSource?.username?.trim() || null,
          mediator_name: mid ? hostN : null,
          mediator_username: mid ? (feedPublicMap.get(mid)?.username?.trim() || null) : null,
          viewer_count: Number(beef.viewer_count) || 0,
          tags: (beef.tags as string[] | undefined) || [],
          participants_count: partAgg?.[0]?.count || 0,
          // ... challenger_* ...
          user_is_live_ring: onRing,
          user_invite_status: userInviteStatusByBeef.get(bid) || null,
          video_url: (beef.video_url as string | null | undefined) ?? null,
          has_liked_by_user: hasLiked,
          teaser_score: Number(beef.teaser_score) || 0,
          has_liked_teaser: hasLikedTeaser,
        };
      }) as Beef[];
```

**Rendu carte (L1025+) :**

```tsx
<BeefCard
  {...beef}
  isActiveVideo={beef.id === activeVideoId}
  onAuraClick={() => handleAuraClick(beef.id)}
  // ... autres callbacks — pas de comment_count / onCommentClick
/>
```

### 2.4 Verdict `comment_count`

| Question | Réponse |
|----------|---------|
| Colonne `beefs.comment_count` dans le `select` ? | ❌ — `*` seulement si colonne existe en DB (non trouvée dans migrations `beefs`) |
| Agrégat `beef_comments(count)` ? | ❌ — table absente |
| Prop passée à `BeefCard` ? | ❌ |
| Compteur affiché sur la carte ? | ❌ — seuls `viewer_count`, `engagement_score`, `teaser_score` |

**Pour Phase 11.2 feed :** prévoir au minimum :

```typescript
.select('*, beef_participants(count), beef_likes!left(user_id), teaser_likes!left(user_id), beef_comments(count)')
// ou colonne dénormalisée beefs.comment_count maintenue par trigger
```

+ extension interface `Beef` et prop `BeefCard` (`comment_count`, `onCommentClick`).

### 2.5 Requête secondaire feed (contexte — pas beefs list)

**Live actif utilisateur (L218–224) :**

```typescript
      const { data: mediatedBeef } = await supabase
        .from('beefs')
        .select('id, title')
        .eq('mediator_id', user.id)
        .eq('status', 'live')
        .limit(1)
        .maybeSingle();
```

Hors affichage `BeefCard` du scroll principal.

---

## 3. Matrice de préparation Phase 11.2

| Couche | État actuel | Action Architecte |
|--------|-------------|-------------------|
| RPC SQL | Hors repo | Extraire `prosrc` + migration `comment` |
| `InlineAuraGivers` | 5 types | Ajouter `'comment'` + `targetId` = `comment.id` |
| `AuraGiversModal` | 6 types (+ views) | Ajouter `'comment'` si modale donateurs par commentaire |
| Feed `loadBeefs` | Pas de compteur | `comment_count` ou `beef_comments(count)` |
| `BeefCard` | Pas de pill commentaire | Phase injection UI (audit commentaires L424–538) |

---

## 4. Fichiers inspectés

- `supabase_migrations/` (recherche RPC)
- `components/InlineAuraGivers.tsx`
- `components/AuraGiversModal.tsx`
- `app/feed/page.tsx` (`loadBeefs`, interface `Beef`, rendu `BeefCard`)
- `supabase_migrations/57_beef_likes_aura_trigger.sql`
- `supabase_migrations/58_teaser_likes_teaser_score.sql`
- `supabase_migrations/54_radar_aura_dynamic.sql`
- `supabase_migrations/60_profile_media_likes.sql`
- `supabase_migrations/init.sql` (schéma `beefs`)

**Supabase CLI :** non installée sur la machine d'audit — extraction SQL prod via Dashboard obligatoire.

**Aucune modification de code effectuée.**
