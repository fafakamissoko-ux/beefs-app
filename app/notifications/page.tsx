'use client';

import { useCallback, useEffect, useState } from 'react';
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

type AuraNotificationRow = {
  id: string;
  user_id: string;
  created_at: string;
  giver_name: string;
  giver_username: string | null;
  aura_kind: string | null;
  giver_id?: string | null;
};

function mapAuraRowToAppNotification(row: AuraNotificationRow): AppNotification {
  const name = row.giver_name?.trim() || 'Quelqu’un';
  const isTeaser = row.aura_kind === 'teaser';
  const title = isTeaser
    ? `📸 Ton Teaser gagne en Aura (+${name})`
    : `✨ ${name} a validé ton Aura !`;
  const slugRaw = row.giver_username?.trim();
  const slug = slugRaw ? slugRaw.replace(/^@/, '') : '';
  /** Profils publics : segment [username], encodé pour caractères spéciaux. */
  const link = slug.length > 0 ? `/profile/${encodeURIComponent(slug)}` : null;

  return {
    id: row.id,
    created_at: row.created_at,
    user_id: row.user_id,
    type: 'aura',
    title,
    body: null,
    link,
    is_read: false,
    metadata: {
      giver_username: slug.length > 0 ? slug : null,
      aura_kind: row.aura_kind,
      ...(row.giver_id ? { giver_id: row.giver_id } : {}),
    },
  };
}

function SkeletonCard() {
  return (
    <div className="card rounded-xl p-4 flex items-start gap-4 animate-pulse">
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
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

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
          .select('id,user_id,created_at,giver_name,giver_username,aura_kind,giver_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(2000),
      ]);

      if (notifRes.error) throw notifRes.error;
      const baseRows = (notifRes.data ?? []) as AppNotification[];

      const auraMerged: AppNotification[] = auraRes.error
        ? []
        : (auraRes.data ?? []).map((r: AuraNotificationRow) => mapAuraRowToAppNotification(r));

      if (auraRes.error) console.warn('[radar] aura_notifications', auraRes.error);

      const merged = [...baseRows, ...auraMerged].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );
      setNotifications(merged);

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
          event: '*',
          schema: 'public',
          table: 'aura_sparks',
          filter: `receiver_id=eq.${user.id}`,
        },
        () => {
          void fetchNotifications();
        },
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
      const { error: rpcErr } = await supabase.rpc('mark_all_notifications_read');
      if (rpcErr) {
        const { error: upErr } = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', user.id)
          .or('is_read.is.null,is_read.eq.false');
        if (upErr) {
          console.error('[notifications] markAllRead', rpcErr, upErr);
          toast('Impossible de tout marquer comme lu. Réessaie dans un instant.', 'error');
          return;
        }
      }
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true }))
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } finally {
      setMarkingAll(false);
    }
  };

  const handleRowClick = async (n: AppNotification) => {
    const isSparkRow = n.type === 'aura' || n.id.startsWith('spark-');
    if (!n.is_read && !isSparkRow) {
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
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } else if (!n.is_read && isSparkRow) {
      setNotifications((prev) =>
        prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x))
      );
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

    if (n.link) router.push(n.link);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const unreadCount = notifications.filter(isNotificationUnread).length;

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-3xl font-black text-white truncate">
                Radar
              </h1>
              {unreadCount > 0 && (
                <span className="brand-gradient text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>
            <Bell className="w-6 h-6 text-gray-500 shrink-0" />
          </div>
          {notifications.length > 0 && unreadCount > 0 && (
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

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card rounded-2xl p-12 text-center"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <BellOff className="w-8 h-8 text-gray-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Radar vide
            </h2>
            <p className="text-gray-500 text-sm">
              Quand tu recevras des suivis, invitations, messages, étincelles d’Aura ou alertes,
              elles apparaîtront ici.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {notifications.map((n, i) => {
                const mapKey =
                  typeof n.type === 'string' && n.type in ICON_MAP ? (n.type as NotificationType) : 'system';
                const { icon: Icon, color, bg } = ICON_MAP[mapKey];
                const unread = isNotificationUnread(n);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => handleRowClick(n)}
                    className={`card rounded-xl p-4 flex items-start gap-4 w-full text-left transition-colors hover:bg-white/[0.04] relative ${
                      unread ? 'border-l-2 border-l-brand-500' : ''
                    }`}
                  >
                    {unread && (
                      <span
                        className="absolute top-4 right-4 w-2 h-2 rounded-full bg-blue-500 shrink-0"
                        aria-hidden
                      />
                    )}
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
                    <span className="text-xs text-gray-600 shrink-0 flex items-center gap-1 pt-0.5">
                      <Clock className="w-3 h-3" />
                      {shortTimeAgo(n.created_at)}
                    </span>
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
