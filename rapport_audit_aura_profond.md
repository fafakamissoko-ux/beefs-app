# Rapport d'audit profond — Mécaniques Aura (Phase 9.2 pré-déploiement)

**Date :** 31 mai 2026  
**Mission :** extraction de l'état actuel de l'infrastructure (aucune modification de code)  
**Cibles :** `InlineAuraGivers.tsx`, `app/profile/[username]/page.tsx`, `BeefCard.tsx`, triggers SQL

---

## Synthèse exécutive (constats Architecte)

| Zone | Problème signalé | État extrait |
|------|------------------|--------------|
| **InlineAuraGivers** | Avatar ne disparaît pas au unlike | ❌ **Aucun** `refreshTrigger`, optimistic update, Realtime, ni invalidation post-like |
| **Lightbox profil** | Conflit clic donner vs voir | ❌ **Un seul** `<button>` englobe Sparkles + `InlineAuraGivers` + compteur → tout clic = `handleMediaAuraClick` |
| **Lightbox profil** | Modale donateurs média | ❌ **Pas** de `AuraGiversModal` `type="avatar"\|"banner"` sur cette page |
| **Teaser BeefCard** | Conflit clic | ✅ **Séparé** : Sparkles = like ; span score = modale |
| **Beef engagement** | Référence | ✅ **Séparé** : bouton Sparkles = `onAuraClick` ; bouton score = modale |
| **Notifications médias** | Routage mort | ❌ **Aucun** trigger SQL `notifications` sur `profile_media_likes` ; pas de deep-link `?view=avatar` |
| **Lightbox auto-open URL** | Routage | ❌ **Absent** — ouverture uniquement via `setViewingImage` au clic bannière/avatar |

---

## 1. Désynchronisation d'état — `InlineAuraGivers.tsx` (intégralité)

```tsx
'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface AuraGiverRow {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

export type InlineAuraGiversTargetType =
  | 'beef'
  | 'teaser'
  | 'profile'
  | 'avatar'
  | 'banner';

interface InlineAuraGiversProps {
  targetId: string;
  type: InlineAuraGiversTargetType;
  ownerId: string;
}

export function InlineAuraGivers({ targetId, type, ownerId }: InlineAuraGiversProps) {
  const [givers, setGivers] = useState<AuraGiverRow[]>([]);

  useEffect(() => {
    if (!targetId || !ownerId) {
      setGivers([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.rpc('get_universal_aura_givers', {
        p_target_id: targetId,
        p_type: type,
        p_owner_id: ownerId,
      });

      if (cancelled) return;
      const rows = (data as AuraGiverRow[] | null) ?? [];
      setGivers(rows.slice(0, 3));
    })();

    return () => {
      cancelled = true;
    };
  }, [targetId, type, ownerId]);

  if (givers.length === 0) return null;

  return (
    <span className="flex -space-x-1.5 shrink-0" aria-hidden>
      {givers.map((giver) =>
        giver.avatar_url ? (
          <img
            key={giver.giver_id}
            src={giver.avatar_url}
            alt=""
            className="h-5 w-5 rounded-full border border-slate-900 object-cover"
          />
        ) : (
          <span
            key={giver.giver_id}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 bg-gradient-to-br from-cyan-500/30 to-slate-800 text-[8px] font-bold uppercase text-cyan-300"
          >
            {giver.display_name?.[0] || giver.username?.[0] || '?'}
          </span>
        ),
      )}
    </span>
  );
}
```

### Verdict refresh / optimistic

| Mécanisme | Présent ? |
|-----------|-----------|
| Prop `refreshTrigger` / `key` externe | **Non** |
| Mise à jour optimiste locale (`setGivers` après like/unlike) | **Non** |
| Subscription Realtime Supabase | **Non** |
| Re-fetch après action parent (`handleMediaAuraClick`, `onAuraClick`) | **Non** — le parent met à jour `mediaLikes` / compteurs mais **ne notifie pas** `InlineAuraGivers` |
| Dépendances `useEffect` | Uniquement `[targetId, type, ownerId]` |

**Conséquence directe :** après un unlike, la RPC backend reflète la suppression mais le composant conserve les givers chargés au montage jusqu'à un changement d'identifiants ou un remount (ex. fermer/rouvrir lightbox).

---

## 2. Mécanique de clic — Profil public (`app/profile/[username]/page.tsx`)

### 2.1 États modales / lightbox (début de composant)

```tsx
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
  const [viewingImage, setViewingImage] = useState<{ url: string; type: 'avatar' | 'banner' } | null>(null);
  const [mediaAuraLoading, setMediaAuraLoading] = useState(false);
  const [mediaLikes, setMediaLikes] = useState({
    avatar: { count: 0, liked: false },
    banner: { count: 0, liked: false },
  });
```

Modales montées en bas de page :

```tsx
      {profile && (
        <AuraGiversModal
          isOpen={isAuraModalOpen}
          onClose={() => setIsAuraModalOpen(false)}
          targetId={profile.id}
          type="profile"
          ownerId={profile.id}
        />
      )}
```

**Note :** une seule modale `AuraGiversModal`, type **`profile` uniquement**. Aucune modale `avatar` / `banner` pour la lightbox.

### 2.2 Bloc prestige — séparation clic « voir donateurs »

Le conteneur parent ouvre la modale profil ; `InlineAuraGivers` est **à l'intérieur** (pas de `stopPropagation`) :

```tsx
              <div
                className="flex flex-wrap items-center gap-3 mb-4 cursor-pointer ..."
                onClick={() => setIsAuraModalOpen(true)}
                role="button"
                ...
              >
                ...
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <InlineAuraGivers
                    targetId={profile.id}
                    type="profile"
                    ownerId={profile.id}
                  />
                  <Flame className="h-4 w-4 text-brand-500" aria-hidden />
                  <span className="font-bold text-white">
                    {prestigeAuraDisplay(profile).toLocaleString('fr-FR')}
                  </span>{' '}
                  Aura
                </div>
              </div>
```

Ici : pas de conflit like/unlike (zone = ouverture modale uniquement).

### 2.3 Lightbox — bouton unique like + InlineAuraGivers (CONFLIT)

```tsx
                <button
                  type="button"
                  onClick={() => {
                    void handleMediaAuraClick();
                  }}
                  disabled={mediaAuraLoading || !!isOwnProfile || !profile}
                  ...
                >
                  <Sparkles className={...} />
                  <InlineAuraGivers
                    targetId={profile.id}
                    type={viewingImage.type}
                    ownerId={profile.id}
                  />
                  <span className="font-mono tabular-nums">
                    {(mediaLikes[viewingImage.type].count ?? 0).toLocaleString()}
                  </span>
                </button>
```

| Action utilisateur | Comportement actuel |
|--------------------|---------------------|
| Clic Sparkles | `handleMediaAuraClick` → insert/delete `profile_media_likes` |
| Clic avatars empilés | **Même handler** → like/unlike involontaire |
| Clic compteur | **Même handler** |
| Clic pour ouvrir modale donateurs média | **Impossible** — pas de modale ni handler dédié |

### 2.4 `handleMediaAuraClick` — optimistic count, pas givers

```tsx
  const handleMediaAuraClick = useCallback(async () => {
    ...
    setMediaLikes((prev) => {
      const cur = prev[type];
      const nextLiked = !cur.liked;
      return {
        ...prev,
        [type]: {
          liked: nextLiked,
          count: Math.max(0, cur.count + (nextLiked ? 1 : -1)),
        },
      };
    });
    ...
    if (wasLiked) {
      await supabase.from('profile_media_likes').delete().match({ ... });
    } else {
      await supabase.from('profile_media_likes').insert({ ... });
    }
  }, [profile, viewingImage, user, mediaLikes, toast, router, queueBurst]);
```

Optimistic : **compteur + état `liked`**. Aucun appel à refetch RPC givers.

### 2.5 Ouverture lightbox — pas de `searchParams`

Ouverture **uniquement** au clic utilisateur :

```tsx
                onClick={() =>
                  setViewingImage({
                    url: profile.banner_original_url || profile.banner_url!,
                    type: 'banner',
                  })
                }
```

```tsx
                    onClick={() =>
                      setViewingImage({
                        url: profile.avatar_original_url || profile.avatar_url!,
                        type: 'avatar',
                      })
                    }
```

Le seul `useEffect` de routage URL lit **`window.location.hash`** (`#followers`, `#beefs`, etc.) — **pas** `searchParams.get('view')` :

```tsx
  useEffect(() => {
    if (!profile) return;
    const syncFromHash = () => {
      const raw = window.location.hash.slice(1);
      if (raw === 'followers') { setShowFollowModal('followers'); }
      else if (raw === 'following') { ... }
      // ... debates, participations, reviews
    };
    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    ...
  }, [profile, stats.beefs_hosted, mediatorReviews.length]);
```

**Verdict routage lightbox :** deep-link `?view=avatar` / `?view=banner` **inexistant** ; notifications pointant vers `/profile/{user}` sans hash n'ouvrent pas la lightbox.

---

## 3. Mécanique de clic — Teaser `BeefCard.tsx`

### 3.1 États modales Aura (carte)

```tsx
  const [isBeefAuraModalOpen, setIsBeefAuraModalOpen] = useState(false);
  const [isTeaserAuraModalOpen, setIsTeaserAuraModalOpen] = useState(false);
  const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
```

### 3.2 Référence beef — séparation correcte (carte feed)

```tsx
                  <button ... onClick={... onAuraClick?.()} aria-label="Envoyer de l'Aura">
                    <Sparkles ... />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <InlineAuraGivers targetId={id} type="beef" ownerId={mediator_id || created_by || ''} />
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
```

### 3.3 Teaser modale plein écran — séparation correcte

```tsx
                      <div
                        role="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          ...
                          onTeaserAuraClick?.();
                        }}
                        aria-label="Aura teaser"
                        ...
                      >
                        <Sparkles ... />
                      </div>
                      <span
                        role="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTeaserAuraModalOpen(true);
                        }}
                        aria-label="Voir les donateurs d'Aura teaser"
                        ...
                      >
                        <div className="flex items-center gap-1.5">
                          <InlineAuraGivers
                            targetId={id}
                            type="teaser"
                            ownerId={created_by || ''}
                          />
                          <span>{(teaser_score || 0).toLocaleString()}</span>
                        </div>
                      </span>
```

Modales montées :

```tsx
      <AuraGiversModal isOpen={isTeaserAuraModalOpen} ... type="teaser" ... />
```

**Verdict teaser :** pattern **like ≠ modale** aligné sur la carte beef. Même limite : `InlineAuraGivers` ne se rafraîchit pas après `onTeaserAuraClick`.

---

## 4. Investigation SQL — likes médias & notifications

### 4.1 Requête demandée (équivalent migrations locales)

> `SELECT proname, prosrc FROM pg_proc WHERE proname LIKE '%media_likes%';`

**Résultat extrait du repo** (`supabase_migrations/60_profile_media_likes.sql`) :

| `proname` | Rôle |
|-----------|------|
| `trg_profile_media_likes_counts` | Trigger function AFTER INSERT/DELETE sur `profile_media_likes` |

**Corps synthétique :**

```sql
CREATE OR REPLACE FUNCTION public.trg_profile_media_likes_counts()
RETURNS trigger ...
AS $$
BEGIN
  IF tg_op = 'INSERT' THEN
    IF NEW.media_type = 'avatar' THEN
      UPDATE public.users SET avatar_likes = COALESCE(avatar_likes, 0) + 1 WHERE id = NEW.media_owner_id;
    ELSIF NEW.media_type = 'banner' THEN
      UPDATE public.users SET banner_likes = COALESCE(banner_likes, 0) + 1 WHERE id = NEW.media_owner_id;
    END IF;
  END IF;
  IF tg_op = 'DELETE' THEN
    -- décrément GREATEST(0, ...) sur avatar_likes / banner_likes
  END IF;
  RETURN ...;
END;
$$;

CREATE TRIGGER tr_profile_media_likes_counts
  AFTER INSERT OR DELETE ON public.profile_media_likes
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_profile_media_likes_counts();
```

### 4.2 Notifications sur likes médias

Recherche dans **toutes** les migrations `*notification*` et fichiers aura :

| Source | Insère dans `notifications` pour média ? |
|--------|------------------------------------------|
| `profile_media_likes` + trigger counts | **Non** — met à jour `users.avatar_likes` / `banner_likes` uniquement |
| `beef_likes` (`57_beef_likes_aura_trigger.sql`) | **Non** — met à jour `beefs.engagement_score` + `users.lifetime_points` |
| `teaser_likes` (`58_teaser_likes_teaser_score.sql`) | **Non** — sync `teaser_score` uniquement |
| `aura_sparks` (`54_radar_aura_dynamic.sql`) | **Non** — vue `aura_notifications` (pas table `notifications`) |
| Triggers `25_notification_triggers.sql` / `28_full_notifications_fix.sql` | follow, invite, beef_live, gift, message, system — **aucune mention avatar/banner/media** |

**Verdict :** la base **ne notifie pas** les likes avatar/bannière via la table `notifications`. Les alertes Aura profil passent par la vue `aura_notifications` (sparks `profile` / `teaser`), pas par likes média.

### 4.3 RLS `profile_media_likes` (contexte RPC)

```sql
CREATE POLICY "pml_select_own_rows"
  ON public.profile_media_likes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
```

Le viewer ne voit que **ses propres** lignes de like — les compteurs publics viennent de `user_public_profile.avatar_likes` / `banner_likes`.

---

## 5. Investigation commentaires / punchlines / Aura

| Entité | Fichier / table | Système Aura ? |
|--------|-----------------|----------------|
| **Chat arène** | `beef_messages` + `ChatPanel.tsx` | **Non** — messages texte uniquement |
| **Réactions live** | `beef_reactions` + `TikTokStyleArena.tsx` | **Non** — emojis broadcast |
| **Avis médiateur (Vox Populi)** | reviews avec champ `comment` sur profil | **Non** — étoiles + commentaire texte, pas d'Aura |
| **Punchlines** | — | **Aucune** table ni composant nommé `punchline` dans le repo |
| **Commentaires génériques** | `ReviewMediatorModal`, `ChatPanel` | **Non** |

---

## 6. Matrice comparative des patterns UI

| Surface | Like / Unlike | Voir donateurs | InlineAuraGivers refresh |
|---------|---------------|----------------|--------------------------|
| BeefCard feed | Bouton Sparkles séparé | Bouton score + modale | ❌ statique |
| Teaser modale | Div Sparkles séparée | Span score + modale | ❌ statique |
| Profil prestige | N/A (transmit ailleurs) | Div entière → modale profile | ❌ statique |
| Lightbox média | **Bouton unique** englobe tout | ❌ absent | ❌ statique + conflit clic |

---

## 7. Fichiers inspectés (lecture seule)

- `components/InlineAuraGivers.tsx`
- `app/profile/[username]/page.tsx`
- `components/BeefCard.tsx`
- `supabase_migrations/60_profile_media_likes.sql`
- `supabase_migrations/57_beef_likes_aura_trigger.sql`
- `supabase_migrations/58_teaser_likes_teaser_score.sql`
- `supabase_migrations/54_radar_aura_dynamic.sql`
- `supabase_migrations/25_notification_triggers.sql`
- `supabase_migrations/28_full_notifications_fix.sql`

**Aucun fichier source modifié lors de cet audit.**
