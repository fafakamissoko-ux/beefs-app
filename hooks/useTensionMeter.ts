'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';

interface TensionMeterOptions {
  throttleMs?: number;
  decayIntervalMs?: number;
  decayPercent?: number;
  broadcastIntervalMs?: number;
}

export function useTensionMeter(
  roomId: string,
  options: TensionMeterOptions = {}
) {
  const {
    throttleMs = 300,
    decayIntervalMs = 1000,
    decayPercent = 2,
    broadcastIntervalMs = 500,
  } = options;

  // Local state for optimistic UI
  const [localTension, setLocalTension] = useState(0);
  const [globalTension, setGlobalTension] = useState(0);
  const [isChaosMode, setIsChaosMode] = useState(false);

  // Click buffer for aggregation
  const clickBuffer = useRef(0);
  const lastSync = useRef(Date.now());
  const chaosTimeout = useRef<NodeJS.Timeout | null>(null);

  // Throttled sync to server
  const syncToServer = useCallback(async () => {
    if (clickBuffer.current === 0) return;

    const clicks = clickBuffer.current;
    clickBuffer.current = 0;

    try {
      // Atomic increment to avoid race conditions
      const { data, error } = await supabase.rpc('increment_tension', {
        room_id: roomId,
        increment_value: clicks,
      });

      if (error) {
        console.error('Error syncing tension:', error);
        // Fallback: direct update if RPC doesn't exist
        const { error: updateError } = await supabase
          .from('beefs')
          .update({ 
            tension_level: Math.min(100, globalTension + clicks) 
          })
          .eq('id', roomId);
        
        if (updateError) console.error('Fallback update error:', updateError);
      }
    } catch (err) {
      console.error('Sync error:', err);
    }

    lastSync.current = Date.now();
  }, [roomId, globalTension]);

  // Throttled sync interval
  useEffect(() => {
    const interval = setInterval(() => {
      syncToServer();
    }, throttleMs);

    return () => clearInterval(interval);
  }, [throttleMs, syncToServer]);

  // Natural decay mechanism
  useEffect(() => {
    const decayInterval = setInterval(async () => {
      try {
        // Decay tension on server
        const { data: room } = await supabase
          .from('beefs')
          .select('tension_level')
          .eq('id', roomId)
          .single();

        if (room && room.tension_level > 0) {
          const newTension = Math.max(0, room.tension_level - decayPercent);
          
          await supabase
            .from('beefs')
            .update({ tension_level: newTension })
            .eq('id', roomId);
        }
      } catch (err) {
        console.error('Decay error:', err);
      }
    }, decayIntervalMs);

    return () => clearInterval(decayInterval);
  }, [roomId, decayIntervalMs, decayPercent]);

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel(`room_${roomId}_tension`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'beefs',
          filter: `id=eq.${roomId}`,
        },
        (payload: any) => {
          const newTension = payload.new.tension_level;
          setGlobalTension(newTension);
          setLocalTension(newTension);

          // Trigger chaos mode
          if (newTension >= 100 && !isChaosMode) {
            setIsChaosMode(true);
            
            // Play chaos sound (optional)
            if (typeof window !== 'undefined') {
              // const audio = new Audio('/sounds/chaos.mp3');
              // audio.play().catch(console.error);
            }

            // Reset after 5 seconds
            if (chaosTimeout.current) {
              clearTimeout(chaosTimeout.current);
            }
            
            chaosTimeout.current = setTimeout(async () => {
              setIsChaosMode(false);
              
              // Reset tension to 50%
              await supabase
                .from('beefs')
                .update({ tension_level: 50 })
                .eq('id', roomId);
            }, 5000);
          }
        }
      )
      .subscribe();

    // Load initial tension
    supabase
      .from('beefs')
      .select('tension_level')
      .eq('id', roomId)
      .single()
      .then(({ data }) => {
        if (data) {
          setGlobalTension(data.tension_level);
          setLocalTension(data.tension_level);
        }
      });

    return () => {
      channel.unsubscribe();
      if (chaosTimeout.current) {
        clearTimeout(chaosTimeout.current);
      }
    };
  }, [roomId, isChaosMode]);

  // Click handler - optimistic update
  const addTension = useCallback((amount: number = 1) => {
    clickBuffer.current += amount;
    setLocalTension((prev) => Math.min(100, prev + amount));
  }, []);

  // Manual tap handler
  const tap = useCallback(() => {
    addTension(1);
  }, [addTension]);

  return {
    localTension,
    globalTension,
    isChaosMode,
    tap,
    addTension,
  };
}
