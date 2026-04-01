'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Flame, X, Plus, Hash, Radio } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefCard } from '@/components/BeefCard';
import dynamic from 'next/dynamic';
import { FeatureGuide } from '@/components/FeatureGuide';
import { submitNewBeef } from '@/lib/submitNewBeef';

const CreateBeefForm = dynamic(() => import('@/components/CreateBeefForm').then(m => m.CreateBeefForm), {
  loading: () => <div className="flex items-center justify-center p-8"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" /></div>,
});

/** Ouvre la modale création quand on arrive depuis le header (ex. /feed?create=1). */
function OpenCreateModalFromQuery({ setOpen }: { setOpen: (open: boolean) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get('create') !== '1') return;
    setOpen(true);
    router.replace('/feed', { scroll: false });
  }, [searchParams, router, setOpen]);
  return null;
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  host_name: string;
  mediator_id?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number;
  engagement_score?: number;
  participants_count?: number;
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
  const [followingIds, setFollowingIds] = useState<string[]>([]);
  const [activeBeef, setActiveBeef] = useState<{ id: string; title: string; role: string } | null>(null);
  const [fetchLimit, setFetchLimit] = useState(20);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const loadMoreIntentRef = useRef(false);

  const FEED_FILTERS_KEY = 'beefs_feed_filters_v1';

  useEffect(() => {
    if (!user || filtersHydrated) return;
    try {
      const raw = localStorage.getItem(FEED_FILTERS_KEY);
      if (raw) {
        const o = JSON.parse(raw) as { feedType?: string; selectedStatus?: string; selectedTags?: string[] };
        if (o.feedType === 'pour-vous' || o.feedType === 'abonnements') setFeedType(o.feedType);
        if (typeof o.selectedStatus === 'string') setSelectedStatus(o.selectedStatus);
        if (Array.isArray(o.selectedTags)) setSelectedTags(o.selectedTags);
      }
    } catch {
      /* ignore */
    }
    setFiltersHydrated(true);
  }, [user, filtersHydrated]);

  useEffect(() => {
    if (!filtersHydrated) return;
    try {
      localStorage.setItem(
        FEED_FILTERS_KEY,
        JSON.stringify({ feedType, selectedStatus, selectedTags })
      );
    } catch {
      /* ignore */
    }
  }, [feedType, selectedStatus, selectedTags, filtersHydrated]);

  useEffect(() => {
    setFetchLimit(20);
  }, [selectedStatus, selectedTags, feedType, followingIds]);

  useEffect(() => {
    if (!user?.id) {
      setFollowingIds([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', user.id);
      if (cancelled) return;
      if (error) {
        console.error('Error loading following:', error);
        setFollowingIds([]);
        return;
      }
      setFollowingIds((data || []).map((r: { following_id: string }) => r.following_id));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Check if user has an active live beef they should be in
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      // Check as mediator
      const { data: mediatedBeef } = await supabase
        .from('beefs')
        .select('id, title')
        .eq('mediator_id', user.id)
        .eq('status', 'live')
        .limit(1)
        .maybeSingle();

      if (cancelled) return;
      if (mediatedBeef) {
        setActiveBeef({ id: mediatedBeef.id, title: mediatedBeef.title, role: 'Médiateur' });
        return;
      }

      // Check as challenger
      const { data: participations } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs!beef_participants_beef_id_fkey(id, title, status)')
        .eq('user_id', user.id)
        .eq('invite_status', 'accepted');

      if (cancelled) return;
      const liveParticipation = (participations || []).find(
        (p: any) => p.beefs?.status === 'live'
      );
      if (liveParticipation) {
        setActiveBeef({
          id: (liveParticipation.beefs as any).id,
          title: (liveParticipation.beefs as any).title,
          role: 'Challenger',
        });
      } else {
        setActiveBeef(null);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

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
  }, [user, feedType, selectedTags, selectedStatus, followingIds, fetchLimit]);

  const loadBeefs = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('beefs')
        .select('*, users!beefs_mediator_id_fkey(username, display_name), beef_participants(count)')
        .order('created_at', { ascending: false })
        .limit(fetchLimit);
      if (selectedStatus !== 'all') query = query.eq('status', selectedStatus);
      const { data, error } = await query;
      if (error) throw error;

      const rawCount = (data || []).length;
      let beefsWithData = (data || []).map((beef: any) => ({
        ...beef,
        host_name: beef.users?.display_name || beef.users?.username || 'Anonyme',
        viewer_count: beef.viewer_count || 0,
        tags: beef.tags || [],
        participants_count: beef.beef_participants?.[0]?.count || 0,
      }));

      if (selectedTags.length > 0) {
        beefsWithData = beefsWithData.filter((beef: any) => beef.tags?.some((tag: string) => selectedTags.includes(tag)));
      }

      if (feedType === 'abonnements') {
        const followingSet = new Set(followingIds);
        beefsWithData = beefsWithData.filter(
          (beef: any) => beef.mediator_id && followingSet.has(beef.mediator_id)
        );
        beefsWithData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      } else {
        beefsWithData.sort((a: any, b: any) => {
          if (a.status === 'live' && b.status !== 'live') return -1;
          if (a.status !== 'live' && b.status === 'live') return 1;
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        });
      }

      setBeefs(beefsWithData);
      setHasMore(rawCount >= fetchLimit);
    } catch (error) {
      console.error('Error loading beefs:', error);
      setBeefs([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    loadMoreIntentRef.current = true;
    setFetchLimit((n) => n + 20);
  };

  const handleBeefClick = (beef: Beef) => {
    if (beef.status === 'ended' || beef.status === 'replay' || beef.status === 'cancelled') {
      router.push(`/beef/${beef.id}/summary`);
      return;
    }
    router.push(`/arena/${beef.id}`);
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleCreateBeef = async (beefData: any) => {
    if (!user) { router.push('/login'); return; }
    try {
      const beef = await submitNewBeef(supabase, user.id, beefData);
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
      <Suspense fallback={null}>
        <OpenCreateModalFromQuery setOpen={setShowCreateModal} />
      </Suspense>
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Active beef banner */}
        {activeBeef && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 rounded-xl overflow-hidden"
            style={{ background: 'linear-gradient(135deg, rgba(232,58,20,0.15), rgba(255,107,44,0.1))', border: '1px solid rgba(232,58,20,0.3)' }}
          >
            <button
              onClick={() => router.push(`/arena/${activeBeef.id}`)}
              className="w-full flex items-center gap-3 px-4 py-3 text-left"
            >
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-red-500/20 flex items-center justify-center">
                <Radio className="w-5 h-5 text-red-400 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{activeBeef.title}</p>
                <p className="text-xs text-gray-400">
                  Tu es <span className="text-brand-400 font-medium">{activeBeef.role}</span> dans ce beef en cours
                </p>
              </div>
              <div className="flex-shrink-0 px-4 py-1.5 rounded-lg bg-red-500 text-white text-xs font-bold">
                Rejoindre
              </div>
            </button>
          </motion.div>
        )}

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
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar relative">
            {STATUS_FILTERS.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStatus(s.id)}
                className={`px-4 py-1.5 min-h-[36px] rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
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
            <span className="text-xs text-gray-600 font-semibold uppercase tracking-wider flex-shrink-0">Trending</span>
            {trendingTags.filter(t => !selectedTags.includes(t)).slice(0, 8).map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-brand-400 rounded-md whitespace-nowrap transition-colors flex-shrink-0"
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
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {beefs.map((beef, index) => (
                <BeefCard key={beef.id} {...beef} onClick={() => handleBeefClick(beef)} onTagClick={handleTagClick} index={index} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="px-6 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {loadingMore ? 'Chargement…' : 'Charger plus'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create modal */}
      {showCreateModal && <CreateBeefForm onSubmit={handleCreateBeef} onCancel={() => setShowCreateModal(false)} />}

      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-40">
        <div className="relative">
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={() => setShowCreateModal(true)}
            className="w-14 h-14 rounded-2xl shadow-lg flex items-center justify-center text-white brand-gradient hover:shadow-glow transition-shadow"
          >
            <Plus className="w-6 h-6" />
          </motion.button>
          <FeatureGuide
            id="feed-create-beef"
            title="Créer un Beef"
            description="Lance un débat en live ! Choisis un sujet, invite des challengers et deviens médiateur."
            position="top"
            align="end"
          />
        </div>
      </div>
    </div>
  );
}
