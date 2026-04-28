'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, Plus, TrendingUp, Flame, Eye, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CreateBeefForm } from '@/components/CreateBeefForm';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';
import { submitNewBeef } from '@/lib/submitNewBeef';
import type { SubmitBeefPayload } from '@/lib/submitNewBeef';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

// Feed logic like X/Twitter: "Pour vous" = algorithmic, "Abonnements" = chronological

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  isMainParticipant: boolean; // Les 2 personnes principales en beef
}

interface Room {
  id: string;
  title: string;
  host_name: string;
  host_username?: string | null;
  status: string;
  created_at: string;
  viewer_count?: number;
  category?: string;
  is_premium?: boolean;
  price?: number;
  paid_participants?: string[]; // Users who paid for premium room
  active_participants?: Participant[]; // People currently on the ring (2-6)
  main_participants?: string[]; // The 2 main people in beef
}

export default function LivePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [liveRooms, setLiveRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [feedType, setFeedType] = useState<'pour-vous' | 'abonnements'>('pour-vous');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('purchase') !== 'success') return;
    toast(
      'Merci ! Ton achat est confirmé. Les points seront crédités sous peu.',
      'success'
    );
    router.replace('/live', { scroll: false });
  }, [router, toast]);

  const [followingIds, setFollowingIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.id) return;
    supabase
      .from('followers')
      .select('following_id')
      .eq('follower_id', user.id)
      .then(({ data }) => {
        setFollowingIds((data || []).map((r: { following_id: string }) => r.following_id));
      });
  }, [user?.id]);

  const loadLiveRooms = useCallback(async (isBackgroundRefresh = false) => {
    try {
      const { data, error } = await supabase.from('beefs').select('*').eq('status', 'live').limit(50);

      if (error) throw error;

      const rawList = data || [];
      const medIds = [...new Set(rawList.map((b: { mediator_id?: string }) => b.mediator_id).filter(Boolean))] as string[];
      const medMap = await fetchUserPublicByIds(supabase, medIds, 'id, username, display_name');

      let rooms: Room[] = rawList.map((beef: any) => {
        const m = beef.mediator_id ? medMap.get(beef.mediator_id) : undefined;
        return {
        id: beef.id,
        title: beef.title,
        host_name: displayNameFromPublicRow(m, 'Anonyme'),
        host_username: m?.username?.trim() || null,
        status: beef.status,
        created_at: beef.created_at,
        viewer_count: beef.viewer_count || 0,
        category: beef.tags?.[0] || 'général',
        is_premium: false,
        price: beef.price || 0,
      };
      });

      if (feedType === 'abonnements') {
        const followSet = new Set(followingIds);
        rooms = rooms.filter((r: any) => {
          const beef = rawList.find((b: any) => b.id === r.id);
          return beef && followSet.has(beef.mediator_id);
        });
        rooms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        rooms.sort((a, b) => (b.viewer_count || 0) - (a.viewer_count || 0));
      }

      setLiveRooms(rooms);
    } catch (error) {
      console.error('Error loading live beefs:', error);
      setLiveRooms([]);
    } finally {
      if (!isBackgroundRefresh) setLoading(false);
    }
  }, [feedType, followingIds]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login');
      return;
    }

    void loadLiveRooms();

    const channel = supabase
      .channel('live_beefs_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'beefs' },
        () => { void loadLiveRooms(true); }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [authLoading, user, feedType, followingIds, loadLiveRooms, router]);

  const handleCreateBeef = async (beefData: SubmitBeefPayload) => {
    if (!user) {
      toast('Vous devez être connecté pour créer un beef', 'error');
      router.push('/login');
      return;
    }

    try {
      const beef = await submitNewBeef(supabase, user.id, beefData);
      setShowCreateModal(false);
      router.push(`/arena/${beef.id}`);
    } catch (error: unknown) {
      console.error('Error creating beef:', error);
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Erreur lors de la création du beef';
      throw new Error(msg);
    }
  };

  const joinRoom = (room: Room) => {
    router.push(`/arena/${room.id}`);
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  const categories = [
    { id: 'tech', label: 'Tech', icon: '💻' },
    { id: 'politique', label: 'Politique', icon: '🏛️' },
    { id: 'sport', label: 'Sport', icon: '⚽' },
    { id: 'culture', label: 'Culture', icon: '🎭' },
    { id: 'finance', label: 'Finance', icon: '💰' },
    { id: 'autre', label: 'Autre', icon: '💬' },
  ];

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />
        {/* Header */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6"
          >
            <div>
              <h1 className="text-4xl font-black text-white mb-2 flex items-center gap-3">
                <Flame className="w-10 h-10 text-brand-400" />
                Live
              </h1>
              <p className="text-gray-400">
                {feedType === 'pour-vous' 
                  ? 'Découvrez les beefs les plus intenses' 
                  : 'Beefs des personnes que vous suivez'}
              </p>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 brand-gradient hover:opacity-90 text-black font-bold px-6 py-3 rounded-full shadow-xl transition-opacity"
            >
              <Plus className="w-5 h-5" />
              <span>Régler un beef</span>
            </motion.button>
          </motion.div>

          {/* Feed Type Toggle (like X/Twitter) */}
          <div className="flex items-center gap-3 border-b border-gray-800">
            <button
              onClick={() => setFeedType('pour-vous')}
              className={`relative px-6 py-3 font-bold transition-all ${
                feedType === 'pour-vous'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                <span>Pour vous</span>
              </div>
              {feedType === 'pour-vous' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-1 brand-gradient rounded-full"
                />
              )}
            </button>
            <button
              onClick={() => setFeedType('abonnements')}
              className={`relative px-6 py-3 font-bold transition-all ${
                feedType === 'abonnements'
                  ? 'text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                <span>Abonnements</span>
              </div>
              {feedType === 'abonnements' && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute bottom-0 left-0 right-0 h-1 brand-gradient rounded-full"
                />
              )}
            </button>
          </div>
        </div>

        {/* Live Rooms Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-brand-500 border-t-transparent"></div>
          </div>
        ) : liveRooms.length === 0 ? (
          <div className="text-center py-20">
            <Flame className="w-24 h-24 text-gray-700 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-white mb-2">
              {feedType === 'pour-vous'
                ? 'Aucun beef en cours' 
                : 'Aucun beef de vos abonnements'}
            </h3>
            <p className="text-gray-400 mb-6">
              {feedType === 'pour-vous'
                ? 'Soyez le premier à régler un beef en live !'
                : 'Les personnes que vous suivez n\'ont pas de beef actuellement'}
            </p>
            <div className="flex gap-3 justify-center">
              {feedType === 'abonnements' && (
                <button
                  onClick={() => setFeedType('pour-vous')}
                  className="bg-gray-700 hover:bg-gray-600 text-white font-bold px-8 py-3 rounded-full transition-colors"
                >
                  Beefs en cours
                </button>
              )}
              <button
                onClick={() => setShowCreateModal(true)}
                className="brand-gradient hover:opacity-90 text-black font-bold px-8 py-3 rounded-full transition-opacity"
              >
                Régler un beef
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {liveRooms.map((room, index) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
                onClick={() => joinRoom(room)}
                className={`group bg-gradient-to-br rounded-2xl p-6 border cursor-pointer transition-all ${
                  (room.price ?? 0) > 0
                    ? 'from-amber-950/40 to-gray-900 border-amber-600/40 hover:border-amber-500/60 hover:shadow-2xl hover:shadow-amber-900/20'
                    : 'from-gray-800 to-gray-900 border-gray-700 hover:border-brand-500 hover:shadow-2xl hover:shadow-brand-500/20'
                }`}
              >
                {/* Live Badge & suite payante */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-white text-xs font-bold">EN DIRECT</span>
                    </div>
                    {(room.price ?? 0) > 0 && (
                      <div className="flex items-center gap-1 bg-white/10 border border-white/15 px-3 py-1 rounded-full">
                        <Lock className="w-3 h-3 text-brand-400" />
                        <span className="text-brand-200 text-xs font-bold">Suite · {room.price} pts</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 text-gray-400">
                    <Eye className="w-4 h-4" />
                    <span className="text-sm font-semibold">{room.viewer_count}</span>
                  </div>
                </div>

                {/* Title */}
                <h3 className="text-xl font-black text-white mb-2 line-clamp-2 group-hover:text-brand-400 transition-colors">
                  {room.title}
                </h3>

                {/* Host */}
                <div className="flex items-center gap-2 text-gray-400 mb-4">
                  <Users className="w-4 h-4" />
                  <span className="text-sm">
                    Par{' '}
                    <ProfileUserLink username={room.host_username} className="text-sm text-gray-400">
                      {room.host_name}
                    </ProfileUserLink>
                  </span>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                  <div className="flex items-center gap-1 text-gray-500 text-xs">
                    <Clock className="w-3 h-3" />
                    <span>Il y a {Math.floor((Date.now() - new Date(room.created_at).getTime()) / 60000)} min</span>
                  </div>
                  <span className="text-xs px-2 py-1 bg-brand-500/20 text-brand-400 rounded-full font-semibold">
                    {room.category || 'général'}
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* User Balance Display - REMOVED, moved to header */}

      {/* Create Beef Modal */}
      {showCreateModal && (
        <CreateBeefForm
          onSubmit={handleCreateBeef}
          onCancel={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
