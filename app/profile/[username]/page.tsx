'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Share2, UserPlus, UserMinus, Flame, Trophy, Users, Calendar, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefCard } from '@/components/BeefCard';
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
  const { user } = useAuth();
  const { toast } = useToast();
  const username = params.username as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({ beefs_hosted: 0, followers: 0, following: 0 });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

  useEffect(() => {
    loadProfile();
  }, [username]);

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
        console.error('Profile not found:', profileError);
        router.push('/feed');
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
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-semibold">Retour</span>
        </button>

        {/* Profile Header */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl border border-gray-700 overflow-hidden mb-6">
          {/* Cover Image */}
          <div className="h-48 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-yellow-500/20 relative">
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

                {!isOwnProfile && user && (
                  <button
                    onClick={handleFollow}
                    disabled={followLoading}
                    className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${
                      isFollowing
                        ? 'bg-white/10 hover:bg-white/20 text-white'
                        : 'bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-black'
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
                    href="/profile"
                    className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold transition-colors"
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
                onClick={() => {/* TODO: Show followers modal */}}
                className="hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl font-black text-white">{stats.followers}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnés</span>
              </button>
              <button
                onClick={() => {/* TODO: Show following modal */}}
                className="hover:opacity-80 transition-opacity"
              >
                <span className="text-2xl font-black text-white">{stats.following}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnements</span>
              </button>
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
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
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700 p-6">
          <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-2">
            <Flame className="w-6 h-6 text-orange-500" />
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
    </div>
  );
}
