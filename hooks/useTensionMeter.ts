'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface TensionMeterOptions {
  throttleMs?: number;
  decayIntervalMs?: number;
  decayPercent?: number;
}

export function useTensionMeter(
  roomId: string,
  options: TensionMeterOptions = {}
) {
  const {
    throttleMs = 2000,
    decayIntervalMs = 5000,
    decayPercent = 2,
  } = options;

  const [localTension, setLocalTension] = useState(0);
  const [isChaosMode, setIsChaosMode] = useState(false);
  const clickBuffer = useRef(0);
  const chaosTimeout = useRef<NodeJS.Timeout | null>(null);
  const roomIdRef = useRef(roomId);
  roomIdRef.current = roomId;

  // Sync buffered clicks to server (throttled)
  useEffect(() => {
    const interval = setInterval(async () => {
      if (clickBuffer.current === 0) return;
      const clicks = clickBuffer.current;
      clickBuffer.current = 0;

      try {
        await supabase.rpc('increment_tension', {
          room_id: roomIdRef.current,
          increment_value: clicks,
        });
      } catch {
        // Fallback direct update
        await supabase
          .from('beefs')
          .update({ tension_level: Math.min(100, localTension + clicks) })
          .eq('id', roomIdRef.current);
      }
    }, throttleMs);

    return () => clearInterval(interval);
  }, [throttleMs]);

  // Decay — much slower to avoid re-render spam
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('beefs')
          .select('tension_level')
          .eq('id', roomIdRef.current)
          .single();

        if (data && data.tension_level > 0) {
          await supabase
            .from('beefs')
            .update({ tension_level: Math.max(0, data.tension_level - decayPercent) })
            .eq('id', roomIdRef.current);
        }
      } catch {}
    }, decayIntervalMs);

    return () => clearInterval(interval);
  }, [decayIntervalMs, decayPercent]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel(`tension_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beefs', filter: `id=eq.${roomId}` },
        (payload: any) => {
          const newTension = payload.new.tension_level ?? 0;
          setLocalTension(newTension);

          if (newTension >= 100 && !isChaosMode) {
            setIsChaosMode(true);
            if (chaosTimeout.current) clearTimeout(chaosTimeout.current);
            chaosTimeout.current = setTimeout(async () => {
              setIsChaosMode(false);
              await supabase.from('beefs').update({ tension_level: 50 }).eq('id', roomId);
            }, 5000);
          }
        }
      )
      .subscribe();

    // Load initial
    supabase.from('beefs').select('tension_level').eq('id', roomId).single()
      .then(({ data }) => {
        if (data) setLocalTension(data.tension_level ?? 0);
      });

    return () => {
      channel.unsubscribe();
      if (chaosTimeout.current) clearTimeout(chaosTimeout.current);
    };
  }, [roomId]);

  const tap = useCallback(() => {
    clickBuffer.current += 1;
    setLocalTension(prev => Math.min(100, prev + 1));
  }, []);

  const addTension = useCallback((amount: number = 1) => {
    clickBuffer.current += amount;
    setLocalTension(prev => Math.min(100, prev + amount));
  }, []);

  return { localTension, globalTension: localTension, isChaosMode, tap, addTension };
}
