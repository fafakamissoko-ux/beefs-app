'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useWalletStore } from '@/lib/stores/walletStore';
import { useArenaVolatileStore, type ArenaBigGiftPayload } from '@/lib/stores/arenaVolatileStore';
import { userIdsEqual } from '@/lib/user-id-equal';
import type { ToastType, ToastOptions } from '@/components/Toast';
import type { UseArenaRealtimeResult } from '@/hooks/useArenaRealtime';
import type { GiftItem } from '@/lib/constants/gifts';

type ToastFn = (message: string, type?: ToastType, options?: ToastOptions) => void;

interface GiftRecipient {
  id: string;
  label: string;
}

interface ChallengerSlotInfo {
  arenaUserId?: string | null;
  userName?: string | null;
}

interface UseGiftSendParams {
  roomId: string;
  userId: string;
  userName: string;
  hostId: string;
  hostName: string;
  mediatorName: string;
  challengerRemoteSlots: (ChallengerSlotInfo | null)[];
  toast: ToastFn;
  arenaOutboundRef: React.MutableRefObject<Partial<UseArenaRealtimeResult>>;
  addRemoteMessage: (name: string, content: string, initial: string, dbId?: string, type?: 'text' | 'gift', giftSender?: string, giftRecipient?: string, giftTemplate?: string) => void;
  setAuraMed: React.Dispatch<React.SetStateAction<number>>;
  setGiftPrestigeFlash: React.Dispatch<React.SetStateAction<number>>;
  setShowGiftPicker: React.Dispatch<React.SetStateAction<boolean>>;
  goBuyPoints: () => void;
}

export interface UseGiftSendReturn {
  giftTarget: string;
  setGiftTarget: React.Dispatch<React.SetStateAction<string>>;
  giftRecipients: GiftRecipient[];
  sendGift: (gift: GiftItem) => Promise<void>;
}

export function useGiftSend({
  roomId, userId, userName, hostId, hostName, mediatorName,
  challengerRemoteSlots, toast, arenaOutboundRef,
  addRemoteMessage, setAuraMed, setGiftPrestigeFlash, setShowGiftPicker, goBuyPoints,
}: UseGiftSendParams): UseGiftSendReturn {
  const walletBalance = useWalletStore((s) => s.balance);
  const optimisticDebit = useWalletStore((s) => s.optimisticDebit);

  const [giftTarget, setGiftTarget] = useState<string>('');

  const giftRecipients = useMemo(() => {
    const seen = new Set<string>();
    const out: GiftRecipient[] = [];
    const push = (id: string | undefined | null, label: string) => {
      if (!id || seen.has(id) || userIdsEqual(id, userId)) return;
      seen.add(id);
      out.push({ id, label: label.trim() || 'Participant' });
    };
    push(hostId, mediatorName || hostName || 'Ref');
    challengerRemoteSlots.forEach((p, idx) => {
      if (!p?.arenaUserId) return;
      const name = p.userName?.trim();
      const label = name && !name.startsWith('En attente') ? name : `Combattant ${idx + 1}`;
      push(p.arenaUserId, label);
    });
    return out;
  }, [hostId, hostName, mediatorName, challengerRemoteSlots, userId]);

  useEffect(() => {
    if (giftRecipients.length === 0) return;
    if (!giftTarget || !giftRecipients.some((r) => r.id === giftTarget)) {
      setGiftTarget(giftRecipients[0].id);
    }
  }, [giftRecipients, giftTarget]);

  const sendGift = useCallback(async (gift: GiftItem) => {
    if (!optimisticDebit(gift.cost)) {
      toast(`Lingots insuffisants — il te manque ${gift.cost - walletBalance} Lingots`, 'error', {
        id: 'insufficient-funds',
        action: { label: 'Recharger', onClick: () => goBuyPoints() },
      });
      return;
    }

    try {
      const targetUserId = giftTarget || giftRecipients[0]?.id || '';
      if (!targetUserId) {
        toast('Participant non connecté', 'error');
        useWalletStore.getState().sync();
        return;
      }
      const targetName = giftRecipients.find((r) => r.id === targetUserId)?.label ?? hostName;

      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/gifts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({
          beef_id: roomId,
          recipient_id: targetUserId,
          gift_type_id: gift.id,
          points_amount: gift.cost,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      const medBoost = Math.min(25, 4 + Math.floor(gift.cost / 40));
      setAuraMed((v) => Math.min(300, v + medBoost));
      if (gift.cost >= 50) setGiftPrestigeFlash((k) => k + 1);

      const giftKey = data.giftId != null ? String(data.giftId) : `gift_${Date.now()}`;
      const msgContent = gift.messageTemplate
        .replace('{sender}', userName)
        .replace('{recipient}', targetName);
      const initial = userName?.[0]?.toUpperCase() || '?';

      addRemoteMessage(userName, msgContent, initial, giftKey, 'gift', userName, targetName, gift.messageTemplate);
      arenaOutboundRef.current.broadcastMessage?.({
        user_name: userName,
        content: msgContent,
        initial,
        id: giftKey,
        type: 'gift',
        giftSender: userName,
        giftRecipient: targetName,
        giftTemplate: gift.messageTemplate,
      });

      const bigPayload: ArenaBigGiftPayload = {
        cost: gift.cost,
        label: gift.label,
        emoji: gift.emoji,
        giftTypeId: gift.id,
        senderName: userName,
        recipientName: targetName,
        messageTemplate: gift.messageTemplate,
      };
      useArenaVolatileStore.getState().enqueueBigGift(bigPayload);
      arenaOutboundRef.current.broadcastArenaBigGift?.(bigPayload);
    } catch (err: unknown) {
      useWalletStore.getState().sync();
      const m = err instanceof Error ? err.message : "Erreur lors de l'envoi";
      toast(m, 'error');
    }
    setShowGiftPicker(false);
  }, [roomId, userName, hostName, giftTarget, giftRecipients, walletBalance, optimisticDebit, toast, goBuyPoints, arenaOutboundRef, addRemoteMessage, setAuraMed, setGiftPrestigeFlash, setShowGiftPicker]);

  return { giftTarget, setGiftTarget, giftRecipients, sendGift };
}
