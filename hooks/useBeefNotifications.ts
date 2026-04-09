'use client';

import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface BeefNotification {
  beefId: string;
  title: string;
  type: 'starting_soon' | 'live_now' | 'ended';
}

interface UseBeefNotificationsOptions {
  userId: string;
  onNotification: (n: BeefNotification) => void;
}

export function useBeefNotifications({ userId, onNotification }: UseBeefNotificationsOptions) {
  const scheduledTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const notifiedBeefs = useRef<Set<string>>(new Set());

  // Schedule a "starting soon" notification for a beef
  const scheduleNotification = useCallback((beefId: string, title: string, scheduledAt: string) => {
    const target = new Date(scheduledAt).getTime();
    const now = Date.now();
    const fiveMinBefore = target - 5 * 60 * 1000;
    const oneMinBefore = target - 60 * 1000;

    if (fiveMinBefore > now) {
      const t = setTimeout(() => {
        onNotification({ beefId, title, type: 'starting_soon' });
        showBrowserNotification(`🔥 Beef bientôt en direct!`, `"${title}" commence dans 5 minutes.`);
      }, fiveMinBefore - now);
      scheduledTimers.current.set(`${beefId}_5min`, t);
    }

    if (oneMinBefore > now) {
      const t = setTimeout(() => {
        onNotification({ beefId, title, type: 'starting_soon' });
        showBrowserNotification(`⚡ Dernière minute!`, `"${title}" commence dans 1 minute!`);
      }, oneMinBefore - now);
      scheduledTimers.current.set(`${beefId}_1min`, t);
    }
  }, [onNotification]);

  // Listen for beef status changes to 'live'
  useEffect(() => {
    if (!userId) return;

    // Subscribe to status changes on beefs where user is mediator or participant
    const channel = supabase
      .channel(`beef_notifications_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'beefs',
        },
        (payload) => {
          const beef = payload.new as Record<string, unknown>;
          const old = (payload as { old?: Record<string, unknown> }).old;
          const newStatus = beef.status as string | undefined;
          const oldStatus = old?.status as string | undefined;

          // Sans ancienne ligne (replica identity), on ne peut pas distinguer un vrai changement
          // de statut d’un simple update (ex. feed_position) → ignorer pour éviter les faux positifs.
          if (!old) return;

          // Même statut qu’avant : autre champ modifié (position, titre, etc.) → pas de toast live/ended
          if (oldStatus === newStatus) return;

          const dedupeKey = `${beef.id}_${oldStatus}_to_${newStatus}`;
          if (notifiedBeefs.current.has(dedupeKey)) return;
          notifiedBeefs.current.add(dedupeKey);

          if (newStatus === 'live' && oldStatus !== 'live') {
            const mediatorId = beef.mediator_id as string | undefined;
            // Ne pas notifier celui qui passe son propre beef en live (toast + navigateur)
            if (mediatorId && mediatorId === userId) {
              return;
            }
            onNotification({ beefId: beef.id as string, title: beef.title as string, type: 'live_now' });
            showBrowserNotification(`🔴 LIVE maintenant!`, `"${beef.title}" est en direct. Rejoins maintenant!`);
          }
          if (newStatus === 'ended' && oldStatus !== 'ended') {
            onNotification({ beefId: beef.id as string, title: beef.title as string, type: 'ended' });
            showBrowserNotification(`🏁 Beef terminé`, `"${beef.title}" — ouvre l’app pour voir le résumé.`);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
      scheduledTimers.current.forEach(t => clearTimeout(t));
    };
  }, [userId, onNotification]);

  // Load upcoming scheduled beefs and set timers
  useEffect(() => {
    if (!userId) return;

    const loadScheduledBeefs = async () => {
      const { data } = await supabase
        .from('beefs')
        .select('id, title, scheduled_at')
        .eq('status', 'pending')
        .not('scheduled_at', 'is', null)
        .gt('scheduled_at', new Date().toISOString())
        .order('scheduled_at', { ascending: true })
        .limit(20);

      data?.forEach(beef => {
        if (beef.scheduled_at) {
          scheduleNotification(beef.id, beef.title, beef.scheduled_at);
        }
      });
    };

    loadScheduledBeefs();
  }, [userId, scheduleNotification]);

  return { scheduleNotification };
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined') return;
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'beef-notification',
    });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png' });
      }
    });
  }
}
