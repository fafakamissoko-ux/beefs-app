'use client';

import { useState, useEffect } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

interface UseUnreadDMsReturn {
  unreadDMsCount: number;
}

export function useUnreadDMs(supabaseClient: SupabaseClient, userId: string | null): UseUnreadDMsReturn {
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);

  useEffect(() => {
    if (!userId) return;

    const fetchUnread = async () => {
      const { count } = await supabaseClient
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'message')
        .or('is_read.is.null,is_read.eq.false');
      if (count !== null) setUnreadDMsCount(count);
    };
    void fetchUnread();

    const channel = supabaseClient
      .channel(`arena_dms_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && (payload.new as Record<string, unknown>).type === 'message') {
            setUnreadDMsCount(c => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (
            payload.new &&
            (payload.new as Record<string, unknown>).type === 'message' &&
            (payload.new as Record<string, unknown>).is_read
          ) {
            setUnreadDMsCount(c => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();

    return () => {
      void supabaseClient.removeChannel(channel);
    };
  }, [userId, supabaseClient]);

  return { unreadDMsCount };
}
