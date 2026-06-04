'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';

interface AuraGiverRow {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

export type InlineAuraGiversTargetType =
  | 'beef'
  | 'teaser'
  | 'profile'
  | 'avatar'
  | 'banner';

interface InlineAuraGiversProps {
  targetId: string;
  type: InlineAuraGiversTargetType;
  ownerId: string;
}

export function InlineAuraGivers({ targetId, type, ownerId }: InlineAuraGiversProps) {
  const [givers, setGivers] = useState<AuraGiverRow[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleRefresh = (e: CustomEvent<{ targetId: string }>) => {
      if (e.detail.targetId === targetId) {
        setRefreshKey((prev) => prev + 1);
      }
    };

    window.addEventListener('aura-refresh', handleRefresh as EventListener);
    return () => window.removeEventListener('aura-refresh', handleRefresh as EventListener);
  }, [targetId]);

  useEffect(() => {
    if (!targetId || !ownerId) {
      setGivers([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const { data } = await supabase.rpc('get_universal_aura_givers', {
        p_target_id: targetId,
        p_type: type,
        p_owner_id: ownerId,
      });

      if (cancelled) return;
      const rows = (data as AuraGiverRow[] | null) ?? [];
      setGivers(rows.slice(0, 3));
    })();

    return () => {
      cancelled = true;
    };
  }, [targetId, type, ownerId, refreshKey]);

  if (givers.length === 0) return null;

  return (
    <span className="flex -space-x-1.5 shrink-0" aria-hidden>
      {givers.map((giver) =>
        giver.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- avatar URL Supabase externe
          <img
            key={giver.giver_id}
            src={giver.avatar_url}
            alt=""
            className="h-5 w-5 rounded-full border border-slate-900 object-cover"
          />
        ) : (
          <span
            key={giver.giver_id}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-900 bg-gradient-to-br from-cyan-500/30 to-slate-800 text-[8px] font-bold uppercase text-cyan-300"
          >
            {giver.display_name?.[0] || giver.username?.[0] || '?'}
          </span>
        ),
      )}
    </span>
  );
}
