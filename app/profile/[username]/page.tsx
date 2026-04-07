'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Share2, UserPlus, UserMinus, Flame, Calendar, MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefCard } from '@/components/BeefCard';
import { FollowListModal } from '@/components/FollowListModal';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';

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
  beefs_hosted: number;
  followers: number;
  following: number;
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | string;
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
  const [stats, setStats] = useState<UserStats>({ beefs_hosted: 0, followers: 0, following: 0 });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

  useEffect(() => {
    loadProfile();
  }, [username]);

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
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [profile?.id]);

  const loadProfile = async () => {
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

      setStats({
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
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

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
            <AppBackButton className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-xl [&_span]:text-white [&_span]:hover:text-white" fallback="/feed" />
            <Link
              href="/feed"
              className="px-5 py-2.5 brand-gradient text-white font-semibold rounded-xl"
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
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-4 border-gray-900 overflow-hidden flex items-center justify-center text-4xl font-black text-white">
                {profile.avatar_url ? (
                  <img
                    src={profile.avatar_url}
                    alt={profile.display_name}
                    className="w-full h-full object-cover"
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

            {/* Stats Row */}
            <div className="flex gap-6 mb-4 flex-wrap">
              <div>
                <span className="text-2xl font-black text-white">{stats.beefs_hosted}</span>
                <span className="text-gray-400 text-sm ml-1">Beefs</span>
              </div>
              <button
                type="button"
                onClick={() => setShowFollowModal('followers')}
                className="hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl font-black text-white">{stats.followers}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnés</span>
              </button>
              <button
                type="button"
                onClick={() => setShowFollowModal('following')}
                className="hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl font-black text-white">{stats.following}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnements</span>
              </button>
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
