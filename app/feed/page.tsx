'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Users, Filter, Flame, Grid3x3, List, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefCard } from '@/components/BeefCard';
import { CreateBeefForm } from '@/components/CreateBeefForm';

/**
 * FEED DÉCOUVERTE - Inspired by TikTok For You + Instagram Explore
 * 
 * Key Features:
 * 1. Dual feed tabs: "Pour Toi" (algorithmic) vs "Abonnements" (chronological)
 * 2. Smart filtering: Category + Status (Live/Ended/Replay)
 * 3. Beautiful cards with hover effects
 * 4. Real-time updates for new live beefs
 * 5. Smooth animations
 */

interface Beef {
  id: string;
  title: string;
  host_name: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled';
  created_at: string;
  scheduled_at?: string; // For scheduled beefs
  viewer_count?: number;
  tags?: string[]; // Changed from category to tags
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number;
  engagement_score?: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'live', label: '🔴 Live' },
  { id: 'replay', label: '▶️ Replays' },
  { id: 'ended', label: '✓ Terminés' },
];

export default function FeedPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState<'pour-vous' | 'abonnements'>('pour-vous');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagSearchQuery, setTagSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [trendingTags, setTrendingTags] = useState<string[]>([]);

  // Mock following list - Replace with real data from Supabase
  const followingList = ['TechExpert', 'CryptoKing', 'Host Principal'];

  // Calculate trending tags from actual beefs
  useEffect(() => {
    if (beefs.length > 0) {
      const tagCount: Record<string, number> = {};
      
      // Count tag occurrences
      beefs.forEach(beef => {
        if (beef.tags) {
          beef.tags.forEach(tag => {
            tagCount[tag] = (tagCount[tag] || 0) + 1;
          });
        }
      });

      // Sort by count and get top 10
      const sortedTags = Object.entries(tagCount)
        .sort((a, b) => b[1] - a[1])
        .map(([tag]) => tag)
        .slice(0, 10);

      setTrendingTags(sortedTags.length > 0 ? sortedTags : [
        'tech', 'startup', 'argent', 'respect', 'business', 'gaming',
        'crypto', 'politique', 'justice', 'amitié'
      ]);
    } else {
      // Default trending tags when no beefs
      setTrendingTags([
        'tech', 'startup', 'argent', 'respect', 'business', 'gaming',
        'crypto', 'politique', 'justice', 'amitié'
      ]);
    }
  }, [beefs]);

  useEffect(() => {
    // Check if user has seen onboarding
    const checkOnboarding = async () => {
      if (!user) {
        const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
        if (hasSeenOnboarding !== 'true') {
          router.push('/onboarding');
          return;
        }
        router.push('/login');
        return;
      }

      // Check if new user (less than 5 min old)
      const { data: userData } = await supabase
        .from('users')
        .select('created_at')
        .eq('id', user.id)
        .single();

      const isNewUser = userData?.created_at
        ? new Date().getTime() - new Date(userData.created_at).getTime() < 5 * 60 * 1000
        : false;

      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (isNewUser && hasSeenOnboarding !== 'true') {
        router.push('/onboarding');
        return;
      }

      loadBeefs();
    };

    checkOnboarding();
  }, [user, router]);

  useEffect(() => {
    if (user) {
      loadBeefs();

      // Real-time subscription for new beefs
      const channel = supabase
        .channel('beefs_changes')
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'rooms' },
          () => {
            loadBeefs();
          }
        )
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [user, feedType, selectedTags, selectedStatus]);

  const loadBeefs = async () => {
    try {
      setLoading(true);

      // Query all beefs (not just live)
      let query = supabase.from('rooms').select('*').limit(50);

      // Apply status filter
      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Add mock data for viewer counts and engagement
      let beefsWithData = (data || []).map((beef) => ({
        ...beef,
        viewer_count: beef.viewer_count || Math.floor(Math.random() * 500) + 50,
        engagement_score: Math.floor(Math.random() * 1000),
        duration: beef.status === 'ended' ? Math.floor(Math.random() * 60) + 10 : undefined,
        tags: beef.tags || [], // Ensure tags is an array
      }));

      // Apply tag filter
      if (selectedTags.length > 0) {
        beefsWithData = beefsWithData.filter((beef) =>
          beef.tags && beef.tags.some((tag: string) => selectedTags.includes(tag))
        );
      }

      // Apply feed type logic
      if (feedType === 'abonnements') {
        // ABONNEMENTS: Filter by following + chronological sort
        beefsWithData = beefsWithData.filter((beef) =>
          followingList.includes(beef.host_name)
        );
        beefsWithData.sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      } else {
        // POUR VOUS: All beefs + algorithmic sort (engagement)
        beefsWithData.sort((a, b) => {
          // Prioritize: 1. Live beefs 2. Engagement 3. Recency
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (a.status !== 'live' && b.status === 'live') return 1;

          const scoreA = (a.viewer_count || 0) + (a.engagement_score || 0);
          const scoreB = (b.viewer_count || 0) + (b.engagement_score || 0);
          return scoreB - scoreA;
        });
      }

      setBeefs(beefsWithData);
    } catch (error) {
      console.error('Error loading beefs:', error);

      // Fallback: Mock data
      const now = Date.now();
      let mockBeefs: Beef[] = [
        {
          id: 'demo-1',
          title: 'IA vs Emploi: Le grand débat',
          host_name: 'TechExpert',
          status: 'live',
          created_at: new Date(now - 3600000).toISOString(),
          viewer_count: 324,
          tags: ['tech', 'ia', 'emploi'],
          engagement_score: 800,
          is_premium: true,
          price: 10,
        },
        {
          id: 'demo-scheduled',
          title: 'Startup: Bootstrapping vs Levée de fonds',
          host_name: 'TechExpert',
          status: 'scheduled',
          created_at: new Date(now).toISOString(),
          scheduled_at: new Date(now + 3600000 * 2).toISOString(), // In 2 hours
          viewer_count: 0,
          tags: ['startup', 'business', 'finance'],
          engagement_score: 0,
          is_premium: false,
        },
        {
          id: 'demo-2',
          title: 'Crypto: Avenir ou Arnaque?',
          host_name: 'CryptoKing',
          status: 'live',
          created_at: new Date(now - 1800000).toISOString(),
          viewer_count: 156,
          tags: ['crypto', 'finance', 'argent'],
          engagement_score: 450,
          is_premium: false,
        },
        {
          id: 'demo-3',
          title: 'Gaming vs Études: Qui gagne?',
          host_name: 'GameMaster',
          status: 'replay',
          created_at: new Date(now - 7200000).toISOString(),
          viewer_count: 512,
          tags: ['gaming', 'études'],
          duration: 45,
          engagement_score: 950,
          is_premium: false,
        },
        {
          id: 'demo-4',
          title: 'Politique 2026: Les nouveaux enjeux',
          host_name: 'PolitiqueDebat',
          status: 'ended',
          created_at: new Date(now - 10800000).toISOString(),
          viewer_count: 89,
          tags: ['politique', 'débat'],
          duration: 32,
          engagement_score: 200,
          is_premium: true,
          price: 5,
        },
      ];

      // Apply same filters
      if (selectedTags.length > 0) {
        mockBeefs = mockBeefs.filter((b) => 
          b.tags && b.tags.some(tag => selectedTags.includes(tag))
        );
      }
      if (selectedStatus !== 'all') {
        mockBeefs = mockBeefs.filter((b) => b.status === selectedStatus);
      }
      if (feedType === 'abonnements') {
        mockBeefs = mockBeefs.filter((b) => followingList.includes(b.host_name));
      }

      setBeefs(mockBeefs);
    } finally {
      setLoading(false);
    }
  };

  const handleBeefClick = (beef: Beef) => {
    if (beef.is_premium && !beef.price) {
      // Show payment modal or redirect
      router.push('/buy-points');
    } else {
      router.push(`/beef/${beef.id}`);
    }
  };

  const handleTagClick = (tag: string) => {
    if (selectedTags.includes(tag)) {
      // Remove tag if already selected
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      // Add tag to filter
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setSelectedTags(selectedTags.filter(t => t !== tag));
  };

  const handleCreateBeef = async (beefData: any) => {
    if (!user) {
      alert('Vous devez être connecté pour créer un beef');
      router.push('/login');
      return;
    }

    try {
      // Build the insert object with only the fields that exist in the DB
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

      // Only add scheduled_at if filled
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

        if (partsError) {
          console.warn('Error inserting participants (non-blocking):', partsError);
        }

        const invitationsToInsert = beefData.participants.map((p: any) => ({
          beef_id: beef.id,
          inviter_id: user.id,
          invitee_id: p.user_id,
          status: 'sent',
        }));

        const { error: invError } = await supabase
          .from('beef_invitations')
          .insert(invitationsToInsert);

        if (invError) {
          console.warn('Error inserting invitations (non-blocking):', invError);
        }
      }

      setShowCreateModal(false);

      // Redirect directly to the arena
      router.push(`/arena/${beef.id}`);
    } catch (error: any) {
      console.error('Error creating beef:', error);
      throw new Error(error.message || 'Erreur lors de la création du beef');
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col gap-6"
          >
            {/* Title */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-4xl font-black text-white mb-2 flex items-center gap-3">
                  <Flame className="w-10 h-10 text-orange-500" />
                  Découverte
                </h1>
                <p className="text-gray-400">
                  {feedType === 'pour-vous'
                    ? 'Les beefs les plus intenses du moment'
                    : 'Beefs de vos créateurs préférés'}
                </p>
              </div>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 bg-gray-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'grid'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <Grid3x3 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded transition-colors ${
                    viewMode === 'list'
                      ? 'bg-orange-500 text-white'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  <List className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Feed Type Tabs */}
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
                    className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
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
                    className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full"
                  />
                )}
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col gap-4">
              {/* Tag Search & Filter */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-orange-500 text-lg font-bold">$</span>
                  <span className="text-sm text-gray-400 font-semibold">Rechercher par tags</span>
                </div>
                
                {/* Tag Search Input */}
                <div className="relative mb-3">
                  <input
                    type="text"
                    value={tagSearchQuery}
                    onChange={(e) => setTagSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && tagSearchQuery.trim()) {
                        const cleanTag = tagSearchQuery.replace(/^\$/, '').trim().toLowerCase();
                        if (!selectedTags.includes(cleanTag)) {
                          setSelectedTags([...selectedTags, cleanTag]);
                        }
                        setTagSearchQuery('');
                      }
                    }}
                    placeholder="Rechercher un tag... (ex: tech, startup)"
                    className="w-full bg-black/40 border border-gray-700 rounded-lg px-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
                  />
                  {tagSearchQuery && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">
                      Appuie sur Entrée
                    </div>
                  )}
                </div>

                {/* Selected Tags */}
                {selectedTags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {selectedTags.map((tag) => (
                      <motion.div
                        key={tag}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex items-center gap-1 bg-gradient-to-r from-orange-500 to-red-500 text-white px-3 py-1.5 rounded-full text-sm font-bold shadow-lg"
                      >
                        <span>${tag}</span>
                        <button
                          onClick={() => removeTag(tag)}
                          className="hover:bg-white/20 rounded-full p-0.5 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                    <button
                      onClick={() => setSelectedTags([])}
                      className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-full text-sm font-semibold transition-colors"
                    >
                      Tout effacer
                    </button>
                  </div>
                )}

                {/* Trending Tags */}
                <div>
                  <p className="text-gray-500 text-xs mb-2 flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Trending
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {trendingTags.filter(tag => !selectedTags.includes(tag)).slice(0, 10).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleTagClick(tag)}
                        className="px-3 py-1.5 bg-gray-800 hover:bg-orange-500/20 text-gray-400 hover:text-orange-400 rounded-full text-xs font-semibold transition-colors flex items-center gap-1"
                      >
                        <span className="text-orange-500">$</span>
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Status Filter */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 mr-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <span className="text-sm text-gray-400 font-semibold">Statut:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_FILTERS.map((status) => (
                    <button
                      key={status.id}
                      onClick={() => setSelectedStatus(status.id)}
                      className={`px-4 py-2 rounded-full font-semibold text-sm transition-all ${
                        selectedStatus === status.id
                          ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow-lg'
                          : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                      }`}
                    >
                      {status.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Beefs Grid/List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-500 border-t-transparent"></div>
          </div>
        ) : beefs.length === 0 ? (
          <div className="text-center py-20">
            <Flame className="w-24 h-24 text-gray-700 mx-auto mb-6" />
            <h3 className="text-2xl font-bold text-white mb-2">
              {feedType === 'pour-vous'
                ? 'Aucun beef trouvé'
                : 'Aucun beef de vos abonnements'}
            </h3>
            <p className="text-gray-400 mb-6">
              {feedType === 'pour-vous'
                ? 'Ajustez vos filtres tags ou créez le premier beef !'
                : 'Suivez des créateurs pour voir leurs beefs ici'}
            </p>
            <button
              onClick={() => {
                setSelectedTags([]);
                setSelectedStatus('all');
              }}
              className="bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold px-8 py-3 rounded-full hover:shadow-lg transition-shadow"
            >
              Réinitialiser les filtres
            </button>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6'
                : 'flex flex-col gap-4 max-w-4xl mx-auto'
            }
          >
            {beefs.map((beef, index) => (
              <BeefCard
                key={beef.id}
                {...beef}
                onClick={() => handleBeefClick(beef)}
                onTagClick={handleTagClick}
                index={index}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Beef Modal */}
      {showCreateModal && (
        <CreateBeefForm
          onSubmit={handleCreateBeef}
          onCancel={() => setShowCreateModal(false)}
        />
      )}

      {/* Floating Create Button */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-8 right-8 w-16 h-16 bg-gradient-to-r from-red-500 to-orange-500 rounded-full shadow-2xl flex items-center justify-center text-white hover:shadow-orange-500/50 transition-shadow z-40"
      >
        <Flame className="w-8 h-8" />
      </motion.button>
    </div>
  );
}
