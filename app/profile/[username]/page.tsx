'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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

type MediaLikesState = {
  avatar: { count: number; liked: boolean };
  banner: { count: number; liked: boolean };
};

type PublicProfileQueryData = {
  profile: UserProfile | null;
  stats: UserStats;
  beefs: Beef[];
  participantBeefs: Beef[];
  mediaLikes: MediaLikesState;
  isFollowing: boolean;
};

const EMPTY_STATS: UserStats = {
  beefs_participated: 0,
  beefs_hosted: 0,
  followers: 0,
  following: 0,
  beefs_resolved: 0,
  beefs_abandoned: 0,
};

const EMPTY_MEDIA_LIKES: MediaLikesState = {
  avatar: { count: 0, liked: false },
  banner: { count: 0, liked: false },
};

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const rawUsername = Array.isArray(params.username) ? params.username[0] : params.username;
  let username: string;
  try {
    username = decodeURIComponent(String(rawUsername ?? '')).trim();
  } catch {
    username = String(rawUsername ?? '').trim();
  }

  const [isFollowing, setIsFollowing] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'debates' | 'participations'>('debates');
  const [viewingImage, setViewingImage] = useState<{ url: string; type: 'avatar' | 'banner' } | null>(null);
  const [mediaAuraLoading, setMediaAuraLoading] = useState(false);
  const [mediaLikes, setMediaLikes] = useState<MediaLikesState>(EMPTY_MEDIA_LIKES);
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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (viewingImage) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [viewingImage]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['public-profile', username, user?.id],
    enabled: !!username,
    queryFn: async (): Promise<PublicProfileQueryData> => {
      const usernameKey = username;
      let resultStats: UserStats = { ...EMPTY_STATS };
      let resultBeefs: Beef[] = [];
      let resultParticipantBeefs: Beef[] = [];
      let resultMediaLikes: MediaLikesState = { ...EMPTY_MEDIA_LIKES };
      let resultIsFollowing = false;

      const emptyResult = (): PublicProfileQueryData => ({
        profile: null,
        stats: resultStats,
        beefs: resultBeefs,
        participantBeefs: resultParticipantBeefs,
        mediaLikes: resultMediaLikes,
        isFollowing: resultIsFollowing,
      });

      if (!usernameKey) return emptyResult();

      try {
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
          if (pubErr || !pubRow) return emptyResult();
          if (authUser.id === pubRow.id) {
            const { data: full, error: fullErr } = await supabase
              .from('users')
              .select('*')
              .eq('id', authUser.id)
              .single();
            if (fullErr || !full) return emptyResult();
            profileData = full as Record<string, unknown>;
          } else {
            profileData = pubRow as Record<string, unknown>;
          }
        } else {
          const { data: pubRows, error: rpcError } = await supabase.rpc('get_public_profile_by_username', {
            p_username: usernameKey,
          });
          if (rpcError) return emptyResult();
          const pub = Array.isArray(pubRows) ? pubRows[0] : pubRows;
          if (!pub || typeof pub !== 'object') return emptyResult();
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

        if (!profileData) return emptyResult();

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

          resultStats = {
            beefs_participated: Number(bundle.participated_count ?? 0),
            beefs_hosted: Number(bundle.hosted_count ?? 0),
            followers: followersCount,
            following: followingCount,
            beefs_resolved: wisdom.beefs_resolved,
            beefs_abandoned: wisdom.beefs_abandoned,
          };

          resultBeefs = hosted.map((row) => beefFromPublicRpcRow(row as Record<string, unknown>, hn, hu));

          resultParticipantBeefs = participated.slice(0, 12).map((row) => {
            const r = row as Record<string, unknown>;
            const mid = r.mediator_id as string | undefined;
            const medUn = typeof r.mediator_username === 'string' ? r.mediator_username.trim() : '';
            const medDn = typeof r.mediator_display_name === 'string' ? r.mediator_display_name.trim() : '';
            const isSelf = !mid || mid === pd.id;
            return beefFromPublicRpcRow(
              r,
              isSelf ? hn : medDn || medUn || 'Médiateur',
              isSelf ? hu : medUn || null,
            );
          });

          resultMediaLikes = {
            avatar: { count: pd.avatar_likes ?? 0, liked: false },
            banner: { count: pd.banner_likes ?? 0, liked: false },
          };

          return {
            profile: pd,
            stats: resultStats,
            beefs: resultBeefs,
            participantBeefs: resultParticipantBeefs,
            mediaLikes: resultMediaLikes,
            isFollowing: resultIsFollowing,
          };
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

        resultStats = {
          beefs_participated: beefsParticipated,
          beefs_hosted: beefsData?.length || 0,
          followers: followersCount,
          following: followingCount,
          beefs_resolved: wisdom.beefs_resolved,
          beefs_abandoned: wisdom.beefs_abandoned,
        };

        const { data: userBeefs } = await supabase
          .from('beefs')
          .select('*')
          .eq('mediator_id', pd.id)
          .order('created_at', { ascending: false })
          .limit(10);

        if (userBeefs) {
          const hn = pd.display_name || pd.username;
          const hu = pd.username.trim() || null;
          resultBeefs = userBeefs.map((beef) => ({
            ...beef,
            host_name: hn,
            host_username: hu,
          }));
        }

        const { data: partWithBeefs } = await supabase
          .from('beef_participants')
          .select('beef_id, beefs(*)')
          .eq('user_id', pd.id);

        const pbRaw: Beef[] = [];
        const seenPb = new Set<string>();
        for (const row of partWithBeefs || []) {
          const beefRaw = row.beefs as Beef | Beef[] | null | undefined;
          const b = Array.isArray(beefRaw) ? beefRaw[0] : beefRaw;
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
        const medNameById: Record<string, string> = {};
        const medUsernameById: Record<string, string> = {};
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
        resultParticipantBeefs = pbRaw.slice(0, 12).map((b) => {
          const mid = (b as { mediator_id?: string }).mediator_id;
          const host_name = !mid || mid === pd.id ? selfName : medNameById[mid] || 'Médiateur';
          const host_username = !mid || mid === pd.id ? selfUsername : medUsernameById[mid] ?? null;
          return { ...b, host_name, host_username };
        });

        if (user && user.id !== pd.id) {
          const { data: followData } = await supabase
            .from('followers')
            .select('id')
            .eq('follower_id', user.id)
            .eq('following_id', pd.id)
            .maybeSingle();

          resultIsFollowing = !!followData;
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
        resultMediaLikes = {
          avatar: { count: pd.avatar_likes ?? 0, liked: likedAvatar },
          banner: { count: pd.banner_likes ?? 0, liked: likedBanner },
        };

        return {
          profile: pd,
          stats: resultStats,
          beefs: resultBeefs,
          participantBeefs: resultParticipantBeefs,
          mediaLikes: resultMediaLikes,
          isFollowing: resultIsFollowing,
        };
      } catch (error) {
        console.error('Error loading profile:', error);
        throw error;
      }
    },
  });

  const profile = data?.profile ?? null;
  const stats = data?.stats ?? EMPTY_STATS;
  const beefs = data?.beefs ?? [];
  const participantBeefs = data?.participantBeefs ?? [];

  useEffect(() => {
    if (data) {
      setIsFollowing(data.isFollowing);
      setMediaLikes(data.mediaLikes);
    }
  }, [data]);

  const isOwnProfile = user && profile && user.id === profile.id;

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
                      queryClient.setQueryData<PublicProfileQueryData>(
                        ['public-profile', username, user?.id],
                        (old) => {
                          if (!old?.profile) return old;
                          return {
                            ...old,
                            isFollowing: p.following,
                            stats:
                              p.recipientFollowersCount != null
                                ? { ...old.stats, followers: p.recipientFollowersCount }
                                : old.stats,
                            profile:
                              p.recipientLifetimePoints != null
                                ? { ...old.profile, lifetime_points: p.recipientLifetimePoints }
                                : old.profile,
                          };
                        },
                      );
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
