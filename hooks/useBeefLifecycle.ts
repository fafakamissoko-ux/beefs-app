'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import type { BeefManageAction, BeefManageResult } from '@/lib/beef-manage-client';
import { useArenaVerdictStore } from '@/lib/stores/arenaVerdictStore';
import { playRematchThunderSfx } from '@/lib/playVerdictSfx';
import { DEFAULT_BEEF_DURATION } from '@/hooks/useBeefTimer';
import type { UseArenaRealtimeResult } from '@/hooks/useArenaRealtime';
import type { AuraBatchPayload } from '@/lib/arena-slots';

export interface EndSummary {
  duration: string;
  viewers: number;
  resonanceA: number;
  resonanceB: number;
  resonanceC: number;
  resonanceD: number;
  resonanceE: number;
  resonanceF: number;
  resonanceM: number;
  messages: number;
  endReason: string;
  [key: string]: unknown;
}

interface StatsRef {
  beefTimeRemaining: number;
  liveViewerCount: number;
  messagesCount: number;
  votesA: number;
  votesB: number;
  votesC: number;
  votesD: number;
  votesE: number;
  votesF: number;
}

interface UseBeefLifecycleParams {
  roomId: string;
  userId: string;
  isHost: boolean;
  runBeefManage: (body: BeefManageAction) => Promise<BeefManageResult>;
  stopAllMediaTracksRef: React.MutableRefObject<() => void>;
  leaveRef: React.MutableRefObject<() => Promise<void>>;
  arenaOutboundRef: React.MutableRefObject<Partial<UseArenaRealtimeResult>>;
  beefEndsAtMsRef: React.MutableRefObject<number | null>;
  beefWallClockStartedAtRef: React.MutableRefObject<number | null>;
  statsRef: React.MutableRefObject<StatsRef>;
  supportBurstRef: React.MutableRefObject<AuraBatchPayload>;
}

export interface UseBeefLifecycleReturn {
  beefEnded: boolean;
  setBeefEnded: React.Dispatch<React.SetStateAction<boolean>>;
  endSummary: EndSummary | null;
  setEndSummary: React.Dispatch<React.SetStateAction<EndSummary | null>>;
  beefEndedRef: React.MutableRefObject<boolean>;
  endSummaryTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
  verdictConfetti: boolean;
  setVerdictConfetti: React.Dispatch<React.SetStateAction<boolean>>;
  rematchSequence: boolean;
  setRematchSequence: React.Dispatch<React.SetStateAction<boolean>>;
  rematchVerdictTimerRef: React.MutableRefObject<number | null>;
  endBeef: (reason?: string) => Promise<void>;
  handleMediatorVerdict: (kind: 'resolved' | 'closed' | 'rematch') => Promise<void>;
}

export function useBeefLifecycle({
  roomId, userId, isHost,
  runBeefManage,
  stopAllMediaTracksRef, leaveRef, arenaOutboundRef,
  beefEndsAtMsRef, beefWallClockStartedAtRef,
  statsRef, supportBurstRef,
}: UseBeefLifecycleParams): UseBeefLifecycleReturn {
  const router = useRouter();

  const [beefEnded, setBeefEnded] = useState(false);
  const [endSummary, setEndSummary] = useState<EndSummary | null>(null);
  const endSummaryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const beefEndedRef = useRef(false);

  const [verdictConfetti, setVerdictConfetti] = useState(false);
  const [rematchSequence, setRematchSequence] = useState(false);
  const rematchVerdictTimerRef = useRef<number | null>(null);

  const endBeef = useCallback(async (reason: string = 'Terminé par le Ref') => {
    if (beefEndedRef.current) return;
    stopAllMediaTracksRef.current();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(`arena_joined_${roomId}_${userId}`);
      } catch { /* ignore */ }
    }

    const s = statsRef.current;
    const wall = beefWallClockStartedAtRef.current;
    const elapsed =
      wall != null
        ? Math.max(0, Math.floor((Date.now() - wall) / 1000))
        : Math.max(0, DEFAULT_BEEF_DURATION - s.beefTimeRemaining);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    const sb = supportBurstRef.current;
    const summary: EndSummary = {
      duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
      viewers: s.liveViewerCount,
      resonanceA: s.votesA + sb.A,
      resonanceB: s.votesB + sb.B,
      resonanceC: s.votesC + sb.C,
      resonanceD: s.votesD + sb.D,
      resonanceE: s.votesE + sb.E,
      resonanceF: s.votesF + sb.F,
      resonanceM: sb.M,
      messages: s.messagesCount,
      endReason: reason,
    };

    const r = await runBeefManage({
      action: 'TOGGLE_STATUS',
      beefId: roomId,
      toggle: 'END_BEEF',
      endReason: reason,
      summary,
    });
    if (!r.ok) {
      stopAllMediaTracksRef.current();
      return;
    }

    beefEndedRef.current = true;
    beefEndsAtMsRef.current = null;
    beefWallClockStartedAtRef.current = null;
    setEndSummary(summary);
    setBeefEnded(true);

    arenaOutboundRef.current.broadcastBeefEnded?.({ reason, summary });
    await leaveRef.current();

    endSummaryTimerRef.current = setTimeout(() => {
      router.replace('/feed');
    }, 12000);
  }, [roomId, router, runBeefManage, userId, stopAllMediaTracksRef, leaveRef, arenaOutboundRef, beefEndsAtMsRef, beefWallClockStartedAtRef, statsRef, supportBurstRef]);

  const handleMediatorVerdict = useCallback(
    async (kind: 'resolved' | 'closed' | 'rematch') => {
      if (!isHost || beefEndedRef.current) return;
      useArenaVerdictStore.getState().setVerdict(kind, roomId);
      arenaOutboundRef.current.broadcastBeefVerdict?.(kind);

      if (kind === 'resolved') {
        setVerdictConfetti(true);
        window.setTimeout(() => setVerdictConfetti(false), 2200);
        window.setTimeout(() => void endBeef('L\u2019Agora a statu\u00e9 \u2014 Paix proclam\u00e9e'), 1600);
        return;
      }
      if (kind === 'closed') {
        void endBeef('Dissolution \u2014 Les citoyens sont lib\u00e9r\u00e9s, l\u2019Agora se ferme');
        return;
      }
      playRematchThunderSfx();
      setRematchSequence(true);
      await runBeefManage({
        action: 'TOGGLE_STATUS',
        beefId: roomId,
        toggle: 'REMATCH_MEDIATION_SUMMARY',
      });
      if (rematchVerdictTimerRef.current) clearTimeout(rematchVerdictTimerRef.current);
      rematchVerdictTimerRef.current = window.setTimeout(() => {
        rematchVerdictTimerRef.current = null;
        void endBeef('Rappel \u00e0 l\u2019Agora \u2014 Nouveau round exig\u00e9');
      }, 10000);
    },
    [isHost, roomId, endBeef, runBeefManage, arenaOutboundRef],
  );

  useEffect(() => {
    if (beefEnded) {
      setRematchSequence(false);
      if (rematchVerdictTimerRef.current) {
        clearTimeout(rematchVerdictTimerRef.current);
        rematchVerdictTimerRef.current = null;
      }
    }
  }, [beefEnded]);

  useEffect(() => {
    return () => {
      if (rematchVerdictTimerRef.current) clearTimeout(rematchVerdictTimerRef.current);
    };
  }, []);

  return {
    beefEnded, setBeefEnded,
    endSummary, setEndSummary,
    beefEndedRef, endSummaryTimerRef,
    verdictConfetti, setVerdictConfetti,
    rematchSequence, setRematchSequence,
    rematchVerdictTimerRef,
    endBeef, handleMediatorVerdict,
  };
}
