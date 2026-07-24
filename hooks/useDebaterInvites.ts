'use client';

import { useState, useMemo, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BeefManageAction, BeefManageResult } from '@/lib/beef-manage-client';
import type { ToastType } from '@/components/Toast';

type ToastFn = (message: string, type?: ToastType) => void;
type RunBeefManageFn = (body: BeefManageAction) => Promise<BeefManageResult>;

export interface Debater {
  id: string;
  name: string;
  isMuted: boolean;
  speakingTime: number;
}

interface UseDebaterInvitesParams {
  roomId: string;
  userId: string | null;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
  runBeefManage: RunBeefManageFn;
  fetchPendingInvites: () => Promise<void>;
}

interface UseDebaterInvitesReturn {
  debaters: Debater[];
  setDebaters: React.Dispatch<React.SetStateAction<Debater[]>>;
  inviteInput: string;
  setInviteInput: React.Dispatch<React.SetStateAction<string>>;
  inviteExcludeParticipantIds: string[];
  removeDebater: (debaterId: string) => void;
  inviteDebater: () => Promise<void>;
  handleInviteFromModal: (invitedUserId: string) => Promise<void>;
}

export function useDebaterInvites({
  roomId,
  userId,
  supabaseClient,
  toast,
  runBeefManage,
  fetchPendingInvites,
}: UseDebaterInvitesParams): UseDebaterInvitesReturn {
  const [debaters, setDebaters] = useState<Debater[]>([]);
  const [inviteInput, setInviteInput] = useState('');

  const inviteExcludeParticipantIds = useMemo(
    () => Array.from(new Set([...debaters.map((d) => d.id), userId].filter(Boolean))) as string[],
    [debaters, userId],
  );

  const removeDebater = useCallback((debaterId: string) => {
    setDebaters(prev => prev.filter(d => d.id !== debaterId));
  }, []);

  const inviteDebater = useCallback(async () => {
    if (!inviteInput.trim()) return;
    const username = inviteInput.startsWith('@') ? inviteInput.substring(1) : inviteInput;

    if (debaters.some(d => d.name === username)) {
      toast('Ce débatteur est déjà dans le débat', 'info');
      return;
    }

    const { data: foundUser } = await supabaseClient
      .from('user_public_profile')
      .select('id, username, display_name')
      .or(`username.eq.${username},display_name.eq.${username}`)
      .limit(1)
      .maybeSingle();

    if (!foundUser) {
      toast('Utilisateur introuvable', 'error');
      return;
    }

    const inv = await runBeefManage({
      action: 'INVITE_PARTICIPANT',
      beefId: roomId,
      participantId: foundUser.id,
    });
    if (!inv.ok) return;

    setDebaters(prev => [...prev, {
      id: foundUser.id,
      name: foundUser.display_name || foundUser.username || username,
      isMuted: true,
      speakingTime: 0,
    }]);
    setInviteInput('');
    toast(`Invitation envoyée à ${foundUser.display_name || foundUser.username}`, 'success');
    void fetchPendingInvites();
  }, [inviteInput, debaters, supabaseClient, roomId, runBeefManage, toast, fetchPendingInvites]);

  const handleInviteFromModal = useCallback(async (invitedUserId: string) => {
    const inv = await runBeefManage({
      action: 'INVITE_PARTICIPANT',
      beefId: roomId,
      participantId: invitedUserId,
    });
    if (!inv.ok) return;

    const { data: invitedUser } = await supabaseClient
      .from('user_public_profile')
      .select('id, username, display_name')
      .eq('id', invitedUserId)
      .single();

    if (invitedUser) {
      setDebaters(prev => [...prev, {
        id: invitedUser.id,
        name: invitedUser.display_name || invitedUser.username || 'Participant',
        isMuted: true,
        speakingTime: 0,
      }]);
    }
    toast('Invitation envoyée !', 'success');
    void fetchPendingInvites();
  }, [roomId, supabaseClient, runBeefManage, toast, fetchPendingInvites]);

  return {
    debaters,
    setDebaters,
    inviteInput,
    setInviteInput,
    inviteExcludeParticipantIds,
    removeDebater,
    inviteDebater,
    handleInviteFromModal,
  };
}
