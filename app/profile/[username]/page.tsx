'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Share2, UserPlus, UserMinus, Flame, Calendar, MoreVertical, Star, Trophy, TrendingUp, X } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefCard } from '@/components/BeefCard';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { FollowListModal } from '@/components/FollowListModal';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { MediationSummaryPublic } from '@/components/MediationSummaryPublic';
import { resolutionStatusLabel } from '@/lib/mediation-outcome-labels';
import {
  fetchMediatorViewerReviews,
  type MediatorViewerReviewDisplay,
} from '@/lib/mediator-viewer-reviews';
import { escapeForIlikeExact } from '@/lib/ilike-exact';

function getAuraRank(points: number) {
  if (points >= 5000) return { label: 'Archonte', color: 'text-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]' };
  if (points >= 2000) return { label: 'Tribun', color: 'text-plasma-400' };
  if (points >= 500) return { label: 'Orateur', color: 'text-cyan-400' };
  return { label: 'Citoyen', color: 'text-gray-500' };
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string | null;
  points: number;
  is_premium: boolean;
  created_at: string;
}

interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
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
  });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [participantBeefs, setParticipantBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [mediatorReviews, setMediatorReviews] = useState<MediatorViewerReviewDisplay[]>([]);
  const [activeTab, setActiveTab] = useState<'debates' | 'participations' | 'reviews'>('debates');
  const [viewingImage, setViewingImage] = useState<{ url: string; type: 'avatar' | 'banner' } | null>(null);

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

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
          points: number;
          is_premium: boolean;
          created_at: string;
        };
        profileData = {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          bio: p.bio,
          avatar_url: p.avatar_url,
          banner_url: p.banner_url,
          points: p.points,
          is_premium: p.is_premium,
          created_at: p.created_at,
        };
      }

      if (!profileData) {
        setLoading(false);
        return;
      }

      const pd = profileData as unknown as UserProfile;

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

        const viewerReviewsGuest = await fetchMediatorViewerReviews(supabase, pd.id);
        setMediatorReviews(viewerReviewsGuest);
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

      const viewerReviews = await fetchMediatorViewerReviews(supabase, pd.id);
      setMediatorReviews(viewerReviews);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  /** Ancres #beefs / #followers / #following / #participations / #reviews / #vox-populi */
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
      } else if (raw === 'reviews' || raw === 'vox-populi') {
        if (stats.beefs_hosted > 0 || mediatorReviews.length > 0) {
          setActiveTab('reviews');
          setTimeout(() => {
            document.getElementById('profile-section-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 150);
        }
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [profile, stats.beefs_hosted, mediatorReviews.length]);

  const handleFollow = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    if (!profile) return;

    setFollowLoading(true);
    try {
      if (isFollowing) {
        // Unfollow
        await supabase
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', profile.id);

        setIsFollowing(false);
        setStats(prev => ({ ...prev, followers: prev.followers - 1 }));
      } else {
        // Follow
        await supabase
          .from('followers')
          .insert({
            follower_id: user.id,
            following_id: profile.id,
          });

        setIsFollowing(true);
        setStats(prev => ({ ...prev, followers: prev.followers + 1 }));
      }
    } catch (error) {
      console.error('Error toggling follow:', error);
      toast('Erreur lors de l\'action', 'error');
    } finally {
      setFollowLoading(false);
    }
  };

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
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
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

        {/* Profile Header */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl border border-gray-700 overflow-hidden mb-6">
          {/* Cover Image & Back Button */}
          <div className="h-48 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-600/20 relative rounded-t-3xl overflow-hidden">
            <div className="absolute top-4 left-4 z-10">
              <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
            </div>
            {profile.banner_url ? (
              <button
                type="button"
                onClick={() => setViewingImage({ url: profile.banner_url!, type: 'banner' })}
                className="absolute inset-0 z-0 h-full w-full cursor-pointer border-0 p-0"
                aria-label="Voir la bannière en grand"
              >
                <Image src={profile.banner_url} alt="Bannière" fill className="object-cover" sizes="100vw" priority />
              </button>
            ) : (
              <div className="pointer-events-none absolute inset-0 z-0 bg-[url('/grid-pattern.svg')] opacity-10" />
            )}
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            {/* Avatar */}
            <div className="flex items-end justify-between mb-4">
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-gray-900 bg-gradient-to-br from-gray-700 to-gray-800 text-4xl font-black text-white">
                {profile.avatar_url ? (
                  <button
                    type="button"
                    onClick={() => setViewingImage({ url: profile.avatar_url!, type: 'avatar' })}
                    className="relative block h-full w-full cursor-pointer border-0 p-0"
                    aria-label="Voir la photo de profil en grand"
                  >
                    <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" sizes="128px" priority />
                  </button>
                ) : (
                  profile.username[0].toUpperCase()
                )}
              </div>

              <div className="flex gap-2 justify-end">
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

                {!isOwnProfile && user && (
                  <button
                    type="button"
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all ${
                      isFollowing
                        ? 'bg-white/10 text-white hover:bg-white/20'
                        : 'brand-gradient text-black transition-opacity hover:opacity-90'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="h-4 w-4" />
                        <span className="hidden sm:inline">Ne plus suivre</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-4 w-4" />
                        <span className="hidden sm:inline">Suivre</span>
                      </>
                    )}
                  </button>
                )}

                {isOwnProfile && (
                  <Link
                    href={hrefWithFrom('/profile', pathname)}
                    className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600"
                  >
                    Modifier
                  </Link>
                )}
              </div>
            </div>

            {/* User Info & Bio */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-sans text-2xl font-black text-white">{profile.display_name}</h1>
              </div>
              <p className="text-gray-400 text-sm mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-gray-200 text-sm mb-4 leading-relaxed">{profile.bio}</p>
              )}

              {/* Aura & Points (Compact) */}
              <div className="flex flex-wrap items-center gap-3 mb-4">
                {(() => {
                  const rank = getAuraRank(profile.points);
                  return (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md">
                      <Flame className={`h-3.5 w-3.5 ${rank.color}`} aria-hidden />
                      <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.color}`}>
                        {rank.label}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Trophy className="w-4 h-4 text-prestige-gold" />
                  <span className="font-bold text-white">{profile.points.toLocaleString('fr-FR')}</span> pts
                </div>
              </div>

              {/* Métriques Standard (X/Instagram style) */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400">Affaires</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400">Médiations</span>
                </div>
                <button type="button" onClick={() => setShowFollowModal('followers')} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.followers}</span>
                  <span className="text-gray-400">Abonnés</span>
                </button>
                <button type="button" onClick={() => setShowFollowModal('following')} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.following}</span>
                  <span className="text-gray-400">Abonnements</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-gray-500 text-xs mt-4">
                <Calendar className="w-3.5 h-3.5" />
                <span>Rejoint en {new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Publics */}
        <div className="rounded-[2rem] bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 p-6 mt-6 mb-6">
          <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 [scrollbar-width:none] backdrop-blur-md [-ms-overflow-style:none] mb-6 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('debates')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'debates'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Médiations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participations')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'participations'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Affaires
            </button>
            {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                  activeTab === 'reviews'
                    ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                    : 'text-gray-500 hover:text-gray-200'
                }`}
              >
                <Star className="w-4 h-4" />
                Vox Populi
              </button>
            )}
          </div>

          {/* Contenu des Onglets */}
          {activeTab === 'debates' && (
            <div id="profile-section-beefs" className="scroll-mt-24">
              {beefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {beefs.map((beef, idx) => (
                    <div key={beef.id} className="space-y-2">
                      <BeefCard
                        id={beef.id}
                        index={idx}
                        title={beef.title}
                        host_name={beef.host_name}
                        host_username={beef.host_username}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        onClick={() => router.push(`/arena/${beef.id}`)}
                      />
                      {(beef.resolution_status && beef.resolution_status !== 'in_progress') || beef.mediation_summary?.trim() ? (
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
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune médiation pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'participations' && (
            <div id="profile-section-participations" className="scroll-mt-24">
              {participantBeefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {participantBeefs.map((beef, idx) => (
                    <BeefCard
                      key={beef.id}
                      id={beef.id}
                      index={idx}
                      title={beef.title}
                      host_name={beef.host_name}
                      host_username={beef.host_username}
                      status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                      created_at={beef.created_at}
                      viewer_count={beef.viewer_count || 0}
                      tags={beef.tags}
                      scheduled_at={beef.scheduled_at}
                      onClick={() => router.push(`/arena/${beef.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune affaire pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div id="profile-section-reviews" className="scroll-mt-24">
              <h2 className="mb-3 flex items-center gap-2 font-black text-xl text-white">
                <Star className="h-5 w-5 text-prestige-gold" aria-hidden strokeWidth={1.5} />
                Vox Populi · Évaluations
              </h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Les spectateurs déposent un avis depuis la page résumé d&apos;un direct terminé (une fois par beef).
              </p>
              {mediatorReviews.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun avis pour le moment.</p>
              ) : (
                <ul className="space-y-3">
                  {mediatorReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 backdrop-blur-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <ProfileUserLink
                          username={review.authorUsername}
                          className="text-sm font-semibold text-white/80"
                        >
                          {review.authorName}
                        </ProfileUserLink>
                        <span className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-prestige-gold text-prestige-gold" />
                          ))}
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="text-sm text-gray-400 italic leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                      ) : (
                        <p className="text-xs text-gray-600">Note sans commentaire</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
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
                  className={`object-contain ${viewingImage.type === 'avatar' ? 'scale-75 rounded-full' : 'rounded-lg'}`}
                  sizes="(max-width: 768px) 100vw, 896px"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  toast('✨ Aura transmise ! (En développement)', 'success');
                }}
                className="flex items-center gap-3 rounded-full px-8 py-4 font-black text-lg text-black shadow-[0_0_30px_rgba(232,58,20,0.4)] transition-transform brand-gradient hover:scale-105"
              >
                <Flame className="h-6 w-6" />
                Transmettre de l&apos;Aura
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
