# Rapport d'audit source — Profil Public & Profil propriétaire

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** analyser la cascade de requêtes Supabase (`useEffect` / `loadProfile`) en vue de la migration `@tanstack/react-query`

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `app/profile/[username]/page.tsx` | 985 | Profil **public** (par `@username`) |
| `app/profile/ProfileContent.tsx` | 751 | Profil **propriétaire** (`/profile`) |

Les deux fichiers sont **distincts** : la page publique ne délègue pas à `ProfileContent`.

---

## Synthèse cascade — `app/profile/[username]/page.tsx`

Fonction centrale : **`loadProfile`** (`useCallback`, déclenchée par `useEffect` L550–552).

### Branche A — Visiteur **non authentifié** (`!authUser`)

| # | Appel | Table / RPC |
|---|-------|-------------|
| 1 | `supabase.auth.getUser()` | Auth |
| 2 | `supabase.rpc('get_public_profile_by_username')` | RPC |
| 3 | `supabase.rpc('get_public_follow_counts')` | RPC |
| 4 | `supabase.rpc('get_public_profile_beefs_payload')` | RPC (hosted + participated) |

→ **4 appels** (dont 3 RPC agrégées). Pas de check follow ni media likes.

### Branche B — Visiteur **authentifié**

| # | Appel | Table / RPC |
|---|-------|-------------|
| 1 | `supabase.auth.getUser()` | Auth |
| 2 | `user_public_profile.select('*').ilike(username)` | Vue |
| 3a | Si profil = self → `users.select('*')` | Table |
| 3b | Sinon → réutilise `pubRow` | — |
| 4–5 | `followers` count ×2 (following_id / follower_id) | Table |
| 6 | `beefs.select('id').eq('mediator_id')` | Table (count hosted) |
| 7 | `beef_participants.select('beef_id')` | Table (count participated) |
| 8 | `beefs.select('*').limit(10)` | Table (liste hosted) |
| 9 | `beef_participants.select('beef_id, beefs(*)')` | Join |
| 10 | `user_public_profile.select(...).in('id', medIds)` | Table (noms médiateurs) |
| 11 | `followers` check follow (si user ≠ profile) | Table |
| 12 | `profile_media_likes.select('media_type')` | Table (likes viewer) |

→ **jusqu'à 12 appels séquentiels** (auth inclus).

### Mutations hors `loadProfile`

- `handleMediaAuraClick` : `profile_media_likes` insert/delete + event `aura-refresh`
- `FollowButton` : follow/unfollow (composant enfant, fetch séparé)

### `useEffect` auxiliaires

- L162–169 : lock scroll lightbox
- L550–552 : mount → `loadProfile()`
- L554–571 : query param `?view=avatar|banner`
- L574–601 : hash anchors `#followers`, `#following`, `#beefs`, `#participations`

---

## Synthèse cascade — `app/profile/ProfileContent.tsx`

Fonction : **`loadProfile`** inline dans `useEffect` (L100–257), dépendance `[user, toast]`.

| # | Appel | Table |
|---|-------|-------|
| 1 | `users.select('*').maybeSingle()` | Table |
| 2 | (si absent) `users.insert(...)` | Table |
| 3 | `followers` count (following_id) | Table |
| 4 | `followers` count (follower_id) | Table |
| 5 | `beefs.select('*').eq('mediator_id')` | Table |
| 6 | `beef_participants.select('beef_id, beefs(*)')` | Join |
| 7 | `user_public_profile.select(...).in('id', mediatorIds)` | Vue |

→ **7 appels** séquentiels au montage (plus insert conditionnel).

---

## Candidats Query Keys (préparation B2)

| Query key | Source actuelle |
|-----------|-----------------|
| `['public-profile', username]` | Branche profil page publique |
| `['follow-counts', userId]` | followers/following counts |
| `['profile-beefs', userId]` | hosted + participated |
| `['is-following', viewerId, profileId]` | check follow |
| `['media-likes', profileId, viewerId]` | profile_media_likes |
| `['owner-profile', userId]` | ProfileContent loadProfile |

---

# SOURCE — `app/profile/[username]/page.tsx`

```tsx
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Share2, Flame, MoreVertical, TrendingUp, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { FollowListModal } from '@/components/FollowListModal';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileBeefGrid } from '@/components/profile/ProfileBeefGrid';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { FollowButton } from '@/components/FollowButton';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { MediationSummaryPublic } from '@/components/MediationSummaryPublic';
import { resolutionStatusLabel } from '@/lib/mediation-outcome-labels';
import { escapeForIlikeExact } from '@/lib/ilike-exact';

/** Prestige Affiché « Aura » Radar (lifetime_points ; compat si colonne legacy absente). */
function prestigeAuraDisplay(profile: Pick<UserProfile, 'lifetime_points' | 'points'>): number {
  return profile.lifetime_points ?? profile.points;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string | null;
  /** Upload brut avant recadrage (lightbox HD si présent). */
  avatar_original_url?: string | null;
  banner_original_url?: string | null;
  accent_color?: string;
  /** Compteurs agrégés (trigger `profile_media_likes`). */
  avatar_likes?: number;
  banner_likes?: number;
  points: number;
  lifetime_points?: number;
  is_premium: boolean;
  created_at: string;
  beefs_resolved?: number;
  beefs_abandoned?: number;
}

interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
  beefs_resolved: number;
  beefs_abandoned: number;
}

function wisdomFromRaw(raw: Record<string, unknown>): Pick<UserStats, 'beefs_resolved' | 'beefs_abandoned'> {
  return {
    beefs_resolved: Number(raw.beefs_resolved ?? 0),
    beefs_abandoned: Number(raw.beefs_abandoned ?? 0),
  };
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | string;
  resolution_status?: string | null;
  mediation_summary?: string | null;
  tags?: string[];
  scheduled_at?: string;
  created_at: string;
  is_premium: boolean;
  price?: number;
  viewer_count?: number;
  host_name: string;
  host_username?: string | null;
}

/** Lignes renvoyées par get_public_profile_beefs_payload (hors champs médiateur extra). */
function beefFromPublicRpcRow(
  b: Record<string, unknown>,
  host_name: string,
  host_username: string | null,
): Beef {
  return {
    id: String(b.id),
    title: String(b.title ?? ''),
    description: typeof b.description === 'string' ? b.description : undefined,
    status: (typeof b.status === 'string' ? b.status : 'ended') as Beef['status'],
    resolution_status: (b.resolution_status as string | null) ?? null,
    mediation_summary: (b.mediation_summary as string | null) ?? null,
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
    scheduled_at: typeof b.scheduled_at === 'string' ? b.scheduled_at : undefined,
    created_at: String(b.created_at ?? ''),
    is_premium: Boolean(b.is_premium),
    price: Number(b.price ?? 0),
    viewer_count: Number(b.viewer_count ?? 0),
    host_name,
    host_username,
  };
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  const username = params.username as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    beefs_participated: 0,
    beefs_hosted: 0,
    followers: 0,
    following: 0,
    beefs_resolved: 0,
    beefs_abandoned: 0,
  });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [participantBeefs, setParticipantBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'debates' | 'participations'>('debates');
  const [viewingImage, setViewingImage] = useState<{ url: string; type: 'avatar' | 'banner' } | null>(null);
  const [mediaAuraLoading, setMediaAuraLoading] = useState(false);
  const [mediaLikes, setMediaLikes] = useState({
    avatar: { count: 0, liked: false },
    banner: { count: 0, liked: false },
  });
  const [dopamineBursts, setDopamineBursts] = useState<
    { id: number; text: string; minus?: boolean; anchor: 'follow' | 'aura'; solar?: boolean }[]
  >([]);
  const burstSeq = useRef(0);
  const isLikingMedia = useRef(false);

  const queueBurst = useCallback(
    (text: string, anchor: 'follow' | 'aura', minus = false, solar = false) => {
      const id = ++burstSeq.current;
      setDopamineBursts((prev) => [...prev, { id, text, minus, anchor, solar }]);
      setTimeout(() => {
        setDopamineBursts((prev) => prev.filter((b) => b.id !== id));
      }, 520);
    },
    [],
  );

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (viewingImage) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [viewingImage]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const usernameKey = decodeURIComponent(String(username || '')).trim();
      if (!usernameKey) {
        setLoading(false);
        return;
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let profileData: Record<string, unknown> | null = null;

      if (authUser) {
        const { data: pubRow, error: pubErr } = await supabase
          .from('user_public_profile')
          .select('*')
          .ilike('username', escapeForIlikeExact(usernameKey))
          .maybeSingle();
        if (pubErr || !pubRow) {
          setLoading(false);
          return;
        }
        if (authUser.id === pubRow.id) {
          const { data: full, error: fullErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          if (fullErr || !full) {
            setLoading(false);
            return;
          }
          profileData = full as Record<string, unknown>;
        } else {
          profileData = pubRow as Record<string, unknown>;
        }
      } else {
        const { data: pubRows, error: rpcError } = await supabase.rpc('get_public_profile_by_username', {
          p_username: usernameKey,
        });
        if (rpcError) {
          setLoading(false);
          return;
        }
        const pub = Array.isArray(pubRows) ? pubRows[0] : pubRows;
        if (!pub || typeof pub !== 'object') {
          setLoading(false);
          return;
        }
        const p = pub as {
          id: string;
          username: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          banner_url?: string | null;
          avatar_original_url?: string | null;
          banner_original_url?: string | null;
          points: number;
          lifetime_points?: number | null;
          is_premium: boolean;
          created_at: string;
          avatar_likes?: number | null;
          banner_likes?: number | null;
          beefs_resolved?: number | null;
          beefs_abandoned?: number | null;
        };
        profileData = {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          bio: p.bio,
          avatar_url: p.avatar_url,
          banner_url: p.banner_url,
          avatar_original_url: p.avatar_original_url ?? null,
          banner_original_url: p.banner_original_url ?? null,
          points: p.points,
          lifetime_points: p.lifetime_points ?? 0,
          is_premium: p.is_premium,
          created_at: p.created_at,
          avatar_likes: Number(p.avatar_likes ?? 0),
          banner_likes: Number(p.banner_likes ?? 0),
          beefs_resolved: Number(p.beefs_resolved ?? 0),
          beefs_abandoned: Number(p.beefs_abandoned ?? 0),
        };
      }

      if (!profileData) {
        setLoading(false);
        return;
      }

      const raw = profileData as Record<string, unknown>;
      const wisdom = wisdomFromRaw(raw);
      const lpFromRow = Number(raw.lifetime_points ?? 0);
      const pd: UserProfile = {
        ...(profileData as unknown as UserProfile),
        lifetime_points: Number.isFinite(lpFromRow) ? lpFromRow : 0,
        avatar_likes: Number(raw.avatar_likes ?? 0),
        banner_likes: Number(raw.banner_likes ?? 0),
        avatar_original_url: typeof raw.avatar_original_url === 'string' ? raw.avatar_original_url : null,
        banner_original_url: typeof raw.banner_original_url === 'string' ? raw.banner_original_url : null,
        beefs_resolved: wisdom.beefs_resolved,
        beefs_abandoned: wisdom.beefs_abandoned,
      };

      setProfile(pd);

      let followersCount = 0;
      let followingCount = 0;
      if (authUser) {
        const { data: followersData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('following_id', pd.id);
        const { data: followingData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('follower_id', pd.id);
        followersCount = followersData?.length || 0;
        followingCount = followingData?.length || 0;
      } else {
        const { data: fcRows, error: fcErr } = await supabase.rpc('get_public_follow_counts', {
          p_user_id: pd.id,
        });
        if (!fcErr && fcRows?.length) {
          const fc = fcRows[0] as { followers_count?: number | string; following_count?: number | string };
          followersCount = Number(fc.followers_count ?? 0);
          followingCount = Number(fc.following_count ?? 0);
        }
      }

      if (!authUser) {
        const { data: bundleJson, error: bundleErr } = await supabase.rpc('get_public_profile_beefs_payload', {
          p_profile_user_id: pd.id,
        });
        if (bundleErr) {
          console.error('[profile] get_public_profile_beefs_payload', bundleErr);
        }
        const bundle = (bundleJson as Record<string, unknown> | null) ?? {};
        const hosted = Array.isArray(bundle.hosted) ? bundle.hosted : [];
        const participated = Array.isArray(bundle.participated) ? bundle.participated : [];
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;

        setStats({
          beefs_participated: Number(bundle.participated_count ?? 0),
          beefs_hosted: Number(bundle.hosted_count ?? 0),
          followers: followersCount,
          following: followingCount,
          beefs_resolved: wisdom.beefs_resolved,
          beefs_abandoned: wisdom.beefs_abandoned,
        });

        setBeefs(
          hosted.map((row) => beefFromPublicRpcRow(row as Record<string, unknown>, hn, hu)),
        );

        setParticipantBeefs(
          participated.slice(0, 12).map((row) => {
            const r = row as Record<string, unknown>;
            const mid = r.mediator_id as string | undefined;
            const medUn =
              typeof r.mediator_username === 'string' ? r.mediator_username.trim() : '';
            const medDn =
              typeof r.mediator_display_name === 'string' ? r.mediator_display_name.trim() : '';
            const isSelf = !mid || mid === pd.id;
            return beefFromPublicRpcRow(
              r,
              isSelf ? hn : medDn || medUn || 'Médiateur',
              isSelf ? hu : medUn || null,
            );
          }),
        );

        setMediaLikes({
          avatar: { count: pd.avatar_likes ?? 0, liked: false },
          banner: { count: pd.banner_likes ?? 0, liked: false },
        });
        return;
      }

      const { data: beefsData } = await supabase
        .from('beefs')
        .select('id', { count: 'exact' })
        .eq('mediator_id', pd.id);

      const { data: partRows } = await supabase
        .from('beef_participants')
        .select('beef_id')
        .eq('user_id', pd.id);

      const beefsParticipated = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

      setStats({
        beefs_participated: beefsParticipated,
        beefs_hosted: beefsData?.length || 0,
        followers: followersCount,
        following: followingCount,
        beefs_resolved: wisdom.beefs_resolved,
        beefs_abandoned: wisdom.beefs_abandoned,
      });

      // Load user's beefs
      const { data: userBeefs, error: beefsError } = await supabase
        .from('beefs')
        .select('*')
        .eq('mediator_id', pd.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userBeefs) {
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;
        setBeefs(userBeefs.map(beef => ({
          ...beef,
          host_name: hn,
          host_username: hu,
        })));
      }

      const { data: partWithBeefs } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs(*)')
        .eq('user_id', pd.id);

      const pbRaw: Beef[] = [];
      const seenPb = new Set<string>();
      for (const row of partWithBeefs || []) {
        const raw = row.beefs as Beef | Beef[] | null | undefined;
        const b = Array.isArray(raw) ? raw[0] : raw;
        if (!b?.id || seenPb.has(b.id)) continue;
        seenPb.add(b.id);
        pbRaw.push(b as Beef);
      }
      pbRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const medIds = [
        ...new Set(
          pbRaw
            .map((b) => (b as { mediator_id?: string }).mediator_id)
            .filter((id): id is string => !!id && id !== pd.id),
        ),
      ];
      let medNameById: Record<string, string> = {};
      let medUsernameById: Record<string, string> = {};
      if (medIds.length > 0) {
        const { data: mus } = await supabase
          .from('user_public_profile')
          .select('id, display_name, username')
          .in('id', medIds);
        for (const u of mus || []) {
          const row = u as { id: string; display_name?: string; username?: string };
          medNameById[row.id] = row.display_name || row.username || 'Médiateur';
          const un = row.username?.trim();
          if (un) medUsernameById[row.id] = un;
        }
      }
      const selfName = pd.display_name || pd.username;
      const selfUsername = pd.username.trim() || null;
      setParticipantBeefs(
        pbRaw.slice(0, 12).map((b) => {
          const mid = (b as { mediator_id?: string }).mediator_id;
          const host_name =
            !mid || mid === pd.id ? selfName : medNameById[mid] || 'Médiateur';
          const host_username =
            !mid || mid === pd.id ? selfUsername : medUsernameById[mid] ?? null;
          return { ...b, host_name, host_username };
        }),
      );

      // Check if current user follows this profile
      if (user && user.id !== pd.id) {
        const { data: followData } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', pd.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      let likedAvatar = false;
      let likedBanner = false;
      if (authUser && authUser.id !== pd.id) {
        const { data: myMediaLikes } = await supabase
          .from('profile_media_likes')
          .select('media_type')
          .eq('media_owner_id', pd.id)
          .eq('user_id', authUser.id);
        for (const row of myMediaLikes || []) {
          const mt = (row as { media_type?: string }).media_type;
          if (mt === 'avatar') likedAvatar = true;
          if (mt === 'banner') likedBanner = true;
        }
      }
      setMediaLikes({
        avatar: { count: pd.avatar_likes ?? 0, liked: likedAvatar },
        banner: { count: pd.banner_likes ?? 0, liked: likedBanner },
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  const handleMediaAuraClick = useCallback(async () => {
    if (!profile || !viewingImage) return;
    if (!user) {
      toast('Connectez-vous pour liker ce média.', 'info');
      router.push('/login');
      return;
    }
    if (user.id === profile.id) {
      toast('Tu ne peux pas liker ton propre média.', 'info');
      return;
    }

    if (isLikingMedia.current) return;
    isLikingMedia.current = true;

    const type = viewingImage.type;
    const wasLiked = mediaLikes[type].liked;

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

    queueBurst(wasLiked ? '-1 ✨' : '+1 ✨', 'aura', wasLiked, true);

    setMediaAuraLoading(true);
    try {
      if (wasLiked) {
        const { error } = await supabase.from('profile_media_likes').delete().match({
          media_owner_id: profile.id,
          user_id: user.id,
          media_type: type,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('profile_media_likes').insert({
          media_owner_id: profile.id,
          user_id: user.id,
          media_type: type,
        });
        if (error) throw error;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: profile.id } }));
      }
    } catch {
      toast('Impossible de mettre à jour ce like.', 'error');
      setMediaLikes((prev) => ({
        ...prev,
        [type]: {
          liked: wasLiked,
          count: Math.max(0, prev[type].count + (wasLiked ? 1 : -1)),
        },
      }));
    } finally {
      setMediaAuraLoading(false);
      setTimeout(() => {
        isLikingMedia.current = false;
      }, 1000);
    }
  }, [profile, viewingImage, user, mediaLikes, toast, router, queueBurst]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile || typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    const viewType = searchParams.get('view');

    if (viewType === 'avatar' && profile.avatar_url) {
      setViewingImage({
        url: profile.avatar_original_url || profile.avatar_url,
        type: 'avatar',
      });
    } else if (viewType === 'banner' && profile.banner_url) {
      setViewingImage({
        url: profile.banner_original_url || profile.banner_url,
        type: 'banner',
      });
    }
  }, [profile]);

  /** Ancres #beefs / #followers / #following / #participations */
  useEffect(() => {
    if (!profile) return;

    const syncFromHash = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash.slice(1);

      if (raw === 'followers') {
        setShowFollowModal('followers');
      } else if (raw === 'following') {
        setShowFollowModal('following');
      } else if (raw === 'beefs' || raw === 'mediations' || raw === 'debates') {
        setActiveTab('debates');
        setTimeout(() => {
          document.getElementById('profile-section-beefs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } else if (raw === 'participations') {
        setActiveTab('participations');
        setTimeout(() => {
          document.getElementById('profile-section-participations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [profile]);

  const handleShare = () => {
    const url = `${window.location.origin}/profile/${username}`;
    if (navigator.share) {
      navigator.share({
        title: `Profil de ${profile?.display_name || username}`,
        text: `Découvre le profil de ${profile?.display_name || username} sur Beefs!`,
        url: url,
      });
    } else {
      navigator.clipboard.writeText(url);
      toast('Lien copié dans le presse-papiers!', 'success');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Flame className="w-10 h-10 text-gray-600" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Utilisateur introuvable</h2>
          <p className="text-gray-500 mb-6">@{username} n'existe pas ou a été supprimé.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <AppBackButton className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-[2px] [&_span]:text-white [&_span]:hover:text-white" fallback="/feed" />
            <Link
              href="/feed"
              className="px-5 py-2.5 brand-gradient text-white font-semibold rounded-[2px]"
            >
              Accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile Header Unifié */}
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
            beefs_resolved: stats.beefs_resolved,
            beefs_abandoned: stats.beefs_abandoned,
          }}
          backButton={
            <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
          }
          actionButtons={
            <>
              <button
                type="button"
                onClick={handleShare}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition-colors hover:bg-white/10"
                title="Partager"
              >
                <Share2 className="h-4 w-4" />
              </button>
              {!isOwnProfile && (
                <button
                  type="button"
                  onClick={() => setShowReportModal(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition-colors hover:bg-white/10"
                  aria-label="Signaler ou bloquer"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              )}
              {!isOwnProfile && profile && (
                <div className="relative inline-flex items-center justify-center">
                  <AnimatePresence>
                    {dopamineBursts
                      .filter((b) => b.anchor === 'follow')
                      .map((b) => (
                        <motion.span
                          key={b.id}
                          initial={{ opacity: 1, y: 0 }}
                          animate={{ opacity: 0, y: -20 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.5 }}
                          className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black text-xl ${
                            b.minus ? 'text-gray-400' : 'text-brand-300'
                          }`}
                        >
                          {b.text}
                        </motion.span>
                      ))}
                  </AnimatePresence>
                  <FollowButton
                    followingId={profile.id}
                    initialFollowing={isFollowing}
                    currentFollowersCount={stats.followers}
                    currentLifetimePoints={profile.lifetime_points ?? profile.points}
                    loginRedirectPath={pathname}
                    classNameWhenFollowing="relative flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-white/10 text-white hover:bg-white/20"
                    classNameWhenNotFollowing="relative flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-[#00F0FF] text-black shadow-[0_0_18px_rgba(0,240,255,0.45)] hover:brightness-110"
                    onSynced={(p) => {
                      setIsFollowing(p.following);
                      if (p.recipientFollowersCount != null) {
                        setStats((prev) => ({ ...prev, followers: p.recipientFollowersCount! }));
                      }
                      if (p.recipientLifetimePoints != null) {
                        setProfile((prev) =>
                          prev ? { ...prev, lifetime_points: p.recipientLifetimePoints! } : null,
                        );
                      }
                      queueBurst(p.following ? '+10 ✨' : '-10 ✨', 'follow', !p.following);
                    }}
                    onError={(msg) => {
                      toast(msg || "Erreur lors de l'action", 'error');
                    }}
                  />
                </div>
              )}
              {isOwnProfile && (
                <Link
                  href={hrefWithFrom('/profile', pathname)}
                  className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600"
                >
                  Modifier
                </Link>
              )}
            </>
          }
          onBannerClick={
            profile.banner_url
              ? () =>
                  setViewingImage({
                    url: profile.banner_original_url || profile.banner_url!,
                    type: 'banner',
                  })
              : undefined
          }
          onAvatarClick={
            profile.avatar_url
              ? () =>
                  setViewingImage({
                    url: profile.avatar_original_url || profile.avatar_url!,
                    type: 'avatar',
                  })
              : undefined
          }
          onAuraClick={() => setIsAuraModalOpen(true)}
          onStatsClick={(type) => {
            if (type === 'followers') setShowFollowModal('followers');
            if (type === 'following') setShowFollowModal('following');
          }}
        />

        {/* Tabs Publics */}
        <div className="rounded-[2rem] bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 p-6 mt-6 mb-6">
          {/* Navigation Unifiée */}
          <ProfileTabs
            className="mb-6"
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'debates' | 'participations')}
            tabs={[
              { id: 'debates', label: 'Ref', icon: Flame },
              { id: 'participations', label: 'Affaires', icon: TrendingUp },
            ]}
          />

          {/* Contenu des Onglets */}
          {activeTab === 'debates' && (
            <div id="profile-section-beefs" className="scroll-mt-24 mt-4">
              <ProfileBeefGrid
                beefs={beefs}
                emptyMessage="Aucune médiation pour le moment"
                renderExtra={(beef) =>
                  (beef.resolution_status && beef.resolution_status !== 'in_progress') || beef.mediation_summary?.trim() ? (
                    <div className="pl-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                      {beef.resolution_status && beef.resolution_status !== 'in_progress' && (
                        <p className="text-[11px] text-gray-500">
                          Issue de la médiation :{' '}
                          <span className="text-gray-400 font-medium">
                            {resolutionStatusLabel(beef.resolution_status)}
                          </span>
                        </p>
                      )}
                      <MediationSummaryPublic text={beef.mediation_summary ?? ''} />
                    </div>
                  ) : null
                }
              />
            </div>
          )}

          {activeTab === 'participations' && (
            <div id="profile-section-participations" className="scroll-mt-24 mt-4">
              <ProfileBeefGrid
                beefs={participantBeefs}
                emptyMessage="Aucune affaire pour le moment"
                emptyIcon={TrendingUp}
              />
            </div>
          )}

        </div>
      </div>

      {showReportModal && profile && !isOwnProfile && (
        <ReportBlockModal
          userId={profile.id}
          userName={profile.username}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {showFollowModal && (
        <FollowListModal
          userId={profile.id}
          type={showFollowModal}
          onClose={() => setShowFollowModal(null)}
        />
      )}

      {profile && (
        <AuraGiversModal
          isOpen={isAuraModalOpen}
          onClose={() => setIsAuraModalOpen(false)}
          targetId={profile.id}
          type="profile"
          ownerId={profile.id}
        />
      )}

      {profile && viewingImage && (
        <AuraGiversModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          targetId={profile.id}
          type={viewingImage.type}
          ownerId={profile.id}
        />
      )}

      <AnimatePresence>
        {viewingImage && (
          <motion.div
            key="profile-image-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setViewingImage(null)}
          >
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Fermer"
            >
              <X className="h-6 w-6" />
            </button>

            <div
              className="relative flex w-full max-w-3xl flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-6 aspect-square w-full max-w-lg sm:aspect-video sm:max-w-3xl">
                <Image
                  src={viewingImage.url}
                  alt="Aperçu"
                  fill
                  className={
                    viewingImage.type === 'avatar'
                      ? 'scale-75 rounded-full object-contain'
                      : 'rounded-lg object-contain bg-black/80'
                  }
                  sizes="(max-width: 768px) 100vw, 896px"
                />
              </div>

              <div className="relative flex flex-col items-center">
                <AnimatePresence>
                  {dopamineBursts
                    .filter((b) => b.anchor === 'aura')
                    .map((b) => (
                      <motion.span
                        key={b.id}
                        initial={{ opacity: 1, y: 0 }}
                        animate={{ opacity: 0, y: -20 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className={`pointer-events-none absolute left-1/2 top-12 z-[120] -translate-x-1/2 whitespace-nowrap font-black text-xl md:text-2xl ${
                          b.minus
                            ? 'text-gray-400'
                            : b.solar
                              ? 'text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                              : 'text-brand-300'
                        }`}
                      >
                        {b.text}
                      </motion.span>
                    ))}
                </AnimatePresence>

                <div className="flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-slate-900/60 p-1 pr-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleMediaAuraClick();
                    }}
                    disabled={mediaAuraLoading || !!isOwnProfile || !profile}
                    aria-pressed={mediaLikes[viewingImage.type].liked}
                    aria-label={
                      viewingImage.type === 'avatar'
                        ? 'Aura sur la photo de profil'
                        : 'Aura sur la bannière'
                    }
                    title={
                      isOwnProfile ? 'Tu ne peux pas liker ton propre média' : 'Aura sur ce média'
                    }
                    className="flex items-center justify-center rounded-full p-3 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-45"
                  >
                    <Sparkles
                      className={`h-6 w-6 ${
                        mediaLikes[viewingImage.type].liked && !isOwnProfile
                          ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                          : 'text-white'
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMediaModalOpen(true);
                    }}
                    aria-label="Voir les donateurs"
                    className="flex items-center gap-2 rounded-full px-1 py-1 transition-colors hover:bg-white/10"
                  >
                    <InlineAuraGivers
                      targetId={profile.id}
                      type={viewingImage.type}
                      ownerId={profile.id}
                    />
                    <span className="font-mono tabular-nums text-white">
                      {(mediaLikes[viewingImage.type].count ?? 0).toLocaleString()}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

# SOURCE — `app/profile/ProfileContent.tsx`

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { Camera, Share2, Settings, TrendingUp, Users, Trophy, Flame, X, Eye } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { MediationBeefEditorPanel } from '@/components/MediationBeefEditorPanel';
import { ImageCropModal } from '@/components/ImageCropModal';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileBeefGrid } from '@/components/profile/ProfileBeefGrid';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  avatar_original_url?: string | null;
  banner_original_url?: string | null;
  accent_color?: string;
  points: number;
  lifetime_points?: number;
  is_premium: boolean;
  premium_settings?: {
    showPremiumBadge: boolean;
    showPremiumFrame: boolean;
    showPremiumAnimations: boolean;
  };
  created_at: string;
}

interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  beefs_resolved: number;
  beefs_abandoned: number;
  total_views: number;
  followers: number;
  following: number;
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | string;
  resolution_status?: string;
  mediation_summary?: string | null;
  tags?: string[];
  scheduled_at?: string;
  created_at: string;
  is_premium: boolean;
  price?: number;
  viewer_count?: number;
  mediator_id?: string;
  /** Nom affiché sur BeefCard (médiateur du beef) */
  card_host_name?: string;
  card_host_username?: string | null;
}

export default function ProfileContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    beefs_participated: 0,
    beefs_hosted: 0,
    beefs_resolved: 0,
    beefs_abandoned: 0,
    total_views: 0,
    followers: 0,
    following: 0,
  });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [mediationBeefs, setMediationBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'debates'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner' | null>(null);
  const [cropOriginalFile, setCropOriginalFile] = useState<File | null>(null);

  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);

  // Load user profile
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    
    const loadProfile = async () => {
      try {
        let { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!data) {
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              id: user.id,
              email: user.email || '',
              username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
              display_name: user.user_metadata?.display_name || user.user_metadata?.username || user.email?.split('@')[0] || 'User',
              points: 0,
              is_premium: false,
              is_verified: false,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating user');
            throw insertError;
          }

          data = newUser;
        }

        if (data) {
          setProfile({
            id: data.id,
            username: data.username,
            display_name: data.display_name || data.username,
            bio: data.bio,
            avatar_url: data.avatar_url,
            banner_url: data.banner_url,
            avatar_original_url: data.avatar_original_url,
            banner_original_url: data.banner_original_url,
            accent_color: data.accent_color || '#E83A14',
            points: data.points || 0,
            lifetime_points: data.lifetime_points || 0,
            is_premium: data.is_premium || false,
            premium_settings: data.premium_settings || {
              showPremiumBadge: true,
              showPremiumFrame: true,
              showPremiumAnimations: true,
            },
            created_at: data.created_at,
          });

          // Load real stats from database
          const { data: followersData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('following_id', data.id);

          const { data: followingData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('follower_id', data.id);

          const { data: mediatedRows } = await supabase
            .from('beefs')
            .select('*')
            .eq('mediator_id', data.id)
            .order('created_at', { ascending: false });

          const { data: participantRows } = await supabase
            .from('beef_participants')
            .select('beef_id, beefs(*)')
            .eq('user_id', data.id);

          const mediatedList = (mediatedRows || []) as Beef[];
          const fromParticipants: Beef[] = [];
          for (const row of participantRows || []) {
            const raw = row.beefs as Beef | Beef[] | null | undefined;
            if (!raw) continue;
            const b = Array.isArray(raw) ? raw[0] : raw;
            if (b) fromParticipants.push(b as Beef);
          }

          const mergedById = new Map<string, Beef>();
          mediatedList.forEach((b) => mergedById.set(b.id, b));
          fromParticipants.forEach((b) => {
            if (!mergedById.has(b.id)) mergedById.set(b.id, b);
          });

          const mergedSorted = [...mergedById.values()].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          const displayNameSelf = data.display_name || data.username || 'Utilisateur';
          const mediatorIds = [...new Set(mergedSorted.map((b) => b.mediator_id).filter(Boolean))] as string[];
          const mediatorMap: Record<string, string> = {};
          const mediatorUsernameById: Record<string, string> = {};
          if (mediatorIds.length > 0) {
            const { data: mu } = await supabase
              .from('user_public_profile')
              .select('id, display_name, username')
              .in('id', mediatorIds);
            (mu || []).forEach((u: { id: string; display_name?: string; username?: string }) => {
              mediatorMap[u.id] = u.display_name || u.username || 'Médiateur';
              const un = u.username?.trim();
              if (un) mediatorUsernameById[u.id] = un;
            });
          }

          const selfUsername = data.username?.trim() || null;

          const attachHost = (b: Beef): Beef => ({
            ...b,
            card_host_name:
              b.mediator_id === data.id
                ? displayNameSelf
                : (b.mediator_id && mediatorMap[b.mediator_id]) || 'Médiateur',
            card_host_username:
              b.mediator_id === data.id
                ? selfUsername
                : b.mediator_id
                  ? mediatorUsernameById[b.mediator_id] ?? null
                  : null,
          });

          const beefsParticipatedCount = new Set((participantRows || []).map((r: { beef_id: string }) => r.beef_id)).size;
          const beefsHostedCount = mediatedList.length;

          setStats({
            beefs_participated: beefsParticipatedCount,
            beefs_hosted: beefsHostedCount,
            beefs_resolved: data.beefs_resolved ?? 0,
            beefs_abandoned: data.beefs_abandoned ?? 0,
            total_views: 0,
            followers: followersData?.length || 0,
            following: followingData?.length || 0,
          });

          setBeefs(mergedSorted.map(attachHost));
          setMediationBeefs(mediatedList.map((b) => attachHost({ ...b, card_host_name: displayNameSelf })));
        }

      } catch (error) {
        console.error('Error loading profile:', error);
        toast('Erreur lors du chargement du profil. Vérifie la console.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'debates' || tab === 'stats') {
      setActiveTab(tab);
    }
  }, []);

  const closePublicPreview = useCallback(() => setPublicPreviewOpen(false), []);

  const applyMediationBeefPatch = useCallback(
    (beefId: string, patch: { resolution_status?: string; mediation_summary?: string | null }) => {
      setBeefs((prev) => prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b)));
      setMediationBeefs((prev) => prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b)));
    },
    [],
  );

  const goPreviewParticipations = useCallback(() => {
    closePublicPreview();
    router.push('/profile?tab=debates');
  }, [closePublicPreview, router]);

  const goPreviewMediations = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#beefs`);
  }, [closePublicPreview, profile, router]);

  const goPreviewFollowers = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#followers`);
  }, [closePublicPreview, profile, router]);

  const goPreviewFollowing = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#following`);
  }, [closePublicPreview, profile, router]);

  const goStatsParticipations = useCallback(() => {
    setActiveTab('debates');
  }, []);

  const goStatsMediations = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#beefs`);
  }, [profile, router]);

  const goStatsFollowers = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#followers`);
  }, [profile, router]);

  const goStatsFollowing = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#following`);
  }, [profile, router]);

  useEffect(() => {
    if (!publicPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePublicPreview();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [publicPreviewOpen, closePublicPreview]);

  useEffect(() => {
    if (!publicPreviewOpen) return;
    const t = window.setTimeout(() => {
      document.getElementById('profile-preview-close')?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [publicPreviewOpen]);

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    setCropOriginalFile(file);
    setCropImageSrc(url);
    setCropType('banner');
    e.target.value = '';
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    setCropOriginalFile(file);
    setCropImageSrc(url);
    setCropType('avatar');
    e.target.value = '';
  };

  const cancelCropModal = useCallback(() => {
    if (cropImageSrc?.startsWith('blob:')) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    setCropType(null);
    setCropOriginalFile(null);
  }, [cropImageSrc]);

  const handleProcessCroppedImage = async (croppedBlob: Blob) => {
    if (!user || !cropType || !cropOriginalFile) {
      toast('Fichier source introuvable.', 'error');
      return;
    }
    const blobUrlToRevoke = cropImageSrc;
    const originalFile = cropOriginalFile;
    setUploading(true);
    try {
      const rawParts = originalFile.name.split('.');
      const rawExt = rawParts.length > 1 ? rawParts.pop()! : 'jpg';
      const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const ts = Date.now();

      const originalPath = `${user.id}/original_${user.id}_${ts}.${safeExt}`;
      const cropPath = `${user.id}/${user.id}_${ts}.jpg`;

      const { error: upOriginalError } = await supabase.storage.from('avatars').upload(originalPath, originalFile, {
        upsert: true,
        contentType: originalFile.type || 'application/octet-stream',
      });
      if (upOriginalError) throw upOriginalError;

      const { error: upCropError } = await supabase.storage.from('avatars').upload(cropPath, croppedBlob, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (upCropError) throw upCropError;

      const { data: originalRef } = supabase.storage.from('avatars').getPublicUrl(originalPath);
      const { data: cropRef } = supabase.storage.from('avatars').getPublicUrl(cropPath);
      const originalUrl = originalRef.publicUrl;
      const cropUrl = cropRef.publicUrl;

      if (cropType === 'banner') {
        const { error: updateError } = await supabase
          .from('users')
          .update({ banner_url: cropUrl, banner_original_url: originalUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;
        setProfile((prev) =>
          prev ? { ...prev, banner_url: cropUrl, banner_original_url: originalUrl } : null,
        );
        toast('Bannière mise à jour !', 'success');
      } else {
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: cropUrl, avatar_original_url: originalUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;
        setProfile((prev) =>
          prev ? { ...prev, avatar_url: cropUrl, avatar_original_url: originalUrl } : null,
        );
        toast('Avatar mis à jour avec succès!', 'success');
      }
    } catch (error) {
      console.error('Error uploading cropped image:', error);
      toast(
        cropType === 'banner'
          ? "Erreur lors de l'upload de la bannière"
          : "Erreur lors de l'upload de l'avatar.",
        'error',
      );
    } finally {
      setUploading(false);
      if (blobUrlToRevoke?.startsWith('blob:')) URL.revokeObjectURL(blobUrlToRevoke);
      setCropImageSrc(null);
      setCropType(null);
      setCropOriginalFile(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Cover skeleton */}
          <div className="skeleton h-40 rounded-2xl mb-6" />
          {/* Avatar + info skeleton */}
          <div className="flex items-end gap-4 -mt-16 mb-6 px-4">
            <div className="skeleton w-24 h-24 rounded-[2rem] ring-4 ring-black" />
            <div className="flex-1 space-y-2 pb-2">
              <div className="skeleton h-6 w-40" />
              <div className="skeleton h-4 w-24" />
            </div>
          </div>
          {/* Stats skeleton */}
          <div className="flex gap-6 mb-6 px-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-8 w-20 rounded-lg" />
            ))}
          </div>
          {/* Tabs skeleton */}
          <div className="card p-6">
            <div className="flex gap-4 mb-6">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-28 rounded-[2px]" />
              ))}
            </div>
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-[2px]" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">Erreur lors du chargement du profil</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile Header Unifié */}
        <ProfileHeader
          mode="owner"
          profile={{
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            bio: profile.bio,
            avatar_url: profile.avatar_url,
            banner_url: profile.banner_url,
            accent_color: profile.accent_color,
            is_premium: profile.is_premium,
            lifetime_points: profile.lifetime_points ?? profile.points,
          }}
          stats={{
            beefs_participated: stats.beefs_participated,
            beefs_hosted: stats.beefs_hosted,
            followers: stats.followers,
            following: stats.following,
            beefs_resolved: stats.beefs_resolved,
            beefs_abandoned: stats.beefs_abandoned,
          }}
          backButton={
            <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
          }
          uploadOverlayBanner={
            <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-all cursor-pointer opacity-0 hover:opacity-100 z-10">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-[2px] text-white text-sm font-medium">
                <Camera className="w-4 h-4" />
                <span>Changer la bannière</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
            </label>
          }
          uploadOverlayAvatar={
            <label className="absolute bottom-0 right-0 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg transition-colors hover:bg-brand-600">
              <Camera className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          }
          actionButtons={
            <>
              <button
                type="button"
                onClick={async () => {
                  const shareData = {
                    title: `${profile.display_name} sur Beefs`,
                    text: `Regarde le profil de ${profile.display_name} sur Beefs !`,
                    url: `${window.location.origin}/profile/${profile.username}`,
                  };
                  if (navigator.share) {
                    try {
                      await navigator.share(shareData);
                    } catch (_) {}
                  } else {
                    await navigator.clipboard.writeText(shareData.url);
                    toast('Lien copié !', 'success');
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                title="Partager"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setPublicPreviewOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                title="Aperçu public"
              >
                <Eye className="h-4 w-4" aria-hidden />
              </button>
              <Link
                href={hrefWithFrom('/settings', pathname)}
                className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 font-sans font-semibold text-white transition-colors hover:bg-brand-600"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Modifier</span>
              </Link>
            </>
          }
          onAuraClick={() => setIsAuraModalOpen(true)}
          onStatsClick={(type) => {
            if (type === 'participated') goStatsParticipations();
            if (type === 'hosted') goStatsMediations();
            if (type === 'followers') goStatsFollowers();
            if (type === 'following') goStatsFollowing();
          }}
        />

        {/* Tabs */}
        <div className="rounded-[2rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl p-6">
          {/* Navigation Unifiée */}
          <ProfileTabs
            className="mb-6"
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'stats' | 'debates')}
            tabs={[
              { id: 'stats', label: 'Statistiques', icon: TrendingUp },
              { id: 'debates', label: 'Mes Affaires', icon: Flame },
            ]}
          />

          {activeTab === 'stats' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-4">📈 Statistiques</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-6 max-w-3xl">
                Le Taux de Fiabilité (Sagesse) est affiché sur ton en-tête de profil public et provient des compteurs
                synchronisés en base (<strong className="text-gray-400">beefs résolus</strong> /{' '}
                <strong className="text-gray-400">abandons</strong>).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-[2px] p-6">
                  <Trophy className="w-8 h-8 text-yellow-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Beefs Hébergés</h3>
                  <p className="text-3xl font-black text-white">{stats.beefs_hosted}</p>
                  <p className="text-gray-400 text-sm mt-1">Total de médiations effectuées</p>
                </div>
                <div className="bg-white/5 rounded-[2px] p-6">
                  <Users className="w-8 h-8 text-blue-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Vues Totales</h3>
                  <p className="text-3xl font-black text-white">{stats.total_views.toLocaleString()}</p>
                  <p className="text-gray-400 text-sm mt-1">Popularité des beefs</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'debates' && (
            <div className="mt-4">
              <ProfileBeefGrid
                beefs={beefs.map((b) => ({
                  ...b,
                  host_name: b.card_host_name || profile?.display_name || profile?.username || 'Utilisateur',
                  host_username: b.card_host_username,
                }))}
                emptyMessage="Aucun beef pour le moment"
                emptyAction={
                  <Link
                    href={hrefWithFrom('/create', pathname)}
                    className="inline-block px-6 py-3 brand-gradient hover:opacity-90 text-black font-bold rounded-[2px] transition-all mt-4"
                  >
                    Créer un beef
                  </Link>
                }
                renderExtra={(beef) =>
                  user && beef.mediator_id === user.id ? (
                    <MediationBeefEditorPanel
                      beefId={beef.id}
                      resolutionStatus={beef.resolution_status}
                      mediationSummary={beef.mediation_summary ?? ''}
                      onSaved={(patch) => applyMediationBeefPatch(beef.id, patch)}
                    />
                  ) : null
                }
              />
            </div>
          )}

        </div>
      </div>

      {publicPreviewOpen && (
        <div
          className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
          role="presentation"
          onClick={closePublicPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-preview-title"
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[2rem] border border-white/[0.1] bg-white/[0.04] backdrop-blur-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
              <h2 id="profile-preview-title" className="text-lg font-bold text-white">
                Aperçu
              </h2>
              <button
                type="button"
                id="profile-preview-close"
                onClick={closePublicPreview}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 touch-manipulation"
                aria-label="Fermer l’aperçu"
              >
                <X className="w-6 h-6 sm:w-5 sm:h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-y-auto max-h-[min(78vh,760px)]">

              <ProfileHeader
                mode="preview"
                profile={{
                  id: profile.id,
                  username: profile.username,
                  display_name: profile.display_name,
                  bio: profile.bio,
                  avatar_url: profile.avatar_url,
                  banner_url: profile.banner_url,
                  accent_color: profile.accent_color,
                  is_premium: profile.is_premium,
                  lifetime_points: profile.lifetime_points ?? profile.points,
                }}
                stats={{
                  beefs_participated: stats.beefs_participated,
                  beefs_hosted: stats.beefs_hosted,
                  followers: stats.followers,
                  following: stats.following,
                  beefs_resolved: stats.beefs_resolved,
                  beefs_abandoned: stats.beefs_abandoned,
                }}
                onAuraClick={undefined}
                onStatsClick={(type) => {
                  if (type === 'participated') goPreviewParticipations();
                  if (type === 'hosted') goPreviewMediations();
                  if (type === 'followers') goPreviewFollowers();
                  if (type === 'following') goPreviewFollowing();
                }}
              />

              <div className="px-2">
                <p className="text-center mt-2">
                  <Link
                    href={`/profile/${encodeURIComponent(profile.username)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-400 text-sm font-semibold hover:underline"
                    onClick={() => setPublicPreviewOpen(false)}
                  >
                    Ouvrir la page publique dans un onglet
                  </Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          cropShape={cropType === 'banner' ? 'rect' : 'round'}
          aspect={cropType === 'banner' ? 3 : 1}
          onCropComplete={(blob) => void handleProcessCroppedImage(blob)}
          onCancel={cancelCropModal}
        />
      )}

      <AuraGiversModal
        isOpen={isAuraModalOpen}
        onClose={() => setIsAuraModalOpen(false)}
        targetId={profile.id}
        type="profile"
        ownerId={profile.id}
      />
    </div>
  );
}
```

---

*Extraction terminée — aucune modification du code source applicatif.*
