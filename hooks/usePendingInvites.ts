'use client';

import { useState, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeefManageAction, BeefManageResult } from '@/lib/beef-manage-client';
import type { ToastType } from '@/components/Toast';

type ToastFn = (message: string, type?: ToastType) => void;
type RunBeefManageFn = (body: BeefManageAction) => Promise<BeefManageResult>;

interface PendingInviteEntry {
  userId: string;
  label: string;
}

interface UsePendingInvitesParams {
  isHost: boolean;
  roomId: string;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
  runBeefManage: RunBeefManageFn;
}

interface UsePendingInvitesReturn {
  handsRaised: PendingInviteEntry[];
  refInvites: PendingInviteEntry[];
  fetchPendingInvites: () => Promise<void>;
  handleAcceptPendingInvite: (inviteUserId: string) => Promise<void>;
  handleRejectPendingInvite: (inviteUserId: string) => Promise<void>;
}

export function usePendingInvites({
  isHost,
  roomId,
  supabaseClient,
  toast,
  runBeefManage,
}: UsePendingInvitesParams): UsePendingInvitesReturn {
  const [handsRaised, setHandsRaised] = useState<PendingInviteEntry[]>([]);
  const [refInvites, setRefInvites] = useState<PendingInviteEntry[]>([]);

  const fetchPendingInvites = useCallback(async () => {
    if (!isHost) return;

    const { data: participants, error: pError } = await supabaseClient
      .from('beef_participants')
      .select('user_id')
      .eq('beef_id', roomId)
      .eq('invite_status', 'pending');

    if (pError || !participants) return;

    const { data: invitations } = await supabaseClient
      .from('beef_invitations')
      .select('invitee_id')
      .eq('beef_id', roomId)
      .eq('status', 'sent');

    const refInvitedIds = new Set((invitations ?? []).map((i) => i.invitee_id));

    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    const ids = participants.map((r) => r.user_id);
    const pubMap = await fetchUserPublicByIds(supabaseClient, ids, 'id, username, display_name');

    const hands: PendingInviteEntry[] = [];
    const invites: PendingInviteEntry[] = [];

    participants.forEach((r) => {
      const u = pubMap.get(r.user_id);
      const label =
        (u?.display_name && u.display_name.trim()) ||
        (u?.username && u.username.trim()) ||
        'Invité';
      if (refInvitedIds.has(r.user_id)) {
        invites.push({ userId: r.user_id, label });
      } else {
        hands.push({ userId: r.user_id, label });
      }
    });

    setHandsRaised(hands);
    setRefInvites(invites);
  }, [isHost, roomId, supabaseClient]);

  const handleAcceptPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'ACCEPT_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
      });
      if (!r.ok) return;
      toast('Challenger accepté !', 'success');
      void fetchPendingInvites();
    },
    [roomId, toast, fetchPendingInvites, runBeefManage],
  );

  const handleRejectPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'REMOVE_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
        removeKind: 'decline',
      });
      if (!r.ok) return;
      void fetchPendingInvites();
    },
    [roomId, fetchPendingInvites, runBeefManage],
  );

  return {
    handsRaised,
    refInvites,
    fetchPendingInvites,
    handleAcceptPendingInvite,
    handleRejectPendingInvite,
  };
}
