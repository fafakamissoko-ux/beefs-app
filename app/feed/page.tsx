'use client';

import { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { TrendingUp, Users, Flame, X, Hash, Radio, Coins, FileText, Swords } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { BeefCard } from '@/components/BeefCard';
import dynamic from 'next/dynamic';
import { submitNewBeef } from '@/lib/submitNewBeef';
import type { SubmitBeefPayload } from '@/lib/submitNewBeef';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useClientArenaOnboardingGuard } from '@/lib/client-arena-onboarding-guard';

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
  mediator_id?: string | null;
  created_by?: string | null;
  intent?: string | null;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready' | 'completed';
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
  challenger_a_username?: string | null;
  challenger_b_username?: string | null;
  mediator_name?: string | null;
  is_featured?: boolean;
  feed_position?: number;
  video_url?: string | null;
  /** Feed : médiateur ou participant accepté — libellé « Retourner dans l'Arène » sur les cartes live */
  user_is_live_ring?: boolean;
}

const STATUS_FILTERS = [
  { id: 'all', label: 'Tous statuts' },
  { id: 'live', label: 'Live' },
  { id: 'scheduled', label: 'À venir' },
  { id: 'ended', label: 'Terminés' },
];

/** Aligné sur l’admin : mis en avant → feed_position (desc) → date. */
function compareFeedOrder(a: Beef, b: Beef) {
  const fa = !!a.is_featured;
  const fb = !!b.is_featured;
  if (fa !== fb) return fa ? -1 : 1;
  const pa = Number(a.feed_position) || 0;
  const pb = Number(b.feed_position) || 0;
  if (pa !== pb) return pb - pa;
  return new Date(String(b.created_at)).getTime() - new Date(String(a.created_at)).getTime();
}

/** L’Arène : Live → à venir (pas terminé) → terminées / annulées. */
function arenaLifecycleTier(beef: Beef): number {
  if (beef.status === 'live') return 0;
  if (
    beef.status === 'ended' ||
    beef.status === 'replay' ||
    beef.status === 'completed' ||
    beef.status === 'cancelled'
  ) {
    return 2;
  }
  return 1;
}

function compareArenaOrder(a: Beef, b: Beef) {
  const ta = arenaLifecycleTier(a);
  const tb = arenaLifecycleTier(b);
  if (ta !== tb) return ta - tb;
  return compareFeedOrder(a, b);
}

export default function FeedPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  useClientArenaOnboardingGuard(user?.id);
  const { toast } = useToast();
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
        if (o.feedType === 'pour-vous' || o.feedType === 'abonnements' || o.feedType === 'manifestes') setFeedType(o.feedType);
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

      if (feedType === 'manifestes') {
        query = query.eq('intent', 'manifesto').is('mediator_id', null);
      }

      if (feedType === 'pour-vous') {
        query = query.or('intent.is.null,intent.neq.manifesto,mediator_id.not.is.null');
      }

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
      const challengerAUsernameByBeef: Record<string, string | null> = {};
      const challengerBUsernameByBeef: Record<string, string | null> = {};
      let userOnLiveRingByBeef = new Map<string, boolean>();

      const publicIds = new Set<string>();
      for (const b of beefList as { mediator_id?: string | null; created_by?: string | null }[]) {
        if (b.mediator_id) publicIds.add(b.mediator_id);
        if (b.created_by) publicIds.add(b.created_by);
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
          for (const beef of beefList as { id: string; mediator_id?: string | null; created_by?: string | null }[]) {
            const mid = beef.mediator_id;
            const creatorId = beef.created_by;
            const rows = byBeef.get(beef.id) || [];
            const invited = mediatorInviteeIdsByBeef.get(beef.id);
            const nonMed = rows.filter((r) => {
              if (r.role === 'witness') return false;
              if (mid && r.user_id === mid) return false;
              if (!mid && creatorId && r.user_id === creatorId) return false;
              return true;
            });
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
            const w = (userId: string) => feedPublicMap.get(userId)?.username?.trim() || null;
            if (eligible[0]) challengerAUsernameByBeef[beef.id] = w(eligible[0].user_id);
            if (eligible[1]) challengerBUsernameByBeef[beef.id] = w(eligible[1].user_id);
          }

          const ringUid = user?.id;
          if (ringUid && partRows) {
            for (const row of partRows as PartRow[]) {
              if (row.user_id !== ringUid) continue;
              if (row.invite_status !== 'accepted') continue;
              if (row.role === 'witness') continue;
              userOnLiveRingByBeef.set(row.beef_id, true);
            }
          }
        }
      }

      const rawCount = beefList.length;
      const { displayNameFromPublicRow: dnFromMap } = await import('@/lib/fetch-user-public-profile');

      const uid = user?.id;
      let beefsWithData = beefList.map((beef: Record<string, unknown>) => {
        const mid = beef.mediator_id as string | null | undefined;
        const cid = beef.created_by as string | null | undefined;
        const med = mid ? feedPublicMap.get(mid) : undefined;
        const author = cid ? feedPublicMap.get(cid) : undefined;
        const hostSource = med ?? author;
        const hostN = dnFromMap(hostSource, 'Anonyme');
        const partAgg = beef.beef_participants as { count: number }[] | undefined;
        const bid = String(beef.id);
        const onRing = Boolean(uid && (mid === uid || userOnLiveRingByBeef.get(bid)));
        return {
          ...beef,
          host_name: hostN,
          host_username: hostSource?.username?.trim() || null,
          mediator_name: mid ? hostN : null,
          viewer_count: Number(beef.viewer_count) || 0,
          tags: (beef.tags as string[] | undefined) || [],
          participants_count: partAgg?.[0]?.count || 0,
          challenger_a_name: challengerANameByBeef[bid] ?? null,
          challenger_b_name: challengerBNameByBeef[bid] ?? null,
          challenger_a_username: challengerAUsernameByBeef[bid] ?? null,
          challenger_b_username: challengerBUsernameByBeef[bid] ?? null,
          user_is_live_ring: onRing,
          video_url: (beef.video_url as string | null | undefined) ?? null,
        };
      }) as Beef[];

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

      if (feedType === 'abonnements') {
        const followingSet = new Set(followingIds);
        beefsWithData = beefsWithData.filter(
          (beef: any) => beef.mediator_id && followingSet.has(beef.mediator_id)
        );
        beefsWithData.sort(compareFeedOrder);
      } else if (feedType === 'pour-vous') {
        beefsWithData.sort(compareArenaOrder);
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
  }, [fetchLimit, selectedStatus, selectedTags, feedType, followingIds, user?.id]);

  const handleClaimManifesto = useCallback(
    async (beefId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('beefs')
        .update({ mediator_id: user.id, status: 'scheduled' })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .is('mediator_id', null)
        .neq('created_by', user.id);
      if (error) {
        toast(error.message || 'Impossible de saisir cette affaire', 'error');
        return;
      }
      toast('Affaire saisie ! Retrouve-la dans l’onglet Pour toi.', 'success');
      setFeedType('pour-vous');
      void loadBeefs();
    },
    [user?.id, toast, loadBeefs]
  );

  const handleWithdrawManifesto = useCallback(
    async (beefId: string) => {
      if (!user?.id) return;
      const { error } = await supabase
        .from('beefs')
        .update({ mediator_id: null, status: 'pending' })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .eq('mediator_id', user.id);
      if (error) {
        toast(error.message || 'Impossible de te désister', 'error');
        return;
      }
      toast('Tu n’es plus médiateur sur cette affaire.', 'success');
      void loadBeefs();
    },
    [user?.id, toast, loadBeefs]
  );

  useEffect(() => {
    if (!user) {
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');
      if (hasSeenOnboarding !== 'true') { router.push('/welcome'); return; }
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

  const handleAuraClick = async (beefId: string) => {
    if (!user) return;

    setBeefs((prev) =>
      prev.map((b) => (b.id === beefId ? { ...b, engagement_score: (b.engagement_score || 0) + 1 } : b)),
    );

    // NOTE ARCHITECTURALE : Le futur backend (Supabase RPC) appliquera
    // la règle de répartition : 50% Médiateur / 25% Ch. A / 25% Ch. B.
  };

  const handleBeefClick = (beef: Beef) => {
    if (
      beef.status === 'ended' ||
      beef.status === 'replay' ||
      beef.status === 'completed' ||
      beef.status === 'cancelled'
    ) {
      router.push(`/beef/${beef.id}/summary`);
      return;
    }
    router.push(`/arena/${beef.id}`);
  };

  const handleTagClick = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const handleCreateBeef = async (beefData: SubmitBeefPayload) => {
    if (!user) { router.push('/login'); return; }
    try {
      await submitNewBeef(supabase, user.id, beefData);
      setShowCreateModal(false);
      router.push('/feed');
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <OpenCreateModalFromQuery setOpen={setShowCreateModal} />
      </Suspense>
        {/* Bannière + onglets + filtres (desktop) — dans le flux, repousse le scroll */}
        <div className="z-[100] flex w-full shrink-0 flex-col bg-black/80 px-4 pb-3 pt-3 backdrop-blur-md md:mb-8 md:space-y-4 md:px-0 md:pt-0 lg:bg-transparent lg:backdrop-blur-none">

            {/* Active beef banner (Maintenant fluide au-dessus des onglets) */}
            {activeBeef && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-cobalt-500/12 to-ember-500/8 border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] md:mb-6"
              >
                <button
                  onClick={() => router.push(`/arena/${activeBeef.id}`)}
                  className="w-full flex items-center gap-4 px-5 py-3 md:py-4 text-left"
                >
                  <div className="flex h-9 w-9 md:h-11 md:w-11 flex-shrink-0 items-center justify-center rounded-xl border border-ember-500/30 bg-ember-500/15">
                    <Radio className="h-4 w-4 md:h-5 md:w-5 animate-pulse text-ember-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-sans text-sm font-bold text-white truncate">{activeBeef.title}</p>
                    <p className="font-sans text-[11px] md:text-xs text-white/50">
                      Tu es <span className="text-brand-400 font-semibold">{activeBeef.role}</span> dans ce beef
                    </p>
                  </div>
                  <div className="flex-shrink-0 px-3 md:px-4 py-1.5 rounded-full bg-red-500 text-white font-mono text-[9px] md:text-[10px] font-bold uppercase tracking-wider">
                    Rejoindre
                  </div>
                </button>
              </motion.div>
            )}

            {/* Les onglets */}
            <div className="flex flex-wrap items-center justify-between gap-4 gap-y-4 max-md:mb-0 max-md:justify-center md:mb-8">
            <div className="flex max-w-full min-w-0 max-md:w-full max-md:justify-center max-md:gap-4 flex-wrap items-center justify-center gap-6 border-b border-white/[0.08] max-md:border-0 max-md:pb-0">
              {[
                { id: 'pour-vous' as const, label: 'Pour toi', icon: TrendingUp },
                { id: 'abonnements' as const, label: 'Abonnements', icon: Users },
                { id: 'manifestes' as const, label: 'À Saisir', icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFeedType(tab.id)}
                  className={`flex min-h-[44px] items-center gap-2 pb-1 text-sm transition-colors ${
                    feedType === tab.id
                      ? 'border-b-2 border-brand-500 font-bold text-white'
                      : 'border-b-2 border-transparent pb-1 text-white/50 hover:text-white/80'
                  }`}
                >
                  <tab.icon className={`h-4 w-4 shrink-0 ${feedType === tab.id ? 'text-white' : 'text-white/40'}`} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            <a
              href={hrefWithFrom('/buy-points', pathname)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] max-md:hidden shrink-0 items-center justify-center gap-2 rounded-full border border-ember-500/30 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-ember-400 transition-colors hover:bg-ember-500/10 hover:text-white lg:hidden"
            >
              <Coins className="w-4 h-4 flex-shrink-0" />
              <span>Acquérir de l&apos;Aura</span>
            </a>
          </div>

          <div className="mb-8 max-md:hidden space-y-4">
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
        </div>

        {/* Content */}
        {loading ? (
          <div
            id="feed-scroll-container"
            className="flex min-h-0 flex-1 flex-col snap-y snap-mandatory overflow-y-auto hide-scrollbar md:grid md:min-h-0 md:h-auto md:max-h-none md:w-full md:grid-cols-2 md:gap-6 md:overflow-visible md:snap-none md:gap-y-6 md:py-0 md:pt-0 md:pb-8 md:scroll-pt-0 lg:grid-cols-3"
          >
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
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center md:justify-center">
            <div className="relative mb-6 group">
              <div className="absolute inset-0 rounded-full bg-prestige-gold/20 blur-xl transition-all duration-700 group-hover:bg-prestige-gold/30 group-hover:blur-2xl" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-xl shadow-[0_0_30px_rgba(212,175,55,0.15)]">
                <Flame className="h-10 w-10 text-prestige-gold opacity-80" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-bold text-white mb-2 tracking-tight">Le calme avant la tempête</h3>
            <p className="font-sans text-sm md:text-base text-white/40 mb-8 max-w-xs leading-relaxed">Aucune affaire en cours ici. Prenez l'initiative et ouvrez les hostilités.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2.5 rounded-full border border-prestige-gold/30 bg-prestige-gold/10 px-8 py-3.5 text-sm font-bold text-prestige-gold shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all hover:bg-prestige-gold/20 hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] active:scale-[0.97]"
            >
              <Swords className="h-5 w-5" strokeWidth={2} />
              Initier un Beef
            </button>
          </div>
        ) : (
          <>
            <div
              id="feed-scroll-container"
              className="flex min-h-0 flex-1 flex-col snap-y snap-mandatory overflow-y-auto hide-scrollbar md:grid md:min-h-0 md:h-auto md:max-h-none md:w-full md:grid-cols-2 md:gap-6 md:overflow-visible md:snap-none md:gap-y-6 md:py-0 md:pt-0 md:pb-8 md:scroll-pt-0 lg:grid-cols-3"
            >
              {beefs.map((beef, index) => (
                <div key={beef.id} className="relative w-full shrink-0 snap-start snap-always max-md:h-full">
                  <BeefCard
                    {...beef}
                    onPrepareAudience={
                      beef.status === 'scheduled' && user?.id === beef.mediator_id
                        ? () => router.push(`/live/${beef.id}`)
                        : undefined
                    }
                    saisirTab={feedType === 'manifestes'}
                    onSaisirAffaire={
                      beef.status === 'pending' &&
                      beef.intent === 'manifesto' &&
                      user?.id &&
                      beef.created_by &&
                      beef.created_by !== user.id
                        ? () => void handleClaimManifesto(beef.id)
                        : undefined
                    }
                    onSeDesister={
                      beef.status === 'scheduled' &&
                      user?.id === beef.mediator_id &&
                      beef.intent === 'manifesto'
                        ? () => void handleWithdrawManifesto(beef.id)
                        : undefined
                    }
                    liveAudienceAction={
                      beef.status === 'live'
                        ? {
                            variant: beef.user_is_live_ring ? 'return' : 'join',
                            onClick: () => router.push(`/arena/${beef.id}`),
                          }
                        : undefined
                    }
                    onClick={() => handleBeefClick(beef)}
                    onAuraClick={() => handleAuraClick(beef.id)}
                    onTagClick={handleTagClick}
                    onNotifyClick={
                      beef.status === 'scheduled'
                        ? () => toast('Bientôt : rappel quand l’heure approche.', 'info')
                        : undefined
                    }
                    index={index}
                  />
                </div>
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
      {showCreateModal && <CreateBeefForm onSubmit={handleCreateBeef} onCancel={() => setShowCreateModal(false)} />}

    </div>
  );
}
