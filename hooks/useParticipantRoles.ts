'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToastType } from '@/components/Toast';
import {
  buildParticipantAliasSet,
  type BeefParticipantRowMeta,
} from '@/lib/participant-identity';

type ToastFn = (message: string, type?: ToastType) => void;

interface UseParticipantRolesParams {
  roomId: string;
  userId: string | null;
  hostId: string;
  isViewer: boolean;
  isHost: boolean;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
}

interface UseParticipantRolesReturn {
  participantRoles: Record<string, BeefParticipantRowMeta>;
  participantUidOrder: string[];
  rolesLoaded: boolean;
  expectedUids: string[];
  loadParticipants: () => Promise<void>;
}

export function useParticipantRoles({
  roomId,
  userId,
  hostId,
  isViewer,
  isHost,
  supabaseClient,
  toast,
}: UseParticipantRolesParams): UseParticipantRolesReturn {
  const [participantRoles, setParticipantRoles] = useState<Record<string, BeefParticipantRowMeta>>({});
  const [participantUidOrder, setParticipantUidOrder] = useState<string[]>([]);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    if (Object.keys(participantRoles).length > 0) setRolesLoaded(true);
  }, [participantRoles]);

  const loadParticipants = useCallback(async () => {
    const { data } = await supabaseClient
      .from('beef_participants')
      .select('user_id, role, is_main, invite_status, created_at')
      .eq('beef_id', roomId);

    if (!isViewer && !isHost && data) {
      const amIStillHere = data.some((p: { user_id: string }) => p.user_id === userId);
      if (!amIStillHere) {
        toast('Vous avez été renvoyé dans les gradins par la régie.', 'error');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
    }

    if (!data?.length) {
      setParticipantRoles({});
      setParticipantUidOrder([]);
      return;
    }

    type ParticipantRow = {
      user_id: string;
      role: string;
      is_main: boolean | null;
      invite_status?: string | null;
      created_at?: string | null;
    };

    const validData = (data as ParticipantRow[]).filter(
      (p) =>
        p.role !== 'witness' &&
        p.invite_status === 'accepted',
    );

    const sorted = [...validData].sort((a, b) => {
      const statusA = a.invite_status === 'accepted' ? 0 : 1;
      const statusB = b.invite_status === 'accepted' ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      const mainA = a.is_main ? 0 : 1;
      const mainB = b.is_main ? 0 : 1;
      if (mainA !== mainB) return mainA - mainB;
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    });

    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    const ids = sorted.map((p) => p.user_id).filter(Boolean);
    const pubMap = await fetchUserPublicByIds(supabaseClient, ids, 'id, username, display_name, avatar_url');
    const roles: Record<string, BeefParticipantRowMeta> = {};
    sorted.forEach((p) => {
      const u = pubMap.get(p.user_id);
      const dn = (u?.display_name ?? '').trim();
      const un = (u?.username ?? '').trim();
      const name = dn || un || 'Participant';
      roles[p.user_id] = {
        role: p.role,
        name,
        matchAliases: buildParticipantAliasSet(u?.display_name, u?.username, name),
        avatarUrl: u?.avatar_url?.trim() || null,
        isMain: p.is_main ?? false,
      };
    });
    setParticipantRoles(roles);
    setParticipantUidOrder(sorted.map((p) => p.user_id));
  }, [roomId, userId, isViewer, isHost, toast, supabaseClient]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  const expectedUids = useMemo(() => {
    const mid = hostId?.trim().toLowerCase() ?? '';
    const ordered = participantUidOrder.filter((uid) => uid !== mid && participantRoles[uid]);
    if (ordered.length > 0) return ordered;
    return Object.keys(participantRoles).filter((uid) => uid !== mid);
  }, [participantRoles, participantUidOrder, hostId]);

  return {
    participantRoles,
    participantUidOrder,
    rolesLoaded,
    expectedUids,
    loadParticipants,
  };
}
