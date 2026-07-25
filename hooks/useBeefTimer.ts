'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ToastType } from '@/components/Toast';
import type { BeefManageAction, BeefManageResult } from '@/lib/beef-manage-client';

type ToastFn = (message: string, type?: ToastType) => void;

const DEFAULT_BEEF_DURATION = 60 * 60; // 60 min
const MAX_BEEF_DURATION = 4 * 60 * 60; // 4 h

interface UseBeefTimerParams {
  isHost: boolean;
  roomId: string;
  toast: ToastFn;
  runBeefManage: (body: BeefManageAction) => Promise<BeefManageResult>;
}

export interface UseBeefTimerReturn {
  beefTimeRemaining: number;
  setBeefTimeRemaining: React.Dispatch<React.SetStateAction<number>>;
  timerActive: boolean;
  setTimerActive: React.Dispatch<React.SetStateAction<boolean>>;
  timerPaused: boolean;
  setTimerPaused: React.Dispatch<React.SetStateAction<boolean>>;
  startingBeef: boolean;
  beefTimeRemainingRef: React.MutableRefObject<number>;
  timerActiveRef: React.MutableRefObject<boolean>;
  timerPausedRef: React.MutableRefObject<boolean>;
  beefEndsAtMsRef: React.MutableRefObject<number | null>;
  beefWallClockStartedAtRef: React.MutableRefObject<number | null>;
  beefWarning5Shown: React.MutableRefObject<boolean>;
  beefWarning1Shown: React.MutableRefObject<boolean>;
  isHostRef: React.MutableRefObject<boolean>;
  beefGlobalTimerFlushRef: React.MutableRefObject<(() => void) | null>;
  scheduleBeefGlobalTimerBroadcast: () => void;
  adjustBeefTime: (deltaSec: number) => void;
  resetBeefTimerToFull: () => void;
  pauseBeefTimer: () => void;
  resumeBeefTimer: () => void;
  handleStartBeef: (durationSec: number) => Promise<void>;
  endBeefRef: React.MutableRefObject<((reason: string) => Promise<void>) | undefined>;
}

export { DEFAULT_BEEF_DURATION, MAX_BEEF_DURATION };

export function useBeefTimer({ isHost, roomId, toast, runBeefManage }: UseBeefTimerParams): UseBeefTimerReturn {
  const [beefTimeRemaining, setBeefTimeRemaining] = useState(DEFAULT_BEEF_DURATION);
  const beefWarning5Shown = useRef(false);
  const beefWarning1Shown = useRef(false);

  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const beefEndsAtMsRef = useRef<number | null>(null);
  const beefWallClockStartedAtRef = useRef<number | null>(null);
  const beefTimeRemainingRef = useRef(DEFAULT_BEEF_DURATION);
  const timerActiveRef = useRef(false);
  const timerPausedRef = useRef(false);
  const isHostRef = useRef(isHost);

  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { timerActiveRef.current = timerActive; }, [timerActive]);
  useEffect(() => { timerPausedRef.current = timerPaused; }, [timerPaused]);
  useEffect(() => { beefTimeRemainingRef.current = beefTimeRemaining; }, [beefTimeRemaining]);

  const endBeefRef = useRef<(reason: string) => Promise<void>>();

  const beefGlobalTimerFlushRef = useRef<(() => void) | null>(null);
  const scheduleBeefGlobalTimerBroadcast = useCallback(() => {
    queueMicrotask(() => beefGlobalTimerFlushRef.current?.());
  }, []);

  useEffect(() => {
    if (!timerActive || timerPaused) return;
    const tick = () => {
      const end = beefEndsAtMsRef.current;
      if (end == null) return;
      const next = Math.max(0, Math.floor((end - Date.now()) / 1000));
      setBeefTimeRemaining(next);
      beefTimeRemainingRef.current = next;
      if (isHostRef.current) {
        if (next <= 5 * 60 && next > 60 && !beefWarning5Shown.current) {
          beefWarning5Shown.current = true;
          toast('5 minutes restantes', 'info');
        }
        if (next <= 60 && next > 0 && !beefWarning1Shown.current) {
          beefWarning1Shown.current = true;
          toast('1 minute restante !', 'error');
        }
      }
      if (next <= 0 && isHostRef.current) {
        beefEndsAtMsRef.current = null;
        setTimerActive(false);
        endBeefRef.current?.('Temps écoulé');
      }
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [timerActive, timerPaused, toast]);

  const adjustBeefTime = useCallback(
    (deltaSec: number) => {
      setBeefTimeRemaining((prev) => {
        const next = Math.max(0, Math.min(MAX_BEEF_DURATION, prev + deltaSec));
        beefTimeRemainingRef.current = next;
        if (timerActiveRef.current && !timerPausedRef.current) {
          beefEndsAtMsRef.current = Date.now() + next * 1000;
        }
        return next;
      });
      queueMicrotask(() => scheduleBeefGlobalTimerBroadcast());
    },
    [scheduleBeefGlobalTimerBroadcast],
  );

  const resetBeefTimerToFull = useCallback(() => {
    const next = DEFAULT_BEEF_DURATION;
    setBeefTimeRemaining(next);
    beefTimeRemainingRef.current = next;
    beefWarning5Shown.current = false;
    beefWarning1Shown.current = false;
    if (timerActiveRef.current && !timerPausedRef.current) {
      beefEndsAtMsRef.current = Date.now() + next * 1000;
    }
    queueMicrotask(() => scheduleBeefGlobalTimerBroadcast());
  }, [scheduleBeefGlobalTimerBroadcast]);

  const pauseBeefTimer = useCallback(() => {
    if (beefEndsAtMsRef.current != null) {
      const r = Math.max(0, Math.floor((beefEndsAtMsRef.current - Date.now()) / 1000));
      setBeefTimeRemaining(r);
      beefTimeRemainingRef.current = r;
    }
    beefEndsAtMsRef.current = null;
    setTimerPaused(true);
    queueMicrotask(() => scheduleBeefGlobalTimerBroadcast());
  }, [scheduleBeefGlobalTimerBroadcast]);

  const resumeBeefTimer = useCallback(() => {
    const r = beefTimeRemainingRef.current;
    beefEndsAtMsRef.current = Date.now() + r * 1000;
    setTimerPaused(false);
    queueMicrotask(() => scheduleBeefGlobalTimerBroadcast());
  }, [scheduleBeefGlobalTimerBroadcast]);

  const [startingBeef, setStartingBeef] = useState(false);

  const handleStartBeef = useCallback(
    async (durationSec: number) => {
      if (startingBeef) return;
      setStartingBeef(true);
      try {
        const r = await runBeefManage({
          action: 'TOGGLE_STATUS',
          beefId: roomId,
          toggle: 'START_LIVE_SESSION',
        });
        if (!r.ok) {
          toast('Erreur au lancement du chrono', 'error');
          return;
        }
        const sec = Math.max(60, Math.min(Math.floor(durationSec), MAX_BEEF_DURATION));
        const now = Date.now();
        const target = now + sec * 1000;
        beefWallClockStartedAtRef.current = now;
        beefEndsAtMsRef.current = target;
        setBeefTimeRemaining(sec);
        beefTimeRemainingRef.current = sec;
        beefWarning5Shown.current = false;
        beefWarning1Shown.current = false;
        setTimerActive(true);
        setTimerPaused(false);
        toast('Le beef a commencé.', 'success');
        queueMicrotask(() => scheduleBeefGlobalTimerBroadcast());
      } catch (err) {
        console.error('Start beef error:', err);
        toast('Erreur au lancement du chrono', 'error');
      } finally {
        setStartingBeef(false);
      }
    },
    [roomId, startingBeef, scheduleBeefGlobalTimerBroadcast, runBeefManage, toast],
  );

  return {
    beefTimeRemaining,
    setBeefTimeRemaining,
    timerActive,
    setTimerActive,
    timerPaused,
    setTimerPaused,
    startingBeef,
    beefTimeRemainingRef,
    timerActiveRef,
    timerPausedRef,
    beefEndsAtMsRef,
    beefWallClockStartedAtRef,
    beefWarning5Shown,
    beefWarning1Shown,
    isHostRef,
    beefGlobalTimerFlushRef,
    scheduleBeefGlobalTimerBroadcast,
    adjustBeefTime,
    resetBeefTimerToFull,
    pauseBeefTimer,
    resumeBeefTimer,
    handleStartBeef,
    endBeefRef,
  };
}
