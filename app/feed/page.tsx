'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Flame, X, Plus, Hash } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefCard } from '@/components/BeefCard';
import { CreateBeefForm } from '@/components/CreateBeefForm';

interface Beef {
  id: string;
  title: string;
  host_name: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number;
  engagement_score?: number;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'À venir' },
  { id: 'ended', label: 'Terminés' },
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
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [trendingTags, setTrendingTags] = useState<string[]>([]);

  const followingList = ['TechExpert', 'CryptoKing', 'Host Principal'];

  useEffect(() => {
    if (beefs.length > 0) {
      const tagCount: Record<string, number> = {};
      beefs.forEach(beef => { beef.tags?.forEach(tag => { tagCount[tag] = (tagCount[tag] || 0) + 1; }); });
      const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).map(([tag]) => tag).slice(0, 10);
      setTrendingTags(sorted.length > 0 ? sorted : ['tech', 'startup', 'argent', 'business', 'gaming', 'crypto', 'politique']);
    } else {
      setTrendingTags(['tech', 'startup', 'argent', 'business', 'gaming', 'crypto', 'politique']);
    }
  }, [beefs]);

  useEffect(() => {
    if (!user) {
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (hasSeenOnboarding !== 'true') { router.push('/onboarding'); return; }
      router.push('/login');
      return;
    }
    loadBeefs();
  }, [user, router]);

  useEffect(() => {
    if (user) {
      loadBeefs();
      const channel = supabase.channel('beefs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => loadBeefs()).subscribe();
      return () => { channel.unsubscribe(); };
    }
  }, [user, feedType, selectedTags, selectedStatus]);

  const loadBeefs = async () => {
    try {
      setLoading(true);
      let query = supabase.from('beefs').select('*, users!beefs_mediator_id_fkey(username, display_name)').limit(50);
      if (selectedStatus !== 'all') query = query.eq('status', selectedStatus);
      const { data, error } = await query;
      if (error) throw error;

      let beefsWithData = (data || []).map((beef: any) => ({
        ...beef,
        host_name: beef.users?.display_name || beef.users?.username || 'Anonyme',
        viewer_count: beef.viewer_count || 0,
        tags: beef.tags || [],
      }));

      if (selectedTags.length > 0) {
        beefsWithData = beefsWithData.filter((beef: any) => beef.tags?.some((tag: string) => selectedTags.includes(tag)));
      }

      if (feedType === 'abonnements') {
        beefsWithData = beefsWithData.filter((beef: any) => followingList.includes(beef.host_name));
        beefsWithData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        beefsWithData.sort((a: any, b: any) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (a.status !== 'live' && b.status === 'live') return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      setBeefs(beefsWithData);
    } catch (error) {
      console.error('Error loading beefs:', error);
      setBeefs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleBeefClick = (beef: Beef) => {
    router.push(`/arena/${beef.id}`);
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleCreateBeef = async (beefData: any) => {
    if (!user) { router.push('/login'); return; }
    try {
      const insertData: any = {
        title: beefData.title,
        subject: beefData.title,
        description: beefData.description || '',
        mediator_id: user.id,
        status: 'pending',
        is_premium: beefData.is_premium || false,
        price: beefData.is_premium ? (beefData.price || 0) : 0,
        tags: beefData.tags || [],
      };
      if (beefData.scheduled_at) insertData.scheduled_at = beefData.scheduled_at;

      const { data: beef, error } = await supabase.from('beefs').insert(insertData).select().single();
      if (error) throw new Error(error.message);

      if (beefData.participants?.length > 0) {
        await supabase.from('beef_participants').insert(beefData.participants.map((p: any) => ({
          beef_id: beef.id, user_id: p.user_id, role: p.role || 'participant', is_main: p.is_main || false, invite_status: 'pending',
        })));
        await supabase.from('beef_invitations').insert(beefData.participants.map((p: any) => ({
          beef_id: beef.id, inviter_id: user.id, invitee_id: p.user_id, status: 'sent',
        })));
      }
      setShowCreateModal(false);
      router.push(`/arena/${beef.id}`);
    } catch (error: any) {
      throw new Error(error.message || 'Erreur lors de la création');
    }
  };

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Feed tabs */}
        <div className="flex items-center gap-0 mb-6" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          {[
            { id: 'pour-vous', label: 'Pour vous', icon: TrendingUp },
            { id: 'abonnements', label: 'Abonnements', icon: Users },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setFeedType(tab.id as any)}
              className={`relative flex items-center gap-2 px-5 py-3 text-sm font-semibold transition-colors ${
                feedType === tab.id ? 'text-white' : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {feedType === tab.id && (
                <motion.div
                  layoutId="feedTab"
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ background: 'linear-gradient(90deg, #FF6B2C, #E83A14)' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-4">
          {/* Status pills */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {STATUS_FILTERS.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStatus(s.id)}
                className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedStatus === s.id
                    ? 'text-white brand-gradient shadow-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                style={selectedStatus !== s.id ? { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' } : {}}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* Tag search */}
          <div className="relative">
            <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
            <input
              type="text"
              value={tagSearchQuery}
              onChange={(e) => setTagSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagSearchQuery.trim()) {
                  const clean = tagSearchQuery.replace(/^[#$]/, '').trim().toLowerCase();
                  if (clean && !selectedTags.includes(clean)) setSelectedTags(prev => [...prev, clean]);
                  setTagSearchQuery('');
                }
              }}
              placeholder="Filtrer par tag..."
              className="input-field pl-10 text-sm py-2.5"
            />
          </div>

          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <motion.div key={tag} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold text-white brand-gradient">
                  <span>#{tag}</span>
                  <button onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))} className="hover:bg-white/20 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
              <button onClick={() => setSelectedTags([])} className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">
                Effacer
              </button>
            </div>
          )}

          {/* Trending tags */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar pb-1">
            <span className="text-[10px] text-gray-600 font-semibold uppercase tracking-wider flex-shrink-0">Trending</span>
            {trendingTags.filter(t => !selectedTags.includes(t)).slice(0, 8).map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="px-2.5 py-1 text-[11px] font-medium text-gray-500 hover:text-brand-400 rounded-md whitespace-nowrap transition-colors flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="skeleton h-44" />
                <div className="p-4 space-y-3">
                  <div className="skeleton h-4 w-3/4" />
                  <div className="skeleton h-3 w-1/2" />
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-16 rounded-md" />
                    <div className="skeleton h-5 w-12 rounded-md" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : beefs.length === 0 ? (
          <div className="text-center py-24">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.03)' }}>
              <Flame className="w-8 h-8 text-gray-700" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-1">Aucun beef en cours</h3>
            <p className="text-sm text-gray-500 mb-6">Soyez le premier à régler un beef en live !</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary inline-flex items-center gap-2">
              <Flame className="w-4 h-4" />
              Régler un beef
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {beefs.map((beef, index) => (
              <BeefCard key={beef.id} {...beef} onClick={() => handleBeefClick(beef)} onTagClick={handleTagClick} index={index} />
            ))}
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && <CreateBeefForm onSubmit={handleCreateBeef} onCancel={() => setShowCreateModal(false)} />}

      {/* FAB */}
      <motion.button
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => setShowCreateModal(true)}
        className="fixed bottom-6 right-6 w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white z-40 brand-gradient hover:shadow-glow transition-shadow"
      >
        <Plus className="w-6 h-6" />
      </motion.button>
    </div>
  );
}
