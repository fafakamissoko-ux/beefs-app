'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Clock, Plus, TrendingUp, Flame, Eye, Crown, Lock } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { CreateBeefForm } from '@/components/CreateBeefForm';
import { useToast } from '@/components/Toast';

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

  const followingList = ['TechExpert', 'CryptoKing', 'Host Principal'];

  useEffect(() => {
    loadLiveRooms();
    
    // Subscribe to new rooms
    const channel = supabase
      .channel('rooms_changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'rooms' },
        () => {
          loadLiveRooms();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [feedType]); // Reload when feed type changes

  const loadLiveRooms = async () => {
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('status', 'live')
        .limit(50);

      if (error) throw error;
      
      // Add mock viewer counts and engagement scores
      let roomsWithViewers = (data || []).map(room => ({
        ...room,
        viewer_count: Math.floor(Math.random() * 500) + 50,
        engagement_score: Math.floor(Math.random() * 1000), // For algorithmic sorting
      }));
      
      // Apply different logic based on feed type (like X/Twitter)
      if (feedType === 'abonnements') {
        // ABONNEMENTS FEED (like X "Following")
        // 1. Filter: Only show debates from people you follow
        roomsWithViewers = roomsWithViewers.filter(room => 
          followingList.includes(room.host_name)
        );
        // 2. Sort: Chronological order (most recent first)
        roomsWithViewers.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else {
        // POUR VOUS FEED (like X "For You")
        // 1. Show all debates (discovery/algorithmic)
        // 2. Sort: Algorithmic (by engagement: viewers, activity, popularity)
        roomsWithViewers.sort((a, b) => {
          // Engagement score = viewers + random factor (simulates algorithm)
          const scoreA = (a.viewer_count || 0) + (a.engagement_score || 0);
          const scoreB = (b.viewer_count || 0) + (b.engagement_score || 0);
          return scoreB - scoreA; // Higher engagement first
        });
      }
      
      setLiveRooms(roomsWithViewers);
    } catch (error) {
      console.error('Error loading rooms:', error);
      // Fallback: show mock data
      const now = Date.now();
      let mockRooms = [
        {
          id: 'demo-room-1',
          title: 'IA vs Emploi: Le grand débat',
          host_name: 'TechExpert',
          status: 'live',
          created_at: new Date(now - 3600000).toISOString(), // 1 hour ago
          viewer_count: 324,
          category: 'tech',
          engagement_score: 800,
          is_premium: true,
          price: 10,
          participants: [],
        },
        {
          id: 'demo-room-2',
          title: 'Crypto: Avenir ou Arnaque?',
          host_name: 'CryptoKing',
          status: 'live',
          created_at: new Date(now - 1800000).toISOString(), // 30 min ago
          viewer_count: 156,
          category: 'finance',
          engagement_score: 450,
          is_premium: false,
        },
        {
          id: 'demo-room-3',
          title: 'Débat Tech 2026',
          host_name: 'Host Principal',
          status: 'live',
          created_at: new Date(now - 300000).toISOString(), // 5 min ago
          viewer_count: 89,
          category: 'tech',
          engagement_score: 200,
          is_premium: true,
          price: 5,
          participants: [],
        },
        {
          id: 'demo-room-4',
          title: 'Gaming vs Études: Le débat',
          host_name: 'GameMaster',
          status: 'live',
          created_at: new Date(now - 7200000).toISOString(), // 2 hours ago
          viewer_count: 512,
          category: 'gaming',
          engagement_score: 950,
          is_premium: false,
        },
      ];
      
      // Apply same logic as real data
      if (feedType === 'abonnements') {
        // ABONNEMENTS: Filter + Chronological sort
        mockRooms = mockRooms.filter(room => followingList.includes(room.host_name));
        mockRooms.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else {
        // POUR VOUS: All debates + Algorithmic sort (by engagement)
        mockRooms.sort((a, b) => {
          const scoreA = (a.viewer_count || 0) + (a.engagement_score || 0);
          const scoreB = (b.viewer_count || 0) + (b.engagement_score || 0);
          return scoreB - scoreA;
        });
      }
      
      setLiveRooms(mockRooms);
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
      // Build insert object — only fields that exist in DB
      const insertData: any = {
        title: beefData.title,
        subject: beefData.title, // subject mirrors title (NOT NULL constraint)
        description: beefData.description || '',
        mediator_id: user.id,
        status: 'pending',
        is_premium: beefData.is_premium || false,
        price: beefData.is_premium ? (beefData.price || 0) : 0,
        tags: beefData.tags || [],
      };

      if (beefData.scheduled_at) {
        insertData.scheduled_at = beefData.scheduled_at;
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
    // Check if room is premium and user needs to pay
    if (room.is_premium && !room.paid_participants?.includes('current_user_id')) {
      setSelectedRoom(room);
      setShowPaymentModal(true);
    } else {
      // NEW: Use /beef for modular multi-participant system
      router.push(`/beef/${room.id}`);
    }
  };

  const purchaseAccess = async () => {
    if (!selectedRoom || !selectedRoom.price || !user) return;
    setPurchaseLoading(true);

    if (userPoints < selectedRoom.price) {
      toast(`Points insuffisants (${userPoints}/${selectedRoom.price}). Achetez des points.`, 'error');
      setPurchaseLoading(false);
      router.push('/buy-points');
      return;
    }

    try {
      const { error: deductErr } = await supabase
        .from('users')
        .update({ points: userPoints - selectedRoom.price })
        .eq('id', user.id);
      if (deductErr) throw deductErr;

      await supabase.rpc('update_user_balance', {
        p_user_id: selectedRoom.id,
        p_amount: 0,
        p_type: 'premium_access',
        p_description: `Accès premium: ${selectedRoom.title}`,
        p_metadata: { room_id: selectedRoom.id },
      });

      setUserPoints(prev => prev - selectedRoom.price!);
      setShowPaymentModal(false);
      toast('Accès débloqué !', 'success');
      router.push(`/arena/${selectedRoom.id}`);
    } catch (err: any) {
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
                  room.is_premium
                    ? 'from-yellow-900/30 to-gray-900 border-yellow-500/50 hover:border-yellow-400 hover:shadow-2xl hover:shadow-yellow-500/20'
                    : 'from-gray-800 to-gray-900 border-gray-700 hover:border-brand-500 hover:shadow-2xl hover:shadow-brand-500/20'
                }`}
              >
                {/* Live Badge & Premium Badge */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-2 bg-red-500 px-3 py-1 rounded-full">
                      <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      <span className="text-white text-xs font-bold">EN DIRECT</span>
                    </div>
                    {room.is_premium && (
                      <div className="flex items-center gap-1 bg-gradient-to-r from-yellow-400 to-orange-500 px-3 py-1 rounded-full">
                        <Crown className="w-3 h-3 text-black" />
                        <span className="text-black text-xs font-bold">{room.price} PTS</span>
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
              className="bg-gradient-to-br from-yellow-900/50 to-gray-900 rounded-2xl p-8 max-w-md w-full border-2 border-yellow-500/50 shadow-2xl"
            >
              {/* Premium Badge */}
              <div className="flex justify-center mb-6">
                <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full p-4">
                  <Crown className="w-12 h-12 text-black" />
                </div>
              </div>

              <h2 className="text-2xl font-black text-white mb-2 text-center">
                Salle Premium
              </h2>
              <p className="text-gray-400 text-center mb-6">
                Accédez à un débat exclusif de haute qualité
              </p>

              {/* Room Info */}
              <div className="bg-black/40 rounded-xl p-4 mb-6 border border-gray-700">
                <h3 className="text-lg font-bold text-white mb-2">{selectedRoom.title}</h3>
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>Par {selectedRoom.host_name}</span>
                  <div className="flex items-center gap-1">
                    <Eye className="w-4 h-4" />
                    <span>{selectedRoom.viewer_count} spectateurs</span>
                  </div>
                </div>
              </div>

              {/* Price */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between p-4 bg-gradient-to-r from-yellow-500/10 to-orange-500/10 border border-yellow-500/30 rounded-lg">
                  <span className="text-white font-semibold">Prix d'entrée</span>
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-brand-400" />
                    <span className="text-yellow-400 font-black text-xl">{selectedRoom.price} points</span>
                  </div>
                </div>
              </div>

              {/* User Balance */}
              <div className={`flex items-center justify-between p-3 rounded-lg mb-3 ${userPoints >= (selectedRoom?.price || 0) ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'}`}>
                <span className="text-gray-300 text-sm">Ton solde</span>
                <span className={`font-bold ${userPoints >= (selectedRoom?.price || 0) ? 'text-green-400' : 'text-red-400'}`}>{userPoints} pts</span>
              </div>

              {/* Benefits */}
              <div className="bg-yellow-400/5 border border-yellow-400/20 rounded-lg p-4 mb-6">
                <p className="text-yellow-400 font-semibold mb-2 text-sm">✨ Avantages Premium</p>
                <ul className="text-gray-300 text-xs space-y-1">
                  <li>✓ Audience de qualité et engagée</li>
                  <li>✓ Débats modérés et structurés</li>
                  <li>✓ Accès illimité pendant toute la durée</li>
                  <li>✓ Support prioritaire</li>
                </ul>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-white font-bold py-4 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={purchaseAccess}
                  disabled={purchaseLoading}
                  className="flex-1 bg-gradient-to-r from-yellow-400 to-orange-500 hover:from-yellow-500 hover:to-orange-600 disabled:opacity-50 text-black font-bold py-4 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2"
                >
                  {purchaseLoading ? (
                    <span>Traitement...</span>
                  ) : userPoints >= (selectedRoom?.price || 0) ? (
                    <>
                      <Lock className="w-5 h-5" />
                      Payer {selectedRoom?.price} pts
                    </>
                  ) : (
                    <>
                      <Flame className="w-5 h-5" />
                      Acheter des points
                    </>
                  )}
                </button>
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
