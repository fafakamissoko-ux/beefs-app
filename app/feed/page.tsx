'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Flame, X, Plus, Hash, Radio, Coins, FileText } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefCard } from '@/components/BeefCard';
import dynamic from 'next/dynamic';
import { FeatureGuide } from '@/components/FeatureGuide';
import { submitNewBeef } from '@/lib/submitNewBeef';
import { hrefWithFrom } from '@/lib/navigation-return';

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
  host_username?: string | null;
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
  challenger_a_name?: string | null;
  challenger_b_name?: string | null;
  mediator_name?: string | null;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Tout' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'À venir' },
  { id: 'ended', label: 'Terminés' },
];

/** Aligné sur l’admin : mis en avant → feed_position (desc) → date. */
function compareFeedOrder(a: Record<string, unknown>, b: Record<string, unknown>) {
  const fa = !!a.is_featured;
  const fb = !!b.is_featured;
  if (fa !== fb) return fa ? -1 : 1;
  const pa = Number(a.feed_position) || 0;
  const pb = Number(b.feed_position) || 0;
  if (pa !== pb) return pb - pa;
  return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
}

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedType, setFeedType] = useState<'pour-vous' | 'abonnements' | 'manifestes'>('pour-vous');
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

  const loadBeefs = useCallback(async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('beefs')
        .select('*, beef_participants(count)')
        .order('feed_position', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(fetchLimit);
      if (selectedStatus !== 'all' && selectedStatus !== 'scheduled') {
        query = query.eq('status', selectedStatus);
      }
      if (selectedStatus === 'scheduled') {
        query = query.in('status', ['scheduled', 'pending']);
      }
      const { data, error } = await query;
      if (error) throw error;

      const beefList = data || [];
      const beefIds = beefList.map((b: { id: string }) => b.id);
      const challengerANameByBeef: Record<string, string> = {};
      const challengerBNameByBeef: Record<string, string> = {};

      const publicIds = new Set<string>();
      for (const b of beefList as { mediator_id?: string | null }[]) {
        if (b.mediator_id) publicIds.add(b.mediator_id);
      }

      let feedPublicMap = new Map<string, import('@/lib/fetch-user-public-profile').UserPublicProfileRow>();

      if (beefIds.length > 0) {
        const mediatorByBeef = new Map<string, string | null | undefined>(
          (beefList as { id: string; mediator_id?: string | null }[]).map((b) => [b.id, b.mediator_id]),
        );

        const { data: inviteRows } = await supabase
          .from('beef_invitations')
          .select('beef_id, invitee_id, inviter_id, status')
          .in('beef_id', beefIds)
          .in('status', ['sent', 'seen', 'accepted']);

        const mediatorInviteeIdsByBeef = new Map<string, Set<string>>();
        for (const inv of inviteRows || []) {
          const row = inv as { beef_id: string; invitee_id: string; inviter_id: string };
          const mid = mediatorByBeef.get(row.beef_id);
          if (mid && row.inviter_id === mid) {
            const s = mediatorInviteeIdsByBeef.get(row.beef_id) || new Set<string>();
            s.add(row.invitee_id);
            mediatorInviteeIdsByBeef.set(row.beef_id, s);
          }
        }

        const { data: partRows, error: partErr } = await supabase
          .from('beef_participants')
          .select('beef_id, user_id, invite_status, created_at, is_main, role')
          .in('beef_id', beefIds);

        if (!partErr && partRows) {
          for (const row of partRows as { user_id: string }[]) {
            if (row.user_id) publicIds.add(row.user_id);
          }
        }

        const { fetchUserPublicByIds, displayNameFromPublicRow } = await import('@/lib/fetch-user-public-profile');
        feedPublicMap = await fetchUserPublicByIds(supabase, [...publicIds], 'id, username, display_name');

        if (!partErr && partRows) {
          type PartRow = {
            beef_id: string;
            user_id: string;
            invite_status: string | null;
            created_at: string;
            is_main: boolean | null;
            role: string | null;
          };
          const byBeef = new Map<string, PartRow[]>();
          for (const row of partRows as PartRow[]) {
            const list = byBeef.get(row.beef_id) || [];
            list.push(row);
            byBeef.set(row.beef_id, list);
          }
          const packName = (userId: string) => displayNameFromPublicRow(feedPublicMap.get(userId), '');
          for (const beef of beefList as { id: string; mediator_id?: string | null }[]) {
            const mid = beef.mediator_id;
            const rows = byBeef.get(beef.id) || [];
            const invited = mediatorInviteeIdsByBeef.get(beef.id);
            const nonMed = rows.filter((r) => r.user_id !== mid && r.role !== 'witness');
            // Inclure les « pending » dès qu’ils sont dans beef_participants : les spectateurs ne voient
            // pas les lignes beef_invitations (RLS), donc invited serait vide sans ce cas.
            const eligible = nonMed.filter((r) => {
              if (r.invite_status === 'declined') return false;
              if (r.invite_status === 'accepted' || r.invite_status === 'pending') return true;
              return invited?.has(r.user_id) ?? false;
            });
            eligible.sort((a, b) => {
              const ra = a.invite_status === 'accepted' ? 0 : 1;
              const rb = b.invite_status === 'accepted' ? 0 : 1;
              if (ra !== rb) return ra - rb;
              const ma = a.is_main ? 0 : 1;
              const mb = b.is_main ? 0 : 1;
              if (ma !== mb) return ma - mb;
              return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
            });
            const first = packName(eligible[0]?.user_id ?? '');
            const second = packName(eligible[1]?.user_id ?? '');
            if (first) challengerANameByBeef[beef.id] = first;
            if (second) challengerBNameByBeef[beef.id] = second;
          }
        }
      }

      const rawCount = beefList.length;
      const { displayNameFromPublicRow: dnFromMap } = await import('@/lib/fetch-user-public-profile');

      let beefsWithData = beefList.map((beef: any) => {
        const med = beef.mediator_id ? feedPublicMap.get(beef.mediator_id) : undefined;
        const hostN = dnFromMap(med, 'Anonyme');
        return {
          ...beef,
          host_name: hostN,
          host_username: med?.username?.trim() || null,
          mediator_name: hostN,
          viewer_count: beef.viewer_count || 0,
          tags: beef.tags || [],
          participants_count: beef.beef_participants?.[0]?.count || 0,
          challenger_a_name: challengerANameByBeef[beef.id] ?? null,
          challenger_b_name: challengerBNameByBeef[beef.id] ?? null,
        };
      });

      if (selectedStatus === 'scheduled') {
        const now = Date.now();
        beefsWithData = beefsWithData.filter((beef: any) => {
          const at = beef.scheduled_at ? new Date(beef.scheduled_at).getTime() : 0;
          if (beef.status === 'pending' && beef.scheduled_at) return at > now;
          if (beef.status === 'scheduled') return !beef.scheduled_at || at > now;
          return false;
        });
      }

      if (selectedTags.length > 0) {
        beefsWithData = beefsWithData.filter((beef: any) => beef.tags?.some((tag: string) => selectedTags.includes(tag)));
      }

      if (feedType === 'manifestes') {
        beefsWithData = beefsWithData.filter(
          (beef: any) => beef.status === 'pending'
        );
        beefsWithData.sort(compareFeedOrder);
      } else if (feedType === 'abonnements') {
        const followingSet = new Set(followingIds);
        beefsWithData = beefsWithData.filter(
          (beef: any) => beef.mediator_id && followingSet.has(beef.mediator_id)
        );
        beefsWithData.sort(compareFeedOrder);
      } else {
        beefsWithData.sort(compareFeedOrder);
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
  }, [fetchLimit, selectedStatus, selectedTags, feedType, followingIds]);

  useEffect(() => {
    if (!user) {
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (hasSeenOnboarding !== 'true') { router.push('/onboarding'); return; }
      router.push('/login');
      return;
    }
    void loadBeefs();
  }, [user, router, loadBeefs]);

  useEffect(() => {
    if (user) {
      void loadBeefs();
      const channel = supabase.channel('beefs_changes').on('postgres_changes', { event: '*', schema: 'public', table: 'beefs' }, () => void loadBeefs()).subscribe();
      return () => { channel.unsubscribe(); };
    }
  }, [user, feedType, selectedTags, selectedStatus, followingIds, fetchLimit, loadBeefs]);

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
      <div className="flex min-h-dvh items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh">
      <Suspense fallback={null}>
        <OpenCreateModalFromQuery setOpen={setShowCreateModal} />
      </Suspense>
      <div className="w-full max-w-full pb-8 pt-6 sm:pt-8">
        {/* Active beef banner */}
        {activeBeef && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 overflow-hidden rounded-2xl bg-gradient-to-r from-cobalt-500/12 to-ember-500/8 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            <button
              onClick={() => router.push(`/arena/${activeBeef.id}`)}
              className="w-full flex items-center gap-4 px-5 py-4 text-left"
            >
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border border-ember-500/30 bg-ember-500/15">
                <Radio className="h-5 w-5 animate-pulse text-ember-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-sans text-sm font-bold text-white truncate">{activeBeef.title}</p>
                <p className="font-sans text-xs text-white/50">
                  Tu es <span className="text-brand-400 font-semibold">{activeBeef.role}</span> dans ce beef en cours
                </p>
              </div>
              <div className="flex-shrink-0 px-4 py-1.5 rounded-full bg-red-500 text-white font-mono text-[10px] font-bold uppercase tracking-wider">
                Rejoindre
              </div>
            </button>
          </motion.div>
        )}

        {/* Feed tabs + achat de points */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4 gap-y-4">
          <div className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-full bg-white/[0.05] p-1 backdrop-blur-md">
            {[
              { id: 'pour-vous', label: 'Pour vous', icon: TrendingUp },
              { id: 'abonnements', label: 'Abonnements', icon: Users },
              { id: 'manifestes', label: 'Manifestes', icon: FileText },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setFeedType(tab.id as any)}
                className={`relative flex min-h-[44px] items-center gap-2 rounded-full px-5 py-2 text-sm font-bold transition-all duration-200 ${
                  feedType === tab.id
                    ? 'text-white bg-white/10 ring-1 ring-white/[0.12] shadow-[0_0_12px_rgba(0,82,255,0.12)]'
                    : 'text-gray-500 hover:text-gray-200'
                }`}
              >
                <tab.icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
          <a
            href={hrefWithFrom('/buy-points', pathname)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-full border border-ember-500/30 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-ember-400 transition-colors hover:bg-ember-500/10 hover:text-white lg:hidden"
          >
            <Coins className="w-4 h-4 flex-shrink-0" />
            <span>Acquérir de l&apos;Aura</span>
          </a>
        </div>

        {/* Filters */}
        <div className="mb-8 space-y-4">
          {/* Status pills — ghost/glass */}
          <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar">
            {STATUS_FILTERS.map(s => (
              <button
                key={s.id}
                onClick={() => setSelectedStatus(s.id)}
                className={`inline-flex min-h-[44px] items-center px-4 py-1.5 rounded-full font-sans text-xs font-semibold whitespace-nowrap border transition-all duration-200 ${
                  selectedStatus === s.id
                    ? 'text-white bg-white/10 border-white/30'
                    : 'text-gray-500 bg-transparent border-white/[0.08] hover:text-gray-300 hover:border-white/15'
                }`}
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
              className="input-field pl-10 text-sm py-2.5 rounded-full"
            />
          </div>

          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <motion.div key={tag} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white brand-gradient">
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
          <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar pb-1">
            <span className="font-mono text-[10px] text-white/30 font-bold uppercase tracking-[0.15em] flex-shrink-0">Trending</span>
            {trendingTags.filter(t => !selectedTags.includes(t)).slice(0, 8).map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="inline-flex min-h-[44px] flex-shrink-0 items-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-sans text-xs font-medium text-white/40 whitespace-nowrap transition-colors hover:text-brand-400"
              >
                #{tag}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="overflow-hidden rounded-[2rem] bg-white/[0.04] border border-white/[0.06]">
                <div className="skeleton h-48 rounded-none" />
                <div className="p-5 space-y-3">
                  <div className="skeleton h-4 w-3/4 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-16 rounded-full" />
                    <div className="skeleton h-5 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : beefs.length === 0 ? (
          <div className="text-center py-32">
            <div className="w-20 h-20 mx-auto mb-5 rounded-[1.5rem] flex items-center justify-center bg-white/[0.03] border border-white/[0.06]">
              <Flame className="w-9 h-9 text-white/20" />
            </div>
            <h3 className="font-sans text-xl font-bold text-white mb-2">Aucun beef en cours</h3>
            <p className="font-sans text-sm text-white/40 mb-8">Soyez le premier à régler un beef en live !</p>
            <button onClick={() => setShowCreateModal(true)} className="btn-primary inline-flex items-center gap-2 rounded-full px-8">
              <Flame className="w-4 h-4" />
              Régler un beef
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
              {beefs.map((beef, index) => (
                <BeefCard key={beef.id} {...beef} onClick={() => handleBeefClick(beef)} onTagClick={handleTagClick} index={index} />
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-12">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full bg-white/[0.06] border border-white/[0.08] px-8 py-3 font-sans text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10 hover:border-white/15 disabled:opacity-50"
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

      {/* FAB — prestige gold squircle */}
      <div className="fixed bottom-8 right-8 z-40 lg:hidden">
        <div className="relative">
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setShowCreateModal(true)}
            className="flex h-16 w-16 items-center justify-center rounded-[1.25rem] bg-prestige-gold text-black shadow-2xl shadow-prestige-gold/20 transition-shadow hover:shadow-[0_0_40px_rgba(212,175,55,0.35)]"
          >
            <Plus className="w-7 h-7" strokeWidth={2.5} />
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
