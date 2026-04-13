'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Share2, UserPlus, UserMinus, Flame, Calendar, MoreVertical, Star } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefCard } from '@/components/BeefCard';
import { FollowListModal } from '@/components/FollowListModal';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { type StatsShortcuts, mergeStatsShortcuts } from '@/lib/profile-stats-shortcuts';
import { MediationSummaryPublic } from '@/components/MediationSummaryPublic';
import { resolutionStatusLabel } from '@/lib/mediation-outcome-labels';
import {
  fetchMediatorViewerReviews,
  type MediatorViewerReviewDisplay,
} from '@/lib/mediator-viewer-reviews';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
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
  const [statsShortcuts, setStatsShortcuts] = useState<StatsShortcuts>(() => mergeStatsShortcuts(undefined));
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [participantBeefs, setParticipantBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [mediatorReviews, setMediatorReviews] = useState<MediatorViewerReviewDisplay[]>([]);

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      // Load user profile
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();

      if (profileError || !profileData) {
        setLoading(false);
        return;
      }

      setProfile(profileData);

      setStatsShortcuts(
        mergeStatsShortcuts(
          (profileData as { premium_settings?: { statsShortcuts?: unknown } }).premium_settings?.statsShortcuts,
        ),
      );

      // Load stats
      const { data: followersData } = await supabase
        .from('followers')
        .select('id', { count: 'exact' })
        .eq('following_id', profileData.id);

      const { data: followingData } = await supabase
        .from('followers')
        .select('id', { count: 'exact' })
        .eq('follower_id', profileData.id);

      const { data: beefsData } = await supabase
        .from('beefs')
        .select('id', { count: 'exact' })
        .eq('mediator_id', profileData.id);

      const { data: partRows } = await supabase
        .from('beef_participants')
        .select('beef_id')
        .eq('user_id', profileData.id);

      const beefsParticipated = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

      setStats({
        beefs_participated: beefsParticipated,
        beefs_hosted: beefsData?.length || 0,
        followers: followersData?.length || 0,
        following: followingData?.length || 0,
      });

      // Load user's beefs
      const { data: userBeefs, error: beefsError } = await supabase
        .from('beefs')
        .select('*')
        .eq('mediator_id', profileData.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userBeefs) {
        setBeefs(userBeefs.map(beef => ({
          ...beef,
          host_name: profileData.display_name || profileData.username,
        })));
      }

      const { data: partWithBeefs } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs(*)')
        .eq('user_id', profileData.id);

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
            .filter((id): id is string => !!id && id !== profileData.id),
        ),
      ];
      let medNameById: Record<string, string> = {};
      if (medIds.length > 0) {
        const { data: mus } = await supabase
          .from('users')
          .select('id, display_name, username')
          .in('id', medIds);
        medNameById = Object.fromEntries(
          (mus || []).map((u: { id: string; display_name?: string; username?: string }) => [
            u.id,
            u.display_name || u.username || 'Médiateur',
          ]),
        );
      }
      const selfName = profileData.display_name || profileData.username;
      setParticipantBeefs(
        pbRaw.slice(0, 12).map((b) => {
          const mid = (b as { mediator_id?: string }).mediator_id;
          const host_name =
            !mid || mid === profileData.id ? selfName : medNameById[mid] || 'Médiateur';
          return { ...b, host_name };
        }),
      );

      // Check if current user follows this profile
      if (user && user.id !== profileData.id) {
        const { data: followData } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', profileData.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      const viewerReviews = await fetchMediatorViewerReviews(supabase, profileData.id);
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

  /** Ancres #beefs / #followers / #following depuis l’aperçu profil ou liens directs */
  useEffect(() => {
    if (!profile) return;

    const syncFromHash = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash.slice(1);
      if (raw === 'followers') {
        setShowFollowModal('followers');
      } else if (raw === 'following') {
        setShowFollowModal('following');
      }
      if (raw === 'beefs' || raw === 'mediations') {
        requestAnimationFrame(() => {
          document.getElementById('profile-section-beefs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
      if (raw === 'participations') {
        requestAnimationFrame(() => {
          document.getElementById('profile-section-participations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [profile]);

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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
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
    <div className="min-h-screen bg-black">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />

        {/* Profile Header */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl border border-gray-700 overflow-hidden mb-6">
          {/* Cover Image */}
          <div className="h-48 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-600/20 relative">
            <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10"></div>
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            {/* Avatar */}
            <div className="flex items-end justify-between mb-4">
              <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-4 border-gray-900 overflow-hidden flex items-center justify-center text-4xl font-black text-white">
                {profile.avatar_url ? (
                  <Image
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    fill
                    className="object-cover"
                    sizes="128px"
                    priority
                  />
                ) : (
                  profile.username[0].toUpperCase()
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleShare}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white font-semibold transition-colors flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Partager</span>
                </button>

                {!isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white font-semibold transition-colors flex items-center justify-center"
                    aria-label="Signaler ou bloquer"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                )}

                {!isOwnProfile && user && (
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                      isFollowing
                        ? 'bg-white/10 hover:bg-white/20 text-white'
                        : 'brand-gradient hover:opacity-90 text-black transition-opacity'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserMinus className="w-4 h-4" />
                        <span className="hidden sm:inline">Ne plus suivre</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span className="hidden sm:inline">Suivre</span>
                      </>
                    )}
                  </button>
                )}

                {isOwnProfile && (
                  <Link
                    href={hrefWithFrom('/profile', pathname)}
                    className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-white font-semibold transition-colors"
                  >
                    Modifier le profil
                  </Link>
                )}
              </div>
            </div>

            {/* User Info */}
            <div className="mb-4">
              <h1 className="text-3xl font-black text-white mb-1">{profile.display_name}</h1>
              <p className="text-gray-400 text-sm">@{profile.username}</p>
            </div>

            {profile.bio && (
              <p className="text-gray-300 mb-4">{profile.bio}</p>
            )}

            {/* Stats Row — même logique que le profil éditable (premium_settings.statsShortcuts) */}
            <div className="flex gap-6 mb-4 flex-wrap">
              {statsShortcuts.participations ? (
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/profile/${encodeURIComponent(username)}#participations`);
                    requestAnimationFrame(() => {
                      document.getElementById('profile-section-participations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                  className="text-left hover:opacity-90 transition-opacity"
                >
                  <span className="text-2xl font-black text-white">{stats.beefs_participated}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Participations</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400 text-sm ml-1">Participations</span>
                </div>
              )}
              {statsShortcuts.mediations ? (
                <button
                  type="button"
                  onClick={() => {
                    router.push(`/profile/${encodeURIComponent(username)}#beefs`);
                    requestAnimationFrame(() => {
                      document.getElementById('profile-section-beefs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    });
                  }}
                  className="text-left hover:opacity-90 transition-opacity"
                >
                  <span className="text-2xl font-black text-white">{stats.beefs_hosted}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Médiations</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400 text-sm ml-1">Médiations</span>
                </div>
              )}
              {statsShortcuts.followers ? (
                <button
                  type="button"
                  onClick={() => setShowFollowModal('followers')}
                  className="hover:opacity-80 transition-opacity"
                >
                  <span className="text-2xl font-black text-white">{stats.followers}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Abonnés</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.followers}</span>
                  <span className="text-gray-400 text-sm ml-1">Abonnés</span>
                </div>
              )}
              {statsShortcuts.following ? (
                <button
                  type="button"
                  onClick={() => setShowFollowModal('following')}
                  className="hover:opacity-80 transition-opacity"
                >
                  <span className="text-2xl font-black text-white">{stats.following}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Abonnements</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.following}</span>
                  <span className="text-gray-400 text-sm ml-1">Abonnements</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-brand-400" />
                <span className="text-2xl font-black text-white">{profile.points}</span>
                <span className="text-gray-400 text-sm">Points</span>
              </div>
            </div>

            {/* Member since */}
            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Calendar className="w-4 h-4" />
              <span>
                Membre depuis {new Date(profile.created_at).toLocaleDateString('fr-FR', {
                  month: 'long',
                  year: 'numeric'
                })}
              </span>
            </div>
          </div>
        </div>

        {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
          <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700 p-6 mb-6 scroll-mt-24">
            <h2 className="text-xl font-black text-white mb-4 flex items-center gap-2">
              <Star className="w-5 h-5 text-prestige-gold" strokeWidth={1.5} aria-hidden />
              Livre d&apos;Or · avis spectateurs
            </h2>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Les spectateurs déposent un avis depuis la page résumé d&apos;un direct terminé (une fois par beef).
            </p>
            {mediatorReviews.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Aucun avis pour le moment.</p>
            ) : (
              <ul className="space-y-3">
                {mediatorReviews.slice(0, 12).map((review) => (
                  <li
                    key={review.id}
                    className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 backdrop-blur-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-sm font-semibold text-white/80">{review.authorName}</span>
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

        {/* Participations (autres beefs que le profil médié) */}
        {participantBeefs.length > 0 && (
          <div
            id="profile-section-participations"
            className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700 p-6 scroll-mt-24 mb-6"
          >
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
              <Flame className="w-6 h-6 text-orange-400" />
              Participations
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {participantBeefs.map((beef, idx) => (
                <BeefCard
                  key={beef.id}
                  id={beef.id}
                  index={idx}
                  title={beef.title}
                  host_name={beef.host_name}
                  status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                  created_at={beef.created_at}
                  viewer_count={beef.viewer_count || 0}
                  tags={beef.tags}
                  scheduled_at={beef.scheduled_at}
                  is_premium={beef.is_premium}
                  price={beef.price}
                  onClick={() => router.push(`/arena/${beef.id}`)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Beefs List */}
        <div
          id="profile-section-beefs"
          className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700 p-6 scroll-mt-24"
        >
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
            <Flame className="w-6 h-6 text-brand-400" />
            Beefs de {profile.display_name}
          </h2>

          {beefs.length > 0 ? (
            <div className="grid grid-cols-1 gap-4">
              {beefs.map((beef, idx) => (
                <div key={beef.id} className="space-y-2">
                  <BeefCard
                    id={beef.id}
                    index={idx}
                    title={beef.title}
                    host_name={beef.host_name}
                    status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                    created_at={beef.created_at}
                    viewer_count={beef.viewer_count || 0}
                    tags={beef.tags}
                    scheduled_at={beef.scheduled_at}
                    is_premium={beef.is_premium}
                    price={beef.price}
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
              <p className="text-gray-400">Aucun beef pour le moment</p>
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
    </div>
  );
}
