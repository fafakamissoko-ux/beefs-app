'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  BellOff,
  Clock,
  Flame,
  Gift,
  Mail,
  MessageCircle,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackButton } from '@/components/AppBackButton';
import { useToast } from '@/components/Toast';
import { isNotificationUnread } from '@/lib/notification-unread';

type NotificationType =
  | 'follow'
  | 'invite'
  | 'beef_live'
  | 'gift'
  | 'message'
  | 'system'
  | 'aura';

export interface AppNotification {
  id: string;
  created_at: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean | null;
  metadata: Record<string, unknown> | null;
}

interface AuraSparkNotification {
  id: string;
  created_at: string;
  is_read: boolean | null;
  giver_name?: string | null;
  giver_username?: string | null;
  aura_kind?: string | null;
}

function shortTimeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'maintenant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}j`;
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const ICON_MAP: Record<
  NotificationType,
  { icon: typeof Bell; color: string; bg: string }
> = {
  follow: { icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
  invite: { icon: Mail, color: 'text-orange-400', bg: 'bg-orange-500/15' },
  beef_live: { icon: Flame, color: 'text-red-400', bg: 'bg-red-500/15' },
  gift: { icon: Gift, color: 'text-amber-400', bg: 'bg-amber-500/15' },
  message: { icon: MessageCircle, color: 'text-sky-400', bg: 'bg-sky-500/15' },
  system: { icon: Bell, color: 'text-violet-400', bg: 'bg-violet-500/15' },
  aura: { icon: Sparkles, color: 'text-brand-400', bg: 'bg-brand-500/15' },
};

function SkeletonCard() {
  return (
    <div className="flex items-start gap-4 animate-pulse px-4 py-3 border-b border-white/5 w-full">
      <div className="w-10 h-10 rounded-full bg-white/10 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-white/10 rounded w-3/4" />
        <div className="h-3 bg-white/5 rounded w-1/2" />
      </div>
      <div className="h-3 bg-white/5 rounded w-16 shrink-0" />
    </div>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auraNotifications, setAuraNotifications] = useState<AuraSparkNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'aura' | 'mentions'>('all');

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?redirect=/notifications');
    }
  }, [user, authLoading, router]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [notifRes, auraRes] = await Promise.all([
        supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(4000),
        supabase
          .from('aura_notifications')
          .select('id, created_at, giver_name, giver_username, aura_kind, is_read')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(4000),
      ]);

      if (notifRes.error) throw notifRes.error;
      setNotifications((notifRes.data ?? []) as AppNotification[]);
      setAuraNotifications(auraRes.error ? [] : ((auraRes.data ?? []) as AuraSparkNotification[]));

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user, fetchNotifications]);

  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev;
            return [row, ...prev];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new as AppNotification;
          setNotifications((prev) =>
            prev.map((n) => (n.id === row.id ? row : n))
          );
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchNotifications]);

  const markAllRead = async () => {
    if (!user || markingAll) return;
    setMarkingAll(true);
    try {
      if (activeTab === 'all') {
        await supabase.rpc('mark_all_notifications_read');
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setAuraNotifications((prev) => prev.map((a) => ({ ...a, is_read: true })));
      } else if (activeTab === 'aura') {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .eq('type', 'aura')
          .or('is_read.is.null,is_read.eq.false');
        await supabase
          .from('aura_sparks')
          .update({ is_read: true })
          .eq('receiver_id', user.id)
          .or('is_read.is.null,is_read.eq.false');
        setNotifications((prev) =>
          prev.map((n) => (n.type === 'aura' ? { ...n, is_read: true } : n)),
        );
        setAuraNotifications((prev) => prev.map((a) => ({ ...a, is_read: true })));
      } else {
        await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .neq('type', 'aura')
          .or('is_read.is.null,is_read.eq.false');
        setNotifications((prev) =>
          prev.map((n) => (n.type !== 'aura' ? { ...n, is_read: true } : n)),
        );
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
      toast('Notifications marquées comme lues', 'success');
    } catch (err) {
      console.error('[notifications] markAllRead', err);
      toast('Impossible de marquer comme lu. Réessaie dans un instant.', 'error');
    } finally {
      setMarkingAll(false);
    }
  };

  const handleRowClick = async (n: AppNotification) => {
    const isSparkRow = n.id.startsWith('spark-');

    if (!n.is_read) {
      if (isSparkRow) {
        const pureId = n.id.replace('spark-', '');
        const { error: sparkErr } = await supabase
          .from('aura_sparks')
          .update({ is_read: true })
          .eq('id', pureId);
        if (sparkErr) {
          console.error('[notifications] mark spark read', sparkErr);
        }
        setAuraNotifications((prev) =>
          prev.map((x) => (x.id === n.id || x.id === pureId ? { ...x, is_read: true } : x)),
        );
      } else {
        const { error: rpcErr } = await supabase.rpc('mark_notification_read', { p_id: n.id });
        if (rpcErr && user) {
          const { error: upErr } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', n.id)
            .eq('user_id', user.id);
          if (upErr) {
            console.error('[notifications] mark one read', rpcErr, upErr);
          }
        }
        setNotifications((prev) =>
          prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
        );
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    }

    // Invité mais pas encore accepté : l’arène ouvre en spectateur ; on envoie vers les invitations.
    if (n.type === 'beef_live' && user?.id && n.metadata && typeof n.metadata === 'object') {
      const beefId = (n.metadata as Record<string, unknown>).beef_id;
      if (typeof beefId === 'string' && beefId.length > 0) {
        const { data: part } = await supabase
          .from('beef_participants')
          .select('invite_status')
          .eq('beef_id', beefId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (part?.invite_status === 'pending') {
          router.push('/invitations');
          return;
        }
      }
    }

    if (n.link) {
      let finalLink = n.link;
      if (finalLink.startsWith('/beef/') && finalLink.includes('view=comments')) {
        const match = finalLink.match(/^\/beef\/([a-zA-Z0-9-]+)(\?.*)?$/);
        if (match) {
          const beefId = match[1];
          finalLink = `/feed?beefId=${beefId}&view=comments`;
        }
      }
      router.push(finalLink);
    }
  };

  const auraAsAppNotifications = useMemo((): AppNotification[] => {
    if (!user) return [];
    return auraNotifications.map((a) => {
      const giverLabel = a.giver_name || a.giver_username || 'Quelqu\'un';
      return {
        id: a.id.startsWith('spark-') ? a.id : `spark-${a.id}`,
        created_at: a.created_at,
        user_id: user.id,
        type: 'aura' as const,
        title: 'Étincelle d\'Aura',
        body: `${giverLabel} t'a transmis de l'Aura`,
        link: a.giver_username ? `/profile/${a.giver_username}` : null,
        is_read: a.is_read,
        metadata: a.aura_kind ? { aura_kind: a.aura_kind } : null,
      };
    });
  }, [auraNotifications, user]);

  const displayNotifications = useMemo(
    () =>
      [...notifications, ...auraAsAppNotifications].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [notifications, auraAsAppNotifications],
  );

  const filteredNotifications = useMemo(() => {
    if (activeTab === 'all') return displayNotifications;
    if (activeTab === 'aura') return displayNotifications.filter((n) => n.type === 'aura');
    return displayNotifications.filter((n) => n.type !== 'aura');
  }, [displayNotifications, activeTab]);

  const isPageLoading = authLoading || loading;
  const unreadCount = displayNotifications.filter(isNotificationUnread).length;
  const unreadFilteredCount = filteredNotifications.filter(isNotificationUnread).length;

  const TAB_OPTIONS: { id: 'all' | 'aura' | 'mentions'; label: string }[] = [
    { id: 'all', label: 'Tout' },
    { id: 'aura', label: 'Aura' },
    { id: 'mentions', label: 'Mentions' },
  ];

  if (!authLoading && !user) return null;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-3xl font-black text-white truncate">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="brand-gradient text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>
            <Bell className="w-6 h-6 text-gray-500 shrink-0" />
          </div>
          <div className="flex flex-wrap gap-2">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {filteredNotifications.length > 0 && unreadFilteredCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="self-start text-sm font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
            >
              {markingAll ? 'Mise à jour…' : 'Tout marquer comme lu'}
            </button>
          )}
        </div>

        {isPageLoading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-12 border-b border-white/5 flex flex-col items-center justify-center w-full"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <BellOff className="w-8 h-8 text-gray-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Aucune notification
            </h2>
            <p className="text-gray-500 text-sm">
              Quand tu recevras des suivis, invitations, messages, étincelles d’Aura ou alertes,
              elles apparaîtront ici.
            </p>
          </motion.div>
        ) : (
          <div>
            <AnimatePresence>
              {filteredNotifications.map((n, i) => {
                const mapKey =
                  typeof n.type === 'string' && n.type in ICON_MAP ? (n.type as NotificationType) : 'system';
                const { icon: Icon, color, bg } = ICON_MAP[mapKey];
                const unread = isNotificationUnread(n);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
                    onClick={() => handleRowClick(n)}
                    className={`flex items-start gap-4 w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04] border-b border-white/5 ${
                      unread ? 'bg-brand-500/5' : ''
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-sm font-bold text-white">{n.title}</p>
                      {n.body ? (
                        <p className="text-sm text-gray-400 line-clamp-2">
                          {n.body}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {shortTimeAgo(n.created_at)}
                      </span>
                      {unread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
