'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, Plus, TrendingUp, Flame, Eye, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CreateBeefForm } from '@/components/CreateBeefForm';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';

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
  const { user } = useAuth();
  const { toast } = useToast();
  const [liveRooms, setLiveRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [feedType, setFeedType] = useState<'pour-vous' | 'abonnements'>('pour-vous');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [userPoints, setUserPoints] = useState(0);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  
  useEffect(() => {
    if (!user) return;
    supabase.from('users').select('points').eq('id', user.id).single()
      .then(({ data }) => { if (data) setUserPoints(data.points || 0); });
  }, [user]);

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

  useEffect(() => {
    loadLiveRooms();

    const channel = supabase
      .channel('live_beefs_changes')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'beefs' },
        () => { loadLiveRooms(); }
      )
      .subscribe();

    return () => { channel.unsubscribe(); };
  }, [feedType, followingIds]);

  const loadLiveRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('beefs')
        .select('*, users!beefs_mediator_id_fkey(username, display_name)')
        .eq('status', 'live')
        .limit(50);

      if (error) throw error;

      let rooms: Room[] = (data || []).map((beef: any) => ({
        id: beef.id,
        title: beef.title,
        host_name: beef.users?.display_name || beef.users?.username || 'Anonyme',
        status: beef.status,
        created_at: beef.created_at,
        viewer_count: beef.viewer_count || 0,
        category: beef.tags?.[0] || 'général',
        is_premium: false,
        price: beef.price || 0,
      }));

      if (feedType === 'abonnements') {
        const followSet = new Set(followingIds);
        rooms = rooms.filter((r: any) => {
          const beef = (data || []).find((b: any) => b.id === r.id);
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
      setLoading(false);
    }
  };

  const handleCreateBeef = async (beefData: any) => {
    if (!user) {
      toast('Vous devez être connecté pour créer un beef', 'error');
      router.push('/login');
      return;
    }

    try {
      const { count } = await supabase
        .from('beefs')
        .select('*', { count: 'exact', head: true })
        .eq('mediator_id', user.id)
        .eq('resolution_status', 'resolved');
      const price = continuationPriceFromResolvedCount(count ?? 0);
      const insertData: any = {
        title: beefData.title,
        subject: beefData.title, // subject mirrors title (NOT NULL constraint)
        description: beefData.description || '',
        mediator_id: user.id,
        status: 'pending',
        is_premium: false,
        price,
        tags: beefData.tags || [],
      };

      if (beefData.scheduled_at) {
        insertData.scheduled_at = beefData.scheduled_at;
        insertData.status = 'scheduled';
      }

      const { data: beef, error: beefError } = await supabase
        .from('beefs')
        .insert(insertData)
        .select()
        .single();

      if (beefError) {
        console.error('Supabase error creating beef:', beefError);
        throw new Error(beefError.message);
      }

      // Only insert participants if there are some
      if (beefData.participants && beefData.participants.length > 0) {
        const participantsToInsert = beefData.participants.map((p: any) => ({
          beef_id: beef.id,
          user_id: p.user_id,
          role: p.role || 'participant',
          is_main: p.is_main || false,
          invite_status: 'pending',
        }));

        const { error: partsError } = await supabase
          .from('beef_participants')
          .insert(participantsToInsert);

        if (partsError) console.warn('Participants error (non-blocking):', partsError);

        const invitationsToInsert = beefData.participants.map((p: any) => ({
          beef_id: beef.id,
          inviter_id: user.id,
          invitee_id: p.user_id,
          status: 'sent',
        }));

        const { error: invError } = await supabase
          .from('beef_invitations')
          .insert(invitationsToInsert);

        if (invError) console.warn('Invitations error (non-blocking):', invError);
      }

      setShowCreateModal(false);
      router.push(`/arena/${beef.id}`);

    } catch (error: any) {
      console.error('Error creating beef:', error);
      throw new Error(error.message || 'Erreur lors de la création du beef');
    }
  };

  const joinRoom = (room: Room) => {
    if (room.price && room.price > 0) {
      setSelectedRoom(room);
      setShowPaymentModal(true);
    } else {
      router.push(`/arena/${room.id}`);
    }
  };

  const purchaseAccess = async () => {
    if (!selectedRoom || !selectedRoom.price || !user) return;
    setPurchaseLoading(true);

    if (userPoints < selectedRoom.price) {
      const need = selectedRoom.price - userPoints;
      toast(`Points insuffisants — il te manque ${need} pts (solde ${userPoints})`, 'error', {
        action: {
          label: 'Recharger des points',
          onClick: () => router.push('/buy-points'),
        },
      });
      setPurchaseLoading(false);
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/beef/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ beefId: selectedRoom.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(data.error || 'Erreur lors du paiement', 'error');
        return;
      }
      if (typeof data.newBalance === 'number') {
        setUserPoints(data.newBalance);
      } else {
        const { data: u } = await supabase.from('users').select('points').eq('id', user.id).single();
        if (u) setUserPoints(u.points || 0);
      }
      setShowPaymentModal(false);
      toast('Accès débloqué !', 'success');
      router.push(`/arena/${selectedRoom.id}`);
    } catch {
      toast('Erreur lors du paiement', 'error');
    } finally {
      setPurchaseLoading(false);
    }
  };

  const categories = [
    { id: 'tech', label: 'Tech', icon: '💻' },
    { id: 'politique', label: 'Politique', icon: '🏛️' },
    { id: 'sport', label: 'Sport', icon: '⚽' },
    { id: 'culture', label: 'Culture', icon: '🎭' },
    { id: 'finance', label: 'Finance', icon: '💰' },
    { id: 'autre', label: 'Autre', icon: '💬' },
  ];

  return (
    <div className="min-h-screen bg-black">
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
                  <span className="text-sm">Par {room.host_name}</span>
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

      {/* Payment Modal for Premium Rooms */}
      <AnimatePresence>
        {showPaymentModal && selectedRoom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowPaymentModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-b from-gray-900 to-black rounded-2xl p-8 max-w-md w-full border border-white/15 shadow-2xl"
            >
              <div className="flex justify-center mb-5">
                <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center border border-brand-500/30">
                  <Lock className="w-7 h-7 text-brand-400" />
                </div>
              </div>

              <h2 className="text-xl font-black text-white mb-1 text-center">
                Accès au direct
              </h2>
              <p className="text-gray-400 text-sm text-center mb-6">
                Ce beef demande des points pour la suite du visionnage (après la prévisualisation gratuite côté arène).
              </p>

              <div className="bg-black/50 rounded-xl p-4 mb-5 border border-white/10">
                <h3 className="text-base font-bold text-white mb-2 line-clamp-2">{selectedRoom.title}</h3>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span>Par {selectedRoom.host_name}</span>
                  <div className="flex items-center gap-1">
                    <Eye className="w-3.5 h-3.5" />
                    <span>{selectedRoom.viewer_count}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 mb-5 space-y-3">
                <p className="text-center text-white text-sm font-semibold">
                  Coût d&apos;entrée :{' '}
                  <span className="text-brand-400 font-black tabular-nums">{selectedRoom.price}</span>
                  <span className="text-gray-400 font-medium"> pts</span>
                </p>
                <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-500 to-amber-400 transition-all"
                    style={{
                      width: `${Math.min(100, Math.round((userPoints / Math.max(selectedRoom.price || 1, 1)) * 100))}%`,
                    }}
                  />
                </div>
                <p className="text-center text-xs text-gray-400">
                  Ton solde :{' '}
                  <span className={userPoints >= (selectedRoom.price || 0) ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                    {userPoints} pts
                  </span>
                  {userPoints < (selectedRoom.price || 0) && (
                    <span className="text-gray-500">
                      {' '}
                      — manque <span className="text-white font-semibold tabular-nums">{(selectedRoom.price || 0) - userPoints}</span> pts
                    </span>
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setShowPaymentModal(false)}
                  className="w-full bg-gray-800 hover:bg-gray-700 text-white font-bold py-3 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                {userPoints >= (selectedRoom.price || 0) ? (
                  <button
                    type="button"
                    onClick={purchaseAccess}
                    disabled={purchaseLoading}
                    className="w-full brand-gradient text-black font-bold py-3.5 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {purchaseLoading ? (
                      <span>Traitement…</span>
                    ) : (
                      <>
                        <Lock className="w-5 h-5" />
                        Débloquer · {selectedRoom.price} pts
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => router.push('/buy-points')}
                    className="w-full brand-gradient text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2"
                  >
                    <Flame className="w-5 h-5" />
                    Recharger des points
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
