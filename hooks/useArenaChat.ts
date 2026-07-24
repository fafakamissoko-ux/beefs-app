'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MutableRefObject } from 'react';
import type { UseArenaRealtimeResult } from '@/hooks/useArenaRealtime';
import type { ToastType } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';

type ToastFn = (message: string, type?: ToastType) => void;
type AddMessageFn = (msg: {
  id: string;
  user_name: string;
  content: string;
  initial: string;
  type?: 'text' | 'gift';
  giftSender?: string;
  giftRecipient?: string;
  giftTemplate?: string;
}) => void;
type DeleteMessageFn = (id: string) => void;
type ClearMessagesFn = () => void;
type ClearReactionsFn = () => void;
type SetGlobalHeatFn = React.Dispatch<React.SetStateAction<number>>;

interface UseArenaChatParams {
  roomId: string;
  userId: string | null;
  userName: string;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
  requireAuth: (title: string, subtitle: string) => boolean;
  addMessage: AddMessageFn;
  deleteMessage: DeleteMessageFn;
  clearMessages: ClearMessagesFn;
  clearReactions: ClearReactionsFn;
  setGlobalHeat: SetGlobalHeatFn;
  arenaOutboundRef: MutableRefObject<Partial<UseArenaRealtimeResult>>;
}

interface UseArenaChatReturn {
  chatInput: string;
  setChatInput: React.Dispatch<React.SetStateAction<string>>;
  contextMenuMsg: string | null;
  setContextMenuMsg: React.Dispatch<React.SetStateAction<string | null>>;
  seenMsgKeys: MutableRefObject<Set<string>>;
  messageSendChainRef: MutableRefObject<Promise<void>>;
  addRemoteMessage: (
    msgUserName: string,
    content: string,
    initial?: string,
    dbId?: string,
    type?: 'text' | 'gift',
    giftSender?: string,
    giftRecipient?: string,
    giftTemplate?: string,
  ) => void;
  handleSendMessage: () => void;
  handleDeleteMessage: (messageId: string) => Promise<void>;
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

export function useArenaChat({
  roomId,
  userId,
  userName,
  supabaseClient,
  toast,
  requireAuth,
  addMessage,
  deleteMessage,
  clearMessages,
  clearReactions,
  setGlobalHeat,
  arenaOutboundRef,
}: UseArenaChatParams): UseArenaChatReturn {
  const [chatInput, setChatInput] = useState('');
  const [contextMenuMsg, setContextMenuMsg] = useState<string | null>(null);
  const seenMsgKeys = useRef(new Set<string>());
  const messageSendChainRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!roomId) return;
    seenMsgKeys.current.clear();
    clearMessages();
    clearReactions();
  }, [roomId, clearMessages, clearReactions]);

  useEffect(() => {
    if (!contextMenuMsg) return;
    const close = () => setContextMenuMsg(null);
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [contextMenuMsg]);

  const addRemoteMessage = useCallback((
    msgUserName: string,
    content: string,
    initial?: string,
    dbId?: string,
    type?: 'text' | 'gift',
    giftSender?: string,
    giftRecipient?: string,
    giftTemplate?: string,
  ) => {
    const key = dbId ? `id:${dbId}` : `${msgUserName}::${content}`;
    if (seenMsgKeys.current.has(key)) return;
    seenMsgKeys.current.add(key);
    const ttlMs = dbId ? 60_000 : 5000;
    setTimeout(() => seenMsgKeys.current.delete(key), ttlMs);
    const msgId = dbId || `m_${Date.now()}_${Math.random()}`;
    addMessage({
      id: msgId,
      user_name: msgUserName,
      content,
      initial: initial || msgUserName?.[0]?.toUpperCase() || '?',
      type,
      giftSender,
      giftRecipient,
      giftTemplate,
    });
    setGlobalHeat((v) => Math.min(100, v + 4));
  }, [addMessage, setGlobalHeat]);

  const handleSendMessage = useCallback(() => {
    if (requireAuth('Rejoins la discussion', 'Crée un compte gratuit pour envoyer des messages dans le chat.')) return;
    if (!chatInput.trim()) return;

    const cleanContent = sanitizeMessage(chatInput);
    if (!cleanContent) return;

    const senderInitial = userName?.[0]?.toUpperCase() || '?';
    const pendingId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? `pending_${crypto.randomUUID()}`
        : `pending_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    addMessage({
      id: pendingId,
      user_name: userName,
      content: cleanContent,
      initial: senderInitial,
    });
    setChatInput('');
    setGlobalHeat((v) => Math.min(100, v + 5));

    const isRlsPolicyError = (err: { code?: string; message?: string } | null) => {
      const msg = (err?.message ?? '').toLowerCase();
      return (
        err?.code === '42501' ||
        msg.includes('row-level security') ||
        msg.includes('policy')
      );
    };

    const attemptInsert = async (attempt: number): Promise<void> => {
      const { data: inserted, error } = await supabaseClient
        .from('beef_messages')
        .insert({
          beef_id: roomId,
          user_id: userId,
          username: userName,
          display_name: userName,
          content: cleanContent,
          is_pinned: false,
        })
        .select('id')
        .single();

      if (!error && inserted?.id) {
        seenMsgKeys.current.add(`id:${inserted.id}`);
        deleteMessage(pendingId);
        addMessage({
          id: inserted.id,
          user_name: userName,
          content: cleanContent,
          initial: senderInitial,
        });
        arenaOutboundRef.current.broadcastMessage?.({
          user_name: userName,
          content: cleanContent,
          initial: senderInitial,
          id: inserted.id,
        });
        return;
      }

      if (error && isRlsPolicyError(error) && attempt < 6) {
        await new Promise((r) => setTimeout(r, 100 + attempt * 120));
        return attemptInsert(attempt + 1);
      }

      deleteMessage(pendingId);
      console.error('[Live] Message insert failed');
      if (error && isRlsPolicyError(error)) {
        toast(
          'Envoi temporairement refusé (limite ou droits). Réessaie dans un instant.',
          'error',
        );
      } else {
        toast('Impossible d\u2019envoyer le message', 'error');
      }
      setChatInput(cleanContent);
    };

    messageSendChainRef.current = messageSendChainRef.current
      .then(() => attemptInsert(0))
      .catch(() => console.error('[Live] Message send chain'));
  }, [chatInput, userName, userId, roomId, requireAuth, addMessage, deleteMessage, setGlobalHeat, supabaseClient, toast, arenaOutboundRef]);

  const handleDeleteMessage = useCallback(async (messageId: string) => {
    setContextMenuMsg(null);
    if (!isUuid(messageId)) return;
    const { error } = await supabaseClient.from('beef_messages').update({ is_deleted: true }).eq('id', messageId);
    if (error) {
      toast('Suppression impossible', 'error');
      return;
    }
    deleteMessage(messageId);
    arenaOutboundRef.current.broadcastDeleteMessage?.(messageId);
  }, [supabaseClient, toast, deleteMessage, arenaOutboundRef]);

  return {
    chatInput,
    setChatInput,
    contextMenuMsg,
    setContextMenuMsg,
    seenMsgKeys,
    messageSendChainRef,
    addRemoteMessage,
    handleSendMessage,
    handleDeleteMessage,
  };
}
