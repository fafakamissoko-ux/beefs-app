'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bell,
  Swords,
  UserPlus,
  Radio,
  Clock,
  CheckCheck,
  BellOff,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface Notification {
  id: string;
  type: 'invitation' | 'beef_live' | 'beef_ended' | 'new_follower';
  title: string;
  message: string;
  timestamp: string;
  link?: string;
  read: boolean;
  meta?: Record<string, string>;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'à l\'instant';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `il y a ${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `il y a ${days}j`;
  return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const ICON_MAP: Record<Notification['type'], { icon: typeof Bell; color: string; bg: string }> = {
  invitation: { icon: Swords, color: 'text-orange-400', bg: 'bg-orange-500/15' },
  beef_live: { icon: Radio, color: 'text-red-400', bg: 'bg-red-500/15' },
  beef_ended: { icon: CheckCheck, color: 'text-green-400', bg: 'bg-green-500/15' },
  new_follower: { icon: UserPlus, color: 'text-cyan-400', bg: 'bg-cyan-500/15' },
};

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
  const { user, loading: authLoading } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login?redirect=/notifications');
    }
  }, [user, authLoading, router]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    try {
      const results: Notification[] = [];

      const [invitationsRes, beefsRes, followersRes] = await Promise.all([
        supabase
          .from('beef_invitations')
          .select('id, created_at, status, personal_message, beef_id, inviter_id, beefs(title), users!beef_invitations_inviter_id_fkey(username)')
          .eq('invitee_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('beef_participants')
          .select('id, beef_id, beefs(id, title, status, started_at, ended_at)')
          .eq('user_id', user.id)
          .eq('invite_status', 'accepted')
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('followers')
          .select('id, created_at, follower_id, users!followers_follower_id_fkey(username, avatar_url)')
          .eq('following_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ]);

      if (invitationsRes.data) {
        for (const inv of invitationsRes.data) {
          const beef = inv.beefs as any;
          const inviter = inv.users as any;
          results.push({
            id: `inv-${inv.id}`,
            type: 'invitation',
            title: 'Invitation à un beef',
            message: `@${inviter?.username ?? '???'} t'a invité au beef "${beef?.title ?? 'Sans titre'}"`,
            timestamp: inv.created_at,
            link: `/beef/${inv.beef_id}`,
            read: inv.status !== 'sent',
            meta: { status: inv.status },
          });
        }
      }

      if (beefsRes.data) {
        for (const bp of beefsRes.data) {
          const beef = bp.beefs as any;
          if (!beef) continue;
          if (beef.status === 'live' && beef.started_at) {
            results.push({
              id: `live-${bp.id}`,
              type: 'beef_live',
              title: 'Beef en direct !',
              message: `"${beef.title}" est maintenant en live`,
              timestamp: beef.started_at,
              link: `/beef/${beef.id}/live`,
              read: true,
            });
          }
          if (beef.status === 'ended' && beef.ended_at) {
            results.push({
              id: `ended-${bp.id}`,
              type: 'beef_ended',
              title: 'Beef terminé',
              message: `"${beef.title}" est terminé`,
              timestamp: beef.ended_at,
              link: `/beef/${beef.id}`,
              read: true,
            });
          }
        }
      }

      if (followersRes.data) {
        for (const f of followersRes.data) {
          const follower = f.users as any;
          results.push({
            id: `fol-${f.id}`,
            type: 'new_follower',
            title: 'Nouveau follower',
            message: `@${follower?.username ?? '???'} a commencé à te suivre`,
            timestamp: f.created_at,
            link: `/profile/${follower?.username}`,
            read: true,
          });
        }
      }

      results.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setNotifications(results);
    } catch {
      // silently fail — empty state will show
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) fetchNotifications();
  }, [user, fetchNotifications]);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-black text-white">Notifications</h1>
            {unreadCount > 0 && (
              <span className="brand-gradient text-white text-xs font-bold px-2.5 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          <Bell className="w-6 h-6 text-gray-500" />
        </div>

        {/* Content */}
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
            <h2 className="text-xl font-bold text-white mb-2">Aucune notification</h2>
            <p className="text-gray-500 text-sm">
              Tu recevras des notifications quand quelqu&apos;un t&apos;invite à un beef, te suit, ou quand un beef commence.
            </p>
          </motion.div>
        ) : (
          <div className="space-y-2">
            <AnimatePresence initial={false}>
              {notifications.map((n, i) => {
                const { icon: Icon, color, bg } = ICON_MAP[n.type];
                return (
                  <motion.button
                    key={n.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    onClick={() => n.link && router.push(n.link)}
                    className={`card rounded-xl p-4 flex items-start gap-4 w-full text-left transition-colors hover:bg-white/[0.04] ${
                      !n.read ? 'border-l-2 border-l-brand-500' : ''
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-white">{n.title}</p>
                      <p className="text-sm text-gray-400 truncate">{n.message}</p>
                    </div>
                    <span className="text-xs text-gray-600 shrink-0 flex items-center gap-1 pt-0.5">
                      <Clock className="w-3 h-3" />
                      {timeAgo(n.timestamp)}
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
