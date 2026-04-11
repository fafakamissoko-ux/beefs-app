'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Gift,
  Heart,
  X,
  Lock,
  PanelRight,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Send,
  Award,
  Timer,
  Pause,
  Share2,
} from 'lucide-react';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { ChatPanel } from './ChatPanel';
import { PreJoinScreen } from './PreJoinScreen';
import { ParticipantVideo } from './ParticipantVideo';
import { FeatureGuide } from './FeatureGuide';
import { ViewerListModal } from './ViewerListModal';
import { useDailyCall } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { InviteParticipantModal } from './InviteParticipantModal';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';
import { DEFAULT_FREE_PREVIEW_MINUTES, viewerNeedsContinuationPay } from '@/lib/beef-preview';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import {
  buildParticipantAliasSet,
  isValidArenaUserId,
  matchRemoteToExpectedBeefParticipant,
  remoteMatchesMediator,
  type BeefParticipantRowMeta,
} from '@/lib/participant-identity';
import {
  FlyingReactionsLayer,
  createFlyingReactionEntry,
  pushFlyingReaction,
  SPECTATOR_QUICK_REACTIONS,
  type FlyingReactionEntry,
} from './FlyingReactionsLayer';
import { PointTrigger } from './PointTrigger';
import { ChallengerSupportHalo } from './ChallengerSupportHalo';
import { MediatorSupportHalo } from './MediatorSupportHalo';
import { useArenaPulseVoicesStore } from '@/lib/stores/arenaPulseVoicesStore';
import { useArenaVerdictStore } from '@/lib/stores/arenaVerdictStore';
import { VerdictConfettiBurst, RematchVerdictOverlay } from './VerdictEffects';
import { playRematchThunderSfx } from '@/lib/playVerdictSfx';
import { MediatorSidebar, type MediatorRemoteRow } from './MediatorSidebar';

/** Durée par défaut au lancement « Lancer le beef » (régie : +/- au-delà). */
const DEFAULT_BEEF_DURATION = 60 * 60; // 60 min
/** Plafond ajustable depuis la régie (prolongations). */
const MAX_BEEF_DURATION = 4 * 60 * 60; // 4 h

interface RingParticipant {
  id: string;
  name: string;
  avatar?: string;
  isMainParticipant: boolean; // Les 2 personnes principales en beef
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  isHost: boolean;
}

interface TikTokStyleArenaProps {
  host: Participant;
  challenger?: Participant | null;
  roomId: string;
  userId: string;
  userName: string;
  /** Toujours fourni par la page arène (pas de défaut « viewer » — évite des GET /api/beef/access fantômes). */
  userRole: 'mediator' | 'challenger' | 'viewer';
  viewerCount?: number;
  tension?: number;
  points?: number;
  debateTitle?: string;
  dailyRoomUrl?: string | null;
  onReaction: (emoji: string) => void;
  onTap?: () => void;
  onShare: () => void;
  /** Début officiel du beef (médiateur lance le chrono) — base du gratuit */
  previewStartedAt?: string | null;
  freePreviewMinutes?: number;
  /** Points pour continuer après la prévisualisation (0 = pas de paywall) */
  continuationPricePoints?: number;
  hasPaidContinuation?: boolean;
  onContinuationPaid?: () => void;
}

// 🔥 TOP 10 RÉACTIONS (affichées par défaut)
const TOP_10_REACTIONS = [
  '👍', '😂', '🔥', '💯', '👏', '😮', '💀', '❤️', '🎉', '🚀'
];

// 🔥 TOUTES LES RÉACTIONS POPULAIRES (24)
const POPULAR_REACTIONS = [
  '👍', '👎', '😂', '🔥', '💯', '👏', '🤔', '😮', '💀', 
  '🎯', '⚡', '💪', '🧠', '👀', '🤯', '😡', '❤️', '🎉', 
  '🙌', '💎', '🌟', '✨', '🚀', '💥'
];

/** Cœur / pouce : particules sur l’anneau du challenger (pas d’emoji flottant). */
const INTEGRATED_SUPPORT_REACTIONS = new Set(['❤️', '👍']);

interface VisibleMessage {
  id: string;
  user_name: string;
  content: string;
  timestamp: number;
  initial: string;
}

interface ParticipationRequest {
  id: string;
  user_name: string;
  user_id: string;
  timestamp: number;
}

interface Debater {
  id: string;
  name: string;
  isMuted: boolean;
  speakingTime: number;
}

interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  avatar?: string;
  bio?: string;
  isPrivate: boolean;
  joinedDate: string;
  stats: {
    debates: number;
    wins: number;
    followers: number;
    following: number;
  };
}

export function TikTokStyleArena({
  host,
  challenger,
  roomId,
  userId,
  userName,
  userRole,
  viewerCount = 0,
  points = 0,
  debateTitle = 'Débat en direct',
  dailyRoomUrl,
  onReaction,
  onShare,
  previewStartedAt = null,
  freePreviewMinutes = DEFAULT_FREE_PREVIEW_MINUTES,
  continuationPricePoints = 0,
  hasPaidContinuation = false,
  onContinuationPaid,
}: TikTokStyleArenaProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isViewer = userRole === 'viewer';
  const [hasJoined, setHasJoined] = useState(false);
  /** MediaStream du pré-joint (médiateur / challenger) — réutilisé par Daily pour éviter un 2ᵉ getUserMedia bloqué sur mobile. */
  const [preJoinMediaStream, setPreJoinMediaStream] = useState<MediaStream | null>(null);
  const [chatInput, setChatInput] = useState('');
  /** Chat en overlay bas-gauche (pas de sidebar) */
  const [mediatorSidebarOpen, setMediatorSidebarOpen] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);

  // ── END-OF-BEEF STATE ──
  const [beefEnded, setBeefEnded] = useState(false);
  const [endSummary, setEndSummary] = useState<{
    duration: string;
    viewers: number;
    votesA: number;
    votesB: number;
    messages: number;
    endReason: string;
  } | null>(null);
  const endSummaryTimerRef = useRef<NodeJS.Timeout | null>(null);
  const mediatorGraceRef = useRef<NodeJS.Timeout | null>(null);
  const [mediatorGraceActive, setMediatorGraceActive] = useState(false);
  const [mediatorGraceSeconds, setMediatorGraceSeconds] = useState(0);
  const beefEndedRef = useRef(false);
  const mediatorWasConnectedRef = useRef(false);
  /** True dès qu’au moins un challenger attendu a été vu dans la room Daily (évite la fin auto tant qu’on attend les connexions). */
  const challengersEverJoinedRef = useRef(false);
  const [userPoints, setUserPoints] = useState(0);
  const [profileFollowsTarget, setProfileFollowsTarget] = useState(false);

  // Speaking turn state
  const [speakingTurnActive, setSpeakingTurnActive] = useState(false);
  const [speakingTurnTarget, setSpeakingTurnTarget] = useState<string | null>(null);
  const speakingTurnTargetRef = useRef<string | null>(null);
  useEffect(() => {
    speakingTurnTargetRef.current = speakingTurnTarget;
  }, [speakingTurnTarget]);
  const [speakingTurnRemaining, setSpeakingTurnRemaining] = useState(0);
  const [speakingTurnPaused, setSpeakingTurnPaused] = useState(false);
  const [speakingTurnDuration, setSpeakingTurnDuration] = useState(60);
  const speakingTurnIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const stopTimerRef = useRef<() => void>(() => {});
  /** Bannière partagée « tour de parole » (remplace le toast pour tous les participants) */
  const [floorAnnouncement, setFloorAnnouncement] = useState<{
    name: string;
    slot: 'A' | 'B';
  } | null>(null);

  /** Débat structuré (budget challengers, tours imposés, micros) */
  const [structuredDebateEnabled, setStructuredDebateEnabled] = useState(false);
  const [debateBudgetMinutes, setDebateBudgetMinutes] = useState(60);
  const [challengerBudgetRemaining, setChallengerBudgetRemaining] = useState(60 * 60);
  /** Quand le médiateur parle : les chronos challengers sont en pause (ne consomment pas le budget) */
  const [mediatorHoldingFloor, setMediatorHoldingFloor] = useState(false);
  /** Coupure micro imposée par le médiateur (broadcast — le toggle local seul ne suffisait pas) */
  const [micMutedByMediator, setMicMutedByMediator] = useState(false);

  const {
    join,
    leave,
    toggleMic,
    toggleCam,
    setLocalAudioEnabled,
    setRemoteParticipantAudio,
    ejectRemoteParticipant,
    isJoined,
    isJoining,
    micEnabled,
    camEnabled,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId,
    error: callError,
  } = useDailyCall(dailyRoomUrl ?? null, userName, isViewer, userId, roomId);

  // Auto-join when user clicked "Rejoindre" AND dailyRoomUrl becomes available
  useEffect(() => {
    if (hasJoined && dailyRoomUrl && !isJoined && !isJoining) {
      void join(preJoinMediaStream);
    }
  }, [hasJoined, dailyRoomUrl, isJoined, isJoining, join, preJoinMediaStream]);
  const [flyingReactions, setFlyingReactions] = useState<FlyingReactionEntry[]>([]);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetUser, setReportTargetUser] = useState<{
    id: string;
    userName: string;
  } | null>(null);
  const [isOffline, setIsOffline] = useState(false);

  // Detect network loss for reconnection overlay
  useEffect(() => {
    const goOffline = () => { setIsOffline(true); toast('Connexion perdue — reconnexion...', 'error'); };
    const goOnline = () => { setIsOffline(false); toast('Connexion rétablie', 'success'); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, [toast]);
  const [visibleMessages, setVisibleMessages] = useState<VisibleMessage[]>([]);
  const [contextMenuMsg, setContextMenuMsg] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showAllReactions, setShowAllReactions] = useState(false); // NEW: Toggle pour afficher toutes les réactions
  /** Colonne emoji / cadeaux / partage — fermeture au tap extérieur */
  const reactionDockRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showAllReactions && !showGiftPicker) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = reactionDockRef.current;
      if (root?.contains(e.target as Node)) return;
      setShowAllReactions(false);
      setShowGiftPicker(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showAllReactions, showGiftPicker]);

  useEffect(() => {
    if (!showAllReactions && !showGiftPicker) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowAllReactions(false);
        setShowGiftPicker(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAllReactions, showGiftPicker]);

  useEffect(() => {
    if (mediatorSidebarOpen) {
      setShowAllReactions(false);
      setShowGiftPicker(false);
    }
  }, [mediatorSidebarOpen]);

  // Moderator controls — check if current user is the beef creator
  const isHost = userId === host.id;

  const goBuyPoints = useCallback(() => {
    openBuyPointsPage(router);
  }, [router]);

  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // Participant roles from DB — maps Daily.co userNames to beef roles
  const [participantRoles, setParticipantRoles] = useState<Record<string, BeefParticipantRowMeta>>({});
  const [liveViewerCount, setLiveViewerCount] = useState(viewerCount);

  // Chrono global — défaut 60 min, plafond MAX_BEEF_DURATION à la régie
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
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);
  useEffect(() => {
    timerActiveRef.current = timerActive;
  }, [timerActive]);
  useEffect(() => {
    timerPausedRef.current = timerPaused;
  }, [timerPaused]);
  useEffect(() => {
    beefTimeRemainingRef.current = beefTimeRemaining;
  }, [beefTimeRemaining]);

  const endBeefRef = useRef<(reason: string) => Promise<void>>();

  // ── VOTE SYSTEM — TikTok-style duel gauge ──
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /** Synchronise le chrono global vers challengers et spectateurs (médiateur uniquement). */
  const broadcastBeefGlobalTimer = useCallback(() => {
    if (!isHostRef.current || !channelRef.current) return;
    const active = timerActiveRef.current;
    const paused = timerPausedRef.current;
    let remainingSec = beefTimeRemainingRef.current;
    let endsAtMs: number | null = beefEndsAtMsRef.current;
    if (active && !paused && endsAtMs != null) {
      remainingSec = Math.max(0, Math.floor((endsAtMs - Date.now()) / 1000));
    } else {
      endsAtMs = null;
    }
    channelRef.current
      .send({
        type: 'broadcast',
        event: 'beef_global_timer',
        payload: { active, paused, remainingSec, endsAtMs },
      })
      .catch(() => {});
  }, []);

  // Décompte partagé (deadline `beefEndsAtMsRef`) — médiateur + clients synchronisés
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
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const pulseVoicesA = useArenaPulseVoicesStore((s) => s.pulseA);
  const pulseVoicesB = useArenaPulseVoicesStore((s) => s.pulseB);
  const resetPulseVoices = useArenaPulseVoicesStore((s) => s.reset);
  const resetArenaVerdict = useArenaVerdictStore((s) => s.reset);
  const addPulseVoices = useArenaPulseVoicesStore((s) => s.addPulse);
  const pulseBroadcastPending = useRef({ A: 0, B: 0 });

  const impactLeader = useMemo((): 'A' | 'B' | null => {
    if (pulseVoicesA > pulseVoicesB) return 'A';
    if (pulseVoicesB > pulseVoicesA) return 'B';
    return null;
  }, [pulseVoicesA, pulseVoicesB]);
  const pulseBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myVote, setMyVote] = useState<'A' | 'B' | null>(null);
  const [voteAnimation, setVoteAnimation] = useState<'A' | 'B' | null>(null);
  const lastPulseSideRef = useRef<'A' | 'B' | null>(null);
  const [supportBurst, setSupportBurst] = useState({ A: 0, B: 0, M: 0 });
  const [giftPrestigeFlash, setGiftPrestigeFlash] = useState(0);
  const [verdictConfetti, setVerdictConfetti] = useState(false);
  const [rematchSequence, setRematchSequence] = useState(false);
  const rematchVerdictTimerRef = useRef<number | null>(null);
  const rematchExitTimerRef = useRef<number | null>(null);

  const castVote = useCallback((side: 'A' | 'B') => {
    if (myVote === side) return; // already voted this side
    const prevVote = myVote;
    setMyVote(side);

    // Adjust local counts
    if (prevVote === 'A') setVotesA(v => Math.max(0, v - 1));
    if (prevVote === 'B') setVotesB(v => Math.max(0, v - 1));
    if (side === 'A') setVotesA(v => v + 1);
    if (side === 'B') setVotesB(v => v + 1);

    // Visual feedback
    setVoteAnimation(side);
    setTimeout(() => setVoteAnimation(null), 800);

    // Broadcast to others
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'vote',
        payload: { side, prev: prevVote, voter: userId },
      }).catch(() => {});
    }
  }, [myVote, userId]);

  const flushPulseBroadcast = useCallback(() => {
    pulseBroadcastTimerRef.current = null;
    const p = pulseBroadcastPending.current;
    const dA = p.A;
    const dB = p.B;
    p.A = 0;
    p.B = 0;
    if (dA === 0 && dB === 0) return;
    channelRef.current
      ?.send({ type: 'broadcast', event: 'pulse_voice', payload: { dA, dB } })
      .catch(() => {});
  }, []);

  const queuePulseBroadcast = useCallback(
    (side: 'A' | 'B') => {
      if (side === 'A') pulseBroadcastPending.current.A += 1;
      else pulseBroadcastPending.current.B += 1;
      if (pulseBroadcastTimerRef.current) return;
      pulseBroadcastTimerRef.current = setTimeout(flushPulseBroadcast, 140);
    },
    [flushPulseBroadcast],
  );

  const handlePulseVoice = useCallback(
    (side: 'A' | 'B') => {
      lastPulseSideRef.current = side;
      addPulseVoices(side, 1);
      queuePulseBroadcast(side);
    },
    [addPulseVoices, queuePulseBroadcast],
  );

  useEffect(() => {
    pulseBroadcastPending.current = { A: 0, B: 0 };
    if (pulseBroadcastTimerRef.current) {
      clearTimeout(pulseBroadcastTimerRef.current);
      pulseBroadcastTimerRef.current = null;
    }
    resetPulseVoices();
    resetArenaVerdict();
  }, [roomId, resetPulseVoices, resetArenaVerdict]);

  useEffect(() => {
    return () => {
      if (pulseBroadcastTimerRef.current) {
        clearTimeout(pulseBroadcastTimerRef.current);
        pulseBroadcastTimerRef.current = null;
      }
    };
  }, []);

  const totalVotes = votesA + votesB;

  /** Le chrono global du beef ne doit pas être figé par la micro du médiateur ou l’état audio des challengers. */

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
      queueMicrotask(() => broadcastBeefGlobalTimer());
    },
    [broadcastBeefGlobalTimer],
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
    queueMicrotask(() => broadcastBeefGlobalTimer());
  }, [broadcastBeefGlobalTimer]);

  const pauseBeefTimer = useCallback(() => {
    if (beefEndsAtMsRef.current != null) {
      const r = Math.max(0, Math.floor((beefEndsAtMsRef.current - Date.now()) / 1000));
      setBeefTimeRemaining(r);
      beefTimeRemainingRef.current = r;
    }
    beefEndsAtMsRef.current = null;
    setTimerPaused(true);
    queueMicrotask(() => broadcastBeefGlobalTimer());
  }, [broadcastBeefGlobalTimer]);

  const resumeBeefTimer = useCallback(() => {
    const r = beefTimeRemainingRef.current;
    beefEndsAtMsRef.current = Date.now() + r * 1000;
    setTimerPaused(false);
    queueMicrotask(() => broadcastBeefGlobalTimer());
  }, [broadcastBeefGlobalTimer]);

  const [startingBeef, setStartingBeef] = useState(false);

  const startBeefTimer = useCallback(async () => {
    const startSec = DEFAULT_BEEF_DURATION;
    beefWallClockStartedAtRef.current = Date.now();
    beefEndsAtMsRef.current = Date.now() + startSec * 1000;
    setBeefTimeRemaining(startSec);
    beefTimeRemainingRef.current = startSec;
    beefWarning5Shown.current = false;
    beefWarning1Shown.current = false;
    setTimerActive(true);
    setTimerPaused(false);
    toast('Le beef a commencé.', 'success');
    const { count } = await supabase
      .from('beefs')
      .select('*', { count: 'exact', head: true })
      .eq('mediator_id', host.id)
      .eq('resolution_status', 'resolved')
      .neq('id', roomId);
    const price = continuationPriceFromResolvedCount(count ?? 0);
    await supabase.from('beefs').update({
      status: 'live',
      started_at: new Date().toISOString(),
      price,
      is_premium: false,
    }).eq('id', roomId);
    queueMicrotask(() => broadcastBeefGlobalTimer());
  }, [host.id, roomId, toast, broadcastBeefGlobalTimer]);

  // Use refs for stats so endBeef captures the latest values without stale closures
  const statsRef = useRef({
    beefTimeRemaining: DEFAULT_BEEF_DURATION,
    liveViewerCount: 0,
    votesA: 0,
    votesB: 0,
    messagesCount: 0,
  });

  const endBeef = useCallback(async (reason: string = 'Terminé par le médiateur') => {
    if (beefEndedRef.current) return;
    beefEndedRef.current = true;

    const resolutionMap: Record<string, 'resolved' | 'unresolved' | 'abandoned'> = {
      'Terminé par le médiateur': 'resolved',
      'Le médiateur a mis fin au beef': 'resolved',
      'Temps écoulé': 'resolved',
      'Temps écoulé (60 min)': 'resolved',
      'Verdict : résolu': 'resolved',
      'Tous les challengers ont quitté': 'unresolved',
      'Clos par le médiateur': 'unresolved',
      'Rematch demandé': 'unresolved',
      'Médiateur déconnecté': 'abandoned',
      'Le médiateur a quitté': 'abandoned',
    };
    // Raison inconnue → abandoned (évite de marquer « résolu » des fins crash / libellés oubliés)
    const resolution = resolutionMap[reason] ?? 'abandoned';

    await supabase.from('beefs').update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      resolution_status: resolution,
    }).eq('id', roomId);

    const s = statsRef.current;
    const wall = beefWallClockStartedAtRef.current;
    const elapsed =
      wall != null
        ? Math.max(0, Math.floor((Date.now() - wall) / 1000))
        : Math.max(0, DEFAULT_BEEF_DURATION - s.beefTimeRemaining);
    beefEndsAtMsRef.current = null;
    beefWallClockStartedAtRef.current = null;
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;

    const summary = {
      duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
      viewers: s.liveViewerCount,
      votesA: s.votesA,
      votesB: s.votesB,
      messages: s.messagesCount,
      endReason: reason,
    };
    setEndSummary(summary);
    setBeefEnded(true);

    // Broadcast end to all viewers (with stats so they see accurate summary)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'beef_ended',
        payload: { reason, summary },
      }).catch(() => {});
    }

    // Stop camera/mic
    await leave();

    // Auto-redirect after 12 seconds
    endSummaryTimerRef.current = setTimeout(() => {
      router.replace('/feed');
    }, 12000);
  }, [roomId, leave, router]);

  const handleMediatorVerdict = useCallback(
    async (kind: 'resolved' | 'closed' | 'rematch') => {
      if (!isHost || beefEndedRef.current) return;
      useArenaVerdictStore.getState().setVerdict(kind, roomId);
      channelRef.current
        ?.send({ type: 'broadcast', event: 'beef_verdict', payload: { verdict: kind } })
        .catch(() => {});

      if (kind === 'resolved') {
        setVerdictConfetti(true);
        window.setTimeout(() => setVerdictConfetti(false), 2200);
        window.setTimeout(() => void endBeef('Verdict : résolu'), 1600);
        return;
      }
      if (kind === 'closed') {
        void endBeef('Clos par le médiateur');
        return;
      }
      playRematchThunderSfx();
      setRematchSequence(true);
      await supabase
        .from('beefs')
        .update({ mediation_summary: 'Rematch demandé — Round 2 à planifier avec les challengers.' })
        .eq('id', roomId);
      if (rematchVerdictTimerRef.current) clearTimeout(rematchVerdictTimerRef.current);
      rematchVerdictTimerRef.current = window.setTimeout(() => {
        rematchVerdictTimerRef.current = null;
        void endBeef('Rematch demandé');
      }, 10000);
    },
    [isHost, roomId, endBeef],
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

  // Keep refs in sync
  useEffect(() => { endBeefRef.current = endBeef; }, [endBeef]);
  useEffect(() => {
    statsRef.current = { beefTimeRemaining, liveViewerCount, votesA, votesB, messagesCount: visibleMessages.length };
  }, [beefTimeRemaining, liveViewerCount, votesA, votesB, visibleMessages.length]);

  const formatBeefTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  /** Pas de bulles « onboarding » quand la salle est déjà active ou pendant la connexion Daily */
  const featureGuideSuppress =
    isJoining ||
    (isJoined && (remoteParticipants.length > 0 || timerActive));

  useEffect(() => {
    challengersEverJoinedRef.current = false;
  }, [roomId]);

  // Track when mediator has actually connected at least once
  useEffect(() => {
    if (!isJoined || isHost) return;
    const mediatorPresent = remoteParticipants.some(p =>
      remoteMatchesMediator(p, host.id, host.name),
    );
    if (mediatorPresent) {
      mediatorWasConnectedRef.current = true;
    }
  }, [remoteParticipants, isJoined, isHost, host.id, host.name]);

  // If current user IS the mediator and joined, mark as connected
  useEffect(() => {
    if (isHost && isJoined) {
      mediatorWasConnectedRef.current = true;
    }
  }, [isHost, isJoined]);

  // Médiateur : mémoriser qu’un challenger invité est réellement entré dans la room (userData UUID + alias profil)
  useEffect(() => {
    if (!isHost || !isJoined) return;
    const expectedChallengerSlots = Object.keys(participantRoles).filter(uid => uid !== host.id);
    if (expectedChallengerSlots.length === 0) return;
    const anyChallengerPresent = remoteParticipants.some(p =>
      matchRemoteToExpectedBeefParticipant(p, host.id, host.name, participantRoles) !== null,
    );
    if (anyChallengerPresent) {
      challengersEverJoinedRef.current = true;
    }
  }, [isHost, isJoined, remoteParticipants, participantRoles, host.id, host.name]);

  // ── AUTO-END: Detect mediator or all challengers leaving ──
  useEffect(() => {
    if (!isJoined || beefEndedRef.current) return;

    const challengerUserIds = Object.keys(participantRoles);

    const mediatorPresent =
      isHost || remoteParticipants.some(p => remoteMatchesMediator(p, host.id, host.name));

    if (!mediatorPresent && !isHost && mediatorWasConnectedRef.current) {
      // Médiateur absent : avertissement + décompte — on ne termine **pas** le beef depuis un client non-hôte
      // (sinon navigation / onglet achat / coupure réseau court-circuitent le direct à tort).
      if (!mediatorGraceRef.current && !mediatorGraceActive) {
        setMediatorGraceActive(true);
        setMediatorGraceSeconds(90);

        const countdown = setInterval(() => {
          setMediatorGraceSeconds(prev => {
            if (prev <= 1) {
              clearInterval(countdown);
              mediatorGraceRef.current = null;
              setMediatorGraceActive(false);
              toast(
                'Le médiateur est toujours absent — le direct reste ouvert jusqu’à son retour ou la fin côté médiateur.',
                'info',
              );
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
        mediatorGraceRef.current = countdown;
      }
    } else if (mediatorPresent && mediatorGraceRef.current) {
      // Mediator reconnected — cancel grace period
      clearInterval(mediatorGraceRef.current);
      mediatorGraceRef.current = null;
      setMediatorGraceActive(false);
      setMediatorGraceSeconds(0);
      toast('Le médiateur est de retour', 'success');
    }

    // Tous les challengers ont quitté : uniquement si au moins un s’était connecté avant (sinon on attend encore les arrivées)
    if (
      isHost &&
      challengerUserIds.length > 0 &&
      challengersEverJoinedRef.current &&
      remoteParticipants.length === 0 &&
      isJoined
    ) {
      const timeout = setTimeout(() => {
        if (remoteParticipants.length === 0 && !beefEndedRef.current) {
          endBeefRef.current?.('Tous les challengers ont quitté');
        }
      }, 5000);
      return () => clearTimeout(timeout);
    }
  }, [remoteParticipants, isJoined, isHost, host.id, host.name, participantRoles, mediatorGraceActive, toast]);

  // Mediator leaving triggers endBeef
  const handleLeaveAsMediator = useCallback(async () => {
    if (isHost) {
      await endBeef('Le médiateur a mis fin au beef');
    }
  }, [isHost, endBeef]);

  // Load beef participants from Supabase to map roles
  useEffect(() => {
    const loadParticipants = async () => {
      const { data } = await supabase
        .from('beef_participants')
        .select('user_id, role, is_main, users!beef_participants_user_id_fkey(username, display_name)')
        .eq('beef_id', roomId);

      if (data) {
        const roles: Record<string, BeefParticipantRowMeta> = {};
        data.forEach((p) => {
          const row = p as {
            user_id: string;
            role: string;
            users?: { username?: string; display_name?: string } | { username?: string; display_name?: string }[] | null;
          };
          const u = Array.isArray(row.users) ? row.users[0] : row.users;
          const dn = (u?.display_name ?? '').trim();
          const un = (u?.username ?? '').trim();
          const name = dn || un || 'Participant';
          roles[row.user_id] = {
            role: row.role,
            name,
            matchAliases: buildParticipantAliasSet(u?.display_name, u?.username, name),
          };
        });
        setParticipantRoles(roles);
      }
    };
    loadParticipants();
  }, [roomId]);

  // Load user points
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from('users').select('points').eq('id', userId).single();
      if (data) setUserPoints(data.points || 0);
    })();
  }, [userId]);

  const [previewStartedAtLive, setPreviewStartedAtLive] = useState<string | null>(previewStartedAt ?? null);
  const [liveContinuationPrice, setLiveContinuationPrice] = useState(continuationPricePoints);
  useEffect(() => {
    setPreviewStartedAtLive(previewStartedAt ?? null);
    setLiveContinuationPrice(continuationPricePoints);
  }, [previewStartedAt, continuationPricePoints]);

  type ServerAccessPayload = {
    role?: string;
    viewerAccess?: string;
    continuationPrice?: number;
    freePreviewMinutes?: number;
    previewEndsInSeconds?: number;
  };
  const [serverAccess, setServerAccess] = useState<ServerAccessPayload | null>(null);
  /** True après la 1ʳᵉ tentative GET /api/beef/access (évite paywall + leave avant réponse serveur). */
  const [viewerAccessReady, setViewerAccessReady] = useState(false);
  /** True si le GET a échoué — ne pas traiter comme « pas encore résolu » + clientLocked (sinon leave() et blocage room). */
  const [viewerAccessFetchFailed, setViewerAccessFetchFailed] = useState(false);

  const fetchViewerAccess = useCallback(async () => {
    if (!isViewer) return;
    try {
      let { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        const { data } = await supabase.auth.refreshSession();
        session = data.session ?? null;
      }

      const headers: Record<string, string> = {};
      if (session?.access_token) {
        headers.Authorization = `Bearer ${session.access_token}`;
      }

      let res = await fetch(`/api/beef/access?beefId=${encodeURIComponent(roomId)}`, { headers });

      if (res.status === 401) {
        await supabase.auth.refreshSession();
        const { data: { session: s2 } } = await supabase.auth.getSession();
        const h: Record<string, string> = {};
        if (s2?.access_token) h.Authorization = `Bearer ${s2.access_token}`;
        res = await fetch(`/api/beef/access?beefId=${encodeURIComponent(roomId)}`, { headers: h });
      }

      const data = (await res.json()) as ServerAccessPayload & { error?: string };
      if (!res.ok) {
        setServerAccess(null);
        setViewerAccessFetchFailed(true);
        return;
      }
      setViewerAccessFetchFailed(false);
      setServerAccess(data);
      if (typeof data.continuationPrice === 'number') {
        setLiveContinuationPrice(data.continuationPrice);
      }
    } catch {
      setServerAccess(null);
      setViewerAccessFetchFailed(true);
    } finally {
      setViewerAccessReady(true);
    }
  }, [isViewer, roomId]);

  useEffect(() => {
    setViewerAccessReady(false);
    setViewerAccessFetchFailed(false);
    setServerAccess(null);
  }, [roomId]);

  useEffect(() => {
    const ch = supabase
      .channel(`beef_preview_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beefs', filter: `id=eq.${roomId}` },
        (payload: { new?: { started_at?: string; price?: number } }) => {
          const n = payload.new;
          if (n?.started_at) setPreviewStartedAtLive(n.started_at);
          if (typeof n?.price === 'number') setLiveContinuationPrice(n.price);
          fetchViewerAccess();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, fetchViewerAccess]);

  useEffect(() => {
    if (!isViewer) return;
    fetchViewerAccess();
    const id = setInterval(fetchViewerAccess, 8000);
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchViewerAccess();
    };
    const onPageShow = () => fetchViewerAccess();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [isViewer, fetchViewerAccess]);

  const accessResolved = serverAccess !== null;
  const serverLocked =
    isViewer &&
    serverAccess?.role === 'spectator' &&
    serverAccess.viewerAccess === 'locked';
  const clientLocked =
    isViewer &&
    viewerNeedsContinuationPay(
      previewStartedAtLive,
      freePreviewMinutes,
      liveContinuationPrice,
      hasPaidContinuation
    );
  /**
   * Si le GET access échoue, accessResolved reste false : l’ancienne formule
   * (!accessResolved && clientLocked) forçait le paywall et leave() — room inaccessible.
   * En cas d’échec API, on ne verrouille pas sur la seule logique client.
   */
  const previewPaywall =
    viewerAccessReady &&
    !viewerAccessFetchFailed &&
    (serverLocked || (!accessResolved && clientLocked));

  const paywallLeaveRef = useRef(false);
  const [continuationLoading, setContinuationLoading] = useState(false);

  useEffect(() => {
    if (previewPaywall && isJoined && !paywallLeaveRef.current) {
      paywallLeaveRef.current = true;
      leave();
    }
    if (!previewPaywall) paywallLeaveRef.current = false;
  }, [previewPaywall, isJoined, leave]);

  const handlePayContinuation = async () => {
    setContinuationLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/beef/access', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ beefId: roomId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      if (typeof data.newBalance === 'number') setUserPoints(data.newBalance);
      await fetchViewerAccess();
      onContinuationPaid?.();
      toast('Accès débloqué — bon visionnage !', 'success');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur';
      if (msg.toLowerCase().includes('insuffisant')) {
        toast(msg, 'error', {
          action: {
            label: 'Recharger des points',
            onClick: () => goBuyPoints(),
          },
        });
      } else {
        toast(msg, 'error');
      }
    } finally {
      setContinuationLoading(false);
    }
  };

  // Spectateurs uniquement (pas médiateur ni challengers)
  useEffect(() => {
    if (!isJoined || userRole !== 'viewer') return;

    supabase.rpc('increment_viewer_count', { beef_id: roomId }).then(() => {});
    setLiveViewerCount((prev) => prev + 1);

    return () => {
      supabase.rpc('decrement_viewer_count', { beef_id: roomId }).then(() => {});
    };
  }, [isJoined, roomId, userRole]);

  // Sort remote participants: main challengers first based on roles
  const sortedRemoteParticipants = [...remoteParticipants].sort((a, b) => {
    const metaA = matchRemoteToExpectedBeefParticipant(a, host.id, host.name, participantRoles);
    const metaB = matchRemoteToExpectedBeefParticipant(b, host.id, host.name, participantRoles);
    const roleA = metaA?.role;
    const roleB = metaB?.role;
    if (roleA === 'participant' && roleB !== 'participant') return -1;
    if (roleA !== 'participant' && roleB === 'participant') return 1;
    return 0;
  });

  // Video layout: determine which participant goes in each slot based on role
  const hostRemoteParticipant = !isHost
    ? remoteParticipants.find(p => remoteMatchesMediator(p, host.id, host.name)) ?? null
    : null;

  const nonHostRemotes = isHost
    ? sortedRemoteParticipants
    : sortedRemoteParticipants.filter(p => p !== hostRemoteParticipant);

  const leftPanel = isHost ? sortedRemoteParticipants[0] : localParticipant;
  const leftPanelIsLocal = !isHost;
  const leftPanelName = isHost
    ? (sortedRemoteParticipants[0]?.userName || 'Challenger 1')
    : userName;

  const rightPanel = isHost ? sortedRemoteParticipants[1] : nonHostRemotes[0];
  const rightPanelName = isHost
    ? (sortedRemoteParticipants[1]?.userName || 'Challenger 2')
    : (nonHostRemotes[0]?.userName || 'Challenger 2');

  const leftIsSpeaking =
    speakingTurnActive &&
    !!leftPanel?.arenaUserId &&
    speakingTurnTarget === leftPanel.arenaUserId;
  const rightIsSpeaking =
    speakingTurnActive &&
    !!rightPanel?.arenaUserId &&
    speakingTurnTarget === rightPanel.arenaUserId;

  const leftRemoteAudioMuted =
    structuredDebateEnabled &&
    !leftPanelIsLocal &&
    !!leftPanel &&
    (!leftIsSpeaking || mediatorHoldingFloor);
  const rightRemoteAudioMuted =
    structuredDebateEnabled && !!rightPanel && (!rightIsSpeaking || mediatorHoldingFloor);

  const mediatorParticipant = isHost ? localParticipant : hostRemoteParticipant;
  const mediatorIsLocal = isHost;
  const mediatorName = isHost ? userName : host.name;

  /** Halos néon (Phase 2) : parole réelle Daily + micro ouvert sur la piste audio. */
  const leftNeonAudio =
    !!dailyRoomUrl &&
    !!leftPanel &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === leftPanel.sessionId &&
    leftPanel.audioOn;

  const rightNeonAudio =
    !!dailyRoomUrl &&
    !!rightPanel &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === rightPanel.sessionId &&
    rightPanel.audioOn;

  const mediatorNeonAudio =
    !!dailyRoomUrl &&
    !!mediatorParticipant &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === mediatorParticipant.sessionId &&
    mediatorParticipant.audioOn;

  const mediatorRemoteRows = useMemo((): MediatorRemoteRow[] => {
    if (!isHost || !dailyRoomUrl) return [];
    const rows: MediatorRemoteRow[] = [];
    if (leftPanel?.sessionId) {
      rows.push({
        sessionId: leftPanel.sessionId,
        label: leftPanelName,
        slot: 'A',
        debaterId: leftPanel.arenaUserId ?? null,
        audioOn: leftPanel.audioOn,
      });
    }
    if (rightPanel?.sessionId) {
      rows.push({
        sessionId: rightPanel.sessionId,
        label: rightPanelName,
        slot: 'B',
        debaterId: rightPanel.arenaUserId ?? null,
        audioOn: rightPanel.audioOn,
      });
    }
    return rows;
  }, [isHost, dailyRoomUrl, leftPanel, rightPanel, leftPanelName, rightPanelName]);

  const leftPanelRef = useRef(leftPanel);
  const rightPanelRef = useRef(rightPanel);
  leftPanelRef.current = leftPanel;
  rightPanelRef.current = rightPanel;

  const hotMicSpeakerSlot = useMemo((): 'A' | 'B' | null => {
    if (!speakingTurnActive || !speakingTurnTarget) return null;
    if (leftPanel?.arenaUserId && speakingTurnTarget === leftPanel.arenaUserId) return 'A';
    if (rightPanel?.arenaUserId && speakingTurnTarget === rightPanel.arenaUserId) return 'B';
    return null;
  }, [speakingTurnActive, speakingTurnTarget, leftPanel, rightPanel]);

  /** Slot affiché sur les panneaux (spectateurs : parfois pas de match arenaUserId → fallback bannière). */
  const effectiveHotMicSpeakerSlot = useMemo((): 'A' | 'B' | null => {
    if (!speakingTurnActive) return null;
    return hotMicSpeakerSlot ?? floorAnnouncement?.slot ?? null;
  }, [speakingTurnActive, hotMicSpeakerSlot, floorAnnouncement]);

  // Multi-participant system
  const [ringParticipants, setRingParticipants] = useState<RingParticipant[]>([]);
  const [participationRequests, setParticipationRequests] = useState<ParticipationRequest[]>([]);
  const [debaters, setDebaters] = useState<Debater[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [inviteInput, setInviteInput] = useState('');
  const [showDebateTitle, setShowDebateTitle] = useState(true);

  const handleMediatorChallengerMute = useCallback(
    (sessionId: string, debaterId: string | null, muted: boolean) => {
      setRemoteParticipantAudio(sessionId, !muted);
      if (debaterId) {
        setDebaters((prev) =>
          prev.map((d) => (d.id === debaterId ? { ...d, isMuted: muted } : d)),
        );
        channelRef.current
          ?.send({
            type: 'broadcast',
            event: 'mediator_mute_challenger',
            payload: { targetUserId: debaterId, muted },
          })
          .catch(() => {});
        /** Couper le micro du locuteur actif = fin du tour de parole (chrono arrêté) */
        if (muted && debaterId === speakingTurnTargetRef.current) {
          setSpeakingTurnPaused(false);
          stopTimerRef.current();
        }
      }
    },
    [setRemoteParticipantAudio],
  );

  // User profiles
  const [showProfile, setShowProfile] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  
  const profileCache = useRef<Record<string, UserProfile>>({});

  useEffect(() => {
    const rows = Object.entries(participantRoles)
      .filter(([uid]) => uid !== host.id)
      .map(([id, meta]) => ({
        id,
        name: meta.name,
        isMuted: true,
        speakingTime: 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    if (rows.length === 0) return;
    setDebaters((prev) => (prev.length === 0 ? rows : prev));
  }, [participantRoles, host.id]);

  // ── HYBRID LIVE SYNC: Broadcast (instant) + Polling (fallback) ──
  const [liveConnected, setLiveConnected] = useState(false);
  const seenMsgKeys = useRef(new Set<string>());

  const addRemoteMessage = useCallback((msgUserName: string, content: string, initial?: string, dbId?: string) => {
    const key = `${msgUserName}::${content}`;
    if (seenMsgKeys.current.has(key)) return;
    seenMsgKeys.current.add(key);
    // Remove key after 5s so the same message text can be sent again later
    setTimeout(() => seenMsgKeys.current.delete(key), 5000);
    const msgId = dbId || `m_${Date.now()}_${Math.random()}`;
    const newMsg: VisibleMessage = {
      id: msgId,
      user_name: msgUserName,
      content,
      timestamp: Date.now(),
      initial: initial || msgUserName?.[0]?.toUpperCase() || '?',
    };
    setVisibleMessages(prev => [...prev, newMsg].slice(-80));
  }, []);

  const addRemoteReaction = useCallback((emoji: string, supportSlot?: 'A' | 'B' | 'M' | null) => {
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && (supportSlot === 'A' || supportSlot === 'B')) {
      setSupportBurst((prev) => ({ ...prev, [supportSlot]: prev[supportSlot] + 1 }));
      return;
    }
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && supportSlot === 'M') {
      setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
      return;
    }
    const entry = createFlyingReactionEntry(emoji);
    setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
  }, []);

  const emitTapSupport = useCallback((target: 'A' | 'B' | 'M') => {
    if (target === 'M') {
      setSupportBurst((p) => ({ ...p, M: p.M + 1 }));
    } else {
      setSupportBurst((p) => ({ ...p, [target]: p[target] + 1 }));
    }
    const xPercent =
      target === 'A' ? 14 + Math.random() * 16 : target === 'B' ? 70 + Math.random() * 16 : 44 + Math.random() * 12;
    const entry = createFlyingReactionEntry('❤️', {
      x: xPercent,
      opacityMul: 0.5,
      scaleMul: 0.82,
    });
    setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
    channelRef.current
      ?.send({
        type: 'broadcast',
        event: 'reaction',
        payload: { emoji: '❤️', supportSlot: target },
      })
      .catch(() => {});
  }, []);

  // 1) Broadcast channel — instant P2P delivery
  useEffect(() => {
    const channel = supabase.channel(`live_${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'reaction' }, ({ payload }: any) => {
        addRemoteReaction(payload.emoji, payload.supportSlot);
      })
      .on('broadcast', { event: 'message' }, ({ payload }: any) => {
        console.log('[Live] Received broadcast message from:', payload.user_name);
        addRemoteMessage(payload.user_name, payload.content, payload.initial, payload.id);
      })
      .on('broadcast', { event: 'vote' }, ({ payload }: any) => {
        if (payload.prev === 'A') setVotesA(v => Math.max(0, v - 1));
        if (payload.prev === 'B') setVotesB(v => Math.max(0, v - 1));
        if (payload.side === 'A') setVotesA(v => v + 1);
        if (payload.side === 'B') setVotesB(v => v + 1);
      })
      .on('broadcast', { event: 'pulse_voice' }, ({ payload }: any) => {
        const dA = Math.max(0, Math.floor(Number(payload?.dA) || 0));
        const dB = Math.max(0, Math.floor(Number(payload?.dB) || 0));
        if (dA) addPulseVoices('A', dA);
        if (dB) addPulseVoices('B', dB);
      })
      .on('broadcast', { event: 'beef_global_timer' }, ({ payload }: any) => {
        if (isHostRef.current) return;
        const active = !!payload?.active;
        const paused = !!payload?.paused;
        const remainingSec = Math.max(0, Math.floor(Number(payload?.remainingSec) || 0));
        const rawEnd = payload?.endsAtMs;
        const endsAtMs =
          rawEnd != null && Number.isFinite(Number(rawEnd)) ? Number(rawEnd) : null;
        setTimerActive(active);
        setTimerPaused(paused);
        setBeefTimeRemaining(remainingSec);
        beefTimeRemainingRef.current = remainingSec;
        if (active && !paused && endsAtMs != null && endsAtMs > Date.now() - 120_000) {
          beefEndsAtMsRef.current = endsAtMs;
        } else {
          beefEndsAtMsRef.current = null;
        }
      })
      .on('broadcast', { event: 'speaking_turn' }, ({ payload }: any) => {
        if (isHostRef.current) return;
        if (payload?.action === 'start') {
          setSpeakingTurnPaused(false);
          setSpeakingTurnActive(true);
          setSpeakingTurnTarget(payload.debaterId);
          const dur = Math.max(0, Math.floor(Number(payload?.duration) || 0));
          if (dur > 0) {
            setSpeakingTurnRemaining(dur);
            setSpeakingTurnDuration(Math.max(15, Math.min(600, dur)));
          }
          setTimerRunning(true);
          setCurrentSpeaker(payload.debaterId);
          const sl = payload?.slot as 'A' | 'B' | undefined;
          const nm = (payload?.speakerName as string) || (sl ? `Challenger ${sl}` : '');
          if (sl && nm) {
            setFloorAnnouncement({ name: nm, slot: sl });
          }
        } else if (payload?.action === 'pause') {
          setSpeakingTurnPaused(true);
        } else if (payload?.action === 'resume') {
          setSpeakingTurnPaused(false);
        } else if (payload?.action === 'stop') {
          setFloorAnnouncement(null);
          setSpeakingTurnPaused(false);
          setSpeakingTurnActive(false);
          setSpeakingTurnTarget(null);
          setSpeakingTurnRemaining(0);
          setTimerRunning(false);
          setCurrentSpeaker(null);
          if (speakingTurnIntervalRef.current) {
            clearInterval(speakingTurnIntervalRef.current);
            speakingTurnIntervalRef.current = null;
          }
        }
      })
      .on('broadcast', { event: 'mediator_floor' }, ({ payload }: any) => {
        if (typeof payload?.active === 'boolean') setMediatorHoldingFloor(payload.active);
      })
      .on('broadcast', { event: 'mediation_toss' }, ({ payload }: any) => {
        if (payload?.firstName && userRole !== 'mediator') {
          toast(`Tirage : ${payload.firstName} commence`, 'info');
        }
      })
      .on('broadcast', { event: 'structured_debate' }, ({ payload }: any) => {
        if (payload?.enabled === false) {
          setStructuredDebateEnabled(false);
          return;
        }
        if (payload?.enabled) {
          setStructuredDebateEnabled(true);
          if (typeof payload.budgetSeconds === 'number') {
            setChallengerBudgetRemaining(payload.budgetSeconds);
          }
        }
      })
      .on('broadcast', { event: 'mediator_mute_challenger' }, ({ payload }: any) => {
        if (userRole !== 'challenger') return;
        const uid = payload?.targetUserId as string | undefined;
        if (!uid || uid !== userId) return;
        setMicMutedByMediator(!!payload?.muted);
      })
      .on('broadcast', { event: 'beef_verdict' }, ({ payload }: any) => {
        const v = payload?.verdict as string | undefined;
        if (v !== 'resolved' && v !== 'closed' && v !== 'rematch') return;
        useArenaVerdictStore.getState().setVerdict(v, roomId);
        if (v === 'resolved') {
          setVerdictConfetti(true);
          window.setTimeout(() => setVerdictConfetti(false), 2200);
        }
        if (v === 'rematch') {
          setRematchSequence(true);
          playRematchThunderSfx();
          if (rematchExitTimerRef.current) {
            window.clearTimeout(rematchExitTimerRef.current);
            rematchExitTimerRef.current = null;
          }
          rematchExitTimerRef.current = window.setTimeout(() => {
            rematchExitTimerRef.current = null;
            setRematchSequence(false);
            if (!beefEndedRef.current) {
              router.replace(`/beef/${roomId}/summary`);
            }
          }, 12000);
        }
      })
      .on('broadcast', { event: 'beef_ended' }, ({ payload }: any) => {
        if (beefEndedRef.current) return;
        beefEndedRef.current = true;
        beefEndsAtMsRef.current = null;
        setTimerActive(false);
        setTimerPaused(false);
        if (payload?.summary) {
          setEndSummary(payload.summary);
        } else {
          const s = statsRef.current;
          const wall = beefWallClockStartedAtRef.current;
          const elapsed =
            wall != null
              ? Math.max(0, Math.floor((Date.now() - wall) / 1000))
              : Math.max(0, DEFAULT_BEEF_DURATION - s.beefTimeRemaining);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          setEndSummary({
            duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
            viewers: s.liveViewerCount,
            votesA: s.votesA,
            votesB: s.votesB,
            messages: s.messagesCount,
            endReason: payload?.reason || 'Beef terminé',
          });
        }
        setRematchSequence(false);
        if (rematchExitTimerRef.current) {
          window.clearTimeout(rematchExitTimerRef.current);
          rematchExitTimerRef.current = null;
        }
        setBeefEnded(true);
        void leave();
        if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
        endSummaryTimerRef.current = setTimeout(() => router.replace('/feed'), 12000);
      })
      .subscribe((status: string) => {
        console.log('[Live] Broadcast channel:', status);
        if (status === 'SUBSCRIBED') {
          channelRef.current = channel;
          setLiveConnected(true);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('[Live] Broadcast failed — polling fallback active');
          setLiveConnected(false);
        }
      });

    return () => {
      if (rematchExitTimerRef.current) {
        window.clearTimeout(rematchExitTimerRef.current);
        rematchExitTimerRef.current = null;
      }
      channelRef.current = null;
      setLiveConnected(false);
      supabase.removeChannel(channel);
    };
  }, [
    roomId,
    addRemoteMessage,
    addRemoteReaction,
    addPulseVoices,
    userRole,
    userId,
    toast,
    setVerdictConfetti,
    setRematchSequence,
    router,
    leave,
  ]);

  useEffect(() => {
    if (!liveConnected || !isHost || !timerActive) return;
    broadcastBeefGlobalTimer();
  }, [liveConnected, isHost, timerActive, broadcastBeefGlobalTimer]);

  useEffect(() => {
    if (!liveConnected || !isHost || !timerActive || timerPaused) return;
    const id = window.setInterval(() => broadcastBeefGlobalTimer(), 10_000);
    return () => window.clearInterval(id);
  }, [liveConnected, isHost, timerActive, timerPaused, broadcastBeefGlobalTimer]);

  // 2) Polling fallback — queries DB for new messages every 3s (guaranteed delivery)
  useEffect(() => {
    let lastTs = new Date().toISOString();

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('beef_messages')
          .select('id, username, display_name, content, user_id, created_at')
          .eq('beef_id', roomId)
          .eq('is_deleted', false)
          .gt('created_at', lastTs)
          .order('created_at', { ascending: true })
          .limit(10);

        if (data && data.length > 0) {
          lastTs = data[data.length - 1].created_at;
          data.forEach(msg => {
            if (msg.user_id === userId) return;
            addRemoteMessage(msg.display_name || msg.username, msg.content, undefined, msg.id);
          });
        }
      } catch {}
    };

    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [roomId, userId, addRemoteMessage]);

  // 3) Reaction polling fallback — queries DB for new reactions every 3s
  useEffect(() => {
    let lastReactionTs = new Date().toISOString();

    const pollReactions = async () => {
      try {
        const { data } = await supabase
          .from('beef_reactions')
          .select('id, emoji, user_id, created_at')
          .eq('beef_id', roomId)
          .gt('created_at', lastReactionTs)
          .order('created_at', { ascending: true })
          .limit(20);

        if (data && data.length > 0) {
          lastReactionTs = data[data.length - 1].created_at;
          data.forEach(r => {
            if (r.user_id === userId) return;
            addRemoteReaction(r.emoji);
          });
        }
      } catch {}
    };

    const interval = setInterval(pollReactions, 3000);
    return () => clearInterval(interval);
  }, [roomId, userId, addRemoteReaction]);

  const handleReaction = (emoji: string) => {
    onReaction(emoji);

    const integrated = INTEGRATED_SUPPORT_REACTIONS.has(emoji);
    const slotAB = (myVote ?? lastPulseSideRef.current ?? 'A') as 'A' | 'B';
    const heartTarget: 'A' | 'B' | 'M' =
      emoji === '❤️' && speakingTurnActive && effectiveHotMicSpeakerSlot
        ? effectiveHotMicSpeakerSlot
        : emoji === '❤️'
          ? 'M'
          : slotAB;

    if (integrated && emoji === '❤️') {
      if (heartTarget === 'M') {
        setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
      } else {
        setSupportBurst((prev) => ({ ...prev, [heartTarget]: prev[heartTarget] + 1 }));
      }
      const xPercent =
        heartTarget === 'A'
          ? 14 + Math.random() * 16
          : heartTarget === 'B'
            ? 70 + Math.random() * 16
            : 44 + Math.random() * 12;
      const entry = createFlyingReactionEntry(emoji, {
        x: xPercent,
        opacityMul: 0.5,
        scaleMul: 0.82,
      });
      setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
    } else if (integrated) {
      setSupportBurst((prev) => ({ ...prev, [slotAB]: prev[slotAB] + 1 }));
      const entry = createFlyingReactionEntry(emoji);
      setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
    } else {
      const entry = createFlyingReactionEntry(emoji);
      setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
    }

    if (channelRef.current) {
      channelRef.current
        .send({
          type: 'broadcast',
          event: 'reaction',
          payload:
            integrated && emoji === '❤️'
              ? { emoji, supportSlot: heartTarget }
              : integrated
                ? { emoji, supportSlot: slotAB }
                : { emoji },
        })
        .catch(() => console.warn('[Live] Reaction broadcast failed'));
    }
    supabase.from('beef_reactions').insert({ beef_id: roomId, user_id: userId, emoji }).then(() => {});
  };

  // Messages and reactions are now received via Broadcast channel above

  // Debate title animation - show for 5s every 60s (1 minute)
  useEffect(() => {
    const showTitle = () => {
      setShowDebateTitle(true);
      setTimeout(() => {
        setShowDebateTitle(false);
      }, 5000); // Hide after 5 seconds
    };

    // Show initially
    showTitle();

    // Then repeat every 60 seconds (1 minute)
    const interval = setInterval(() => {
      showTitle();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const toggleMediatorFloor = () => {
    if (!isHost) return;
    setMediatorHoldingFloor((prev) => {
      const next = !prev;
      channelRef.current
        ?.send({ type: 'broadcast', event: 'mediator_floor', payload: { active: next } })
        .catch(() => {});
      return next;
    });
  };

  const runTossForFirstSpeaker = () => {
    if (debaters.length < 2) {
      toast('Au moins 2 challengers pour un tirage au sort.', 'info');
      return;
    }
    const pick = debaters[Math.floor(Math.random() * debaters.length)];
    toast(`${pick.name} parle en premier (tirage au sort).`, 'success');
    channelRef.current
      ?.send({
        type: 'broadcast',
        event: 'mediation_toss',
        payload: { firstSpeakerId: pick.id, firstName: pick.name },
      })
      .catch(() => {});
  };

  const startTimer = (debaterId: string) => {
    setSpeakingTurnPaused(false);
    setMediatorHoldingFloor(false);
    if (channelRef.current) {
      channelRef.current
        .send({ type: 'broadcast', event: 'mediator_floor', payload: { active: false } })
        .catch(() => {});
    }
    setCurrentSpeaker(debaterId);
    setTimerRunning(true);
    setSpeakingTurnActive(true);
    setSpeakingTurnTarget(debaterId);
    setSpeakingTurnRemaining(speakingTurnDuration);

    setDebaters((prev) =>
      prev.map((d) =>
        d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true },
      ),
    );

    const slot: 'A' | 'B' | undefined =
      debaterId === leftPanel?.arenaUserId ? 'A' : debaterId === rightPanel?.arenaUserId ? 'B' : undefined;
    const speakerLabel =
      debaters.find((d) => d.id === debaterId)?.name ??
      (slot === 'A' ? leftPanelName : slot === 'B' ? rightPanelName : 'Intervenant');
    if (slot) {
      setFloorAnnouncement({ name: speakerLabel, slot });
    }
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'speaking_turn',
        payload: {
          debaterId,
          duration: speakingTurnDuration,
          action: 'start',
          slot,
          speakerName: speakerLabel,
        },
      }).catch(() => {});
      channelRef.current
        .send({
          type: 'broadcast',
          event: 'mediator_mute_challenger',
          payload: { targetUserId: debaterId, muted: false },
        })
        .catch(() => {});
    }

  };

  const startHotMicTurn = useCallback(
    (slot: 'A' | 'B', durationSec: number, opts?: { force?: boolean }) => {
      if (speakingTurnActive && !opts?.force) {
        toast('Un tour de parole est déjà en cours.', 'info');
        return;
      }
      if (opts?.force && speakingTurnActive) {
        stopTimerRef.current();
      }
      setSpeakingTurnPaused(false);
      const duration = Math.max(15, Math.min(600, Math.round(durationSec / 5) * 5));
      const activePanel = slot === 'A' ? leftPanel : rightPanel;
      const otherPanel = slot === 'A' ? rightPanel : leftPanel;
      const debaterId = activePanel?.arenaUserId ?? null;
      if (!debaterId || !activePanel?.sessionId) {
        toast('Challenger non connecté pour ce slot.', 'info');
        return;
      }
      setSpeakingTurnDuration(duration);
      setMediatorHoldingFloor(false);
      if (channelRef.current) {
        channelRef.current
          .send({ type: 'broadcast', event: 'mediator_floor', payload: { active: false } })
          .catch(() => {});
      }
      if (otherPanel?.sessionId) setRemoteParticipantAudio(otherPanel.sessionId, false);
      if (activePanel.sessionId) setRemoteParticipantAudio(activePanel.sessionId, true);
      if (otherPanel?.arenaUserId) {
        channelRef.current
          ?.send({
            type: 'broadcast',
            event: 'mediator_mute_challenger',
            payload: { targetUserId: otherPanel.arenaUserId, muted: true },
          })
          .catch(() => {});
      }
      channelRef.current
        ?.send({
          type: 'broadcast',
          event: 'mediator_mute_challenger',
          payload: { targetUserId: debaterId, muted: false },
        })
        .catch(() => {});

      setCurrentSpeaker(debaterId);
      setTimerRunning(true);
      setSpeakingTurnActive(true);
      setSpeakingTurnTarget(debaterId);
      setSpeakingTurnRemaining(duration);

      setDebaters((prev) =>
        prev.map((d) =>
          d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true },
        ),
      );

      const speakerLabel =
        debaters.find((d) => d.id === debaterId)?.name ?? (slot === 'A' ? leftPanelName : rightPanelName);
      setFloorAnnouncement({ name: speakerLabel, slot });

      channelRef.current
        ?.send({
          type: 'broadcast',
          event: 'speaking_turn',
          payload: { debaterId, duration, action: 'start', slot, speakerName: speakerLabel },
        })
        .catch(() => {});
    },
    [
      speakingTurnActive,
      leftPanel,
      rightPanel,
      setRemoteParticipantAudio,
      toast,
      debaters,
      leftPanelName,
      rightPanelName,
    ],
  );

  const stopTimer = useCallback(() => {
    setSpeakingTurnPaused(false);
    setFloorAnnouncement(null);
    const endedSpeakerId = speakingTurnTargetRef.current;
    if (isHost && endedSpeakerId) {
      const lp = leftPanelRef.current;
      const rp = rightPanelRef.current;
      const sid =
        endedSpeakerId === lp?.arenaUserId
          ? lp?.sessionId
          : endedSpeakerId === rp?.arenaUserId
            ? rp?.sessionId
            : null;
      if (sid) setRemoteParticipantAudio(sid, false);
      channelRef.current
        ?.send({
          type: 'broadcast',
          event: 'mediator_mute_challenger',
          payload: { targetUserId: endedSpeakerId, muted: true },
        })
        .catch(() => {});
    }

    setTimerRunning(false);
    setCurrentSpeaker(null);
    setSpeakingTurnActive(false);
    setSpeakingTurnTarget(null);
    if (speakingTurnIntervalRef.current) {
      clearInterval(speakingTurnIntervalRef.current);
      speakingTurnIntervalRef.current = null;
    }

    setDebaters((prev) =>
      structuredDebateEnabled ? prev.map((d) => ({ ...d, isMuted: true })) : prev,
    );

    if (channelRef.current && isHost) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'speaking_turn',
        payload: { action: 'stop' },
      }).catch(() => {});
    }
  }, [isHost, structuredDebateEnabled, setRemoteParticipantAudio]);

  const pauseSpeakingTurn = useCallback(() => {
    if (!speakingTurnActive) return;
    setSpeakingTurnPaused(true);
    if (isHost && hotMicSpeakerSlot) {
      const panel = hotMicSpeakerSlot === 'A' ? leftPanel : rightPanel;
      const sid = panel?.sessionId;
      const uid = panel?.arenaUserId ?? null;
      if (sid && uid) {
        setRemoteParticipantAudio(sid, false);
        channelRef.current
          ?.send({
            type: 'broadcast',
            event: 'mediator_mute_challenger',
            payload: { targetUserId: uid, muted: true },
          })
          .catch(() => {});
      }
    }
    channelRef.current
      ?.send({ type: 'broadcast', event: 'speaking_turn', payload: { action: 'pause' } })
      .catch(() => {});
  }, [
    speakingTurnActive,
    isHost,
    hotMicSpeakerSlot,
    leftPanel,
    rightPanel,
    setRemoteParticipantAudio,
  ]);

  const resumeSpeakingTurn = useCallback(() => {
    if (!speakingTurnActive) return;
    setSpeakingTurnPaused(false);
    if (isHost && hotMicSpeakerSlot) {
      const panel = hotMicSpeakerSlot === 'A' ? leftPanel : rightPanel;
      const sid = panel?.sessionId;
      const uid = panel?.arenaUserId ?? null;
      if (sid && uid) {
        setRemoteParticipantAudio(sid, true);
        channelRef.current
          ?.send({
            type: 'broadcast',
            event: 'mediator_mute_challenger',
            payload: { targetUserId: uid, muted: false },
          })
          .catch(() => {});
      }
    }
    channelRef.current
      ?.send({ type: 'broadcast', event: 'speaking_turn', payload: { action: 'resume' } })
      .catch(() => {});
  }, [
    speakingTurnActive,
    isHost,
    hotMicSpeakerSlot,
    leftPanel,
    rightPanel,
    setRemoteParticipantAudio,
  ]);

  const restartSpeakingTurn = useCallback(() => {
    if (!hotMicSpeakerSlot) return;
    const slot = hotMicSpeakerSlot;
    const dur = speakingTurnDuration;
    stopTimer();
    window.setTimeout(() => {
      startHotMicTurn(slot, dur, { force: true });
    }, 0);
  }, [hotMicSpeakerSlot, speakingTurnDuration, stopTimer, startHotMicTurn]);

  useEffect(() => {
    stopTimerRef.current = stopTimer;
  }, [stopTimer]);

  const speakingTurnPausedRef = useRef(false);
  useEffect(() => {
    speakingTurnPausedRef.current = speakingTurnPaused;
  }, [speakingTurnPaused]);

  // Compte à rebours du tour (+ budget « temps challengers » si débat structuré, sans grignoter le chrono global du beef)
  useEffect(() => {
    if (!speakingTurnActive || !speakingTurnTarget) return;

    speakingTurnIntervalRef.current = setInterval(() => {
      if (mediatorHoldingFloor || speakingTurnPausedRef.current) return;

      setSpeakingTurnRemaining((prev) => {
        if (prev <= 1) {
          stopTimer();
          if (isHost) {
            toast('Temps de parole écoulé — donne la parole au suivant quand tu es prêt.', 'info');
          }
          return 0;
        }
        return prev - 1;
      });

      if (structuredDebateEnabled && isHost && !speakingTurnPausedRef.current) {
        setChallengerBudgetRemaining((prev) => Math.max(0, prev - 1));
      }
    }, 1000);

    return () => {
      if (speakingTurnIntervalRef.current) clearInterval(speakingTurnIntervalRef.current);
    };
  }, [
    speakingTurnActive,
    speakingTurnTarget,
    structuredDebateEnabled,
    mediatorHoldingFloor,
    toast,
    stopTimer,
    isHost,
  ]);

  /** Micro challengers : hot mic (tour actif) même hors débat structuré ; sinon règles structurées. */
  useEffect(() => {
    if (isViewer || isHost || !isJoined) return;
    if (micMutedByMediator) {
      setLocalAudioEnabled(false);
      return;
    }
    if (mediatorHoldingFloor) {
      setLocalAudioEnabled(false);
      return;
    }
    const floorHotMic =
      speakingTurnActive &&
      speakingTurnTarget &&
      (speakingTurnTarget === userId || speakingTurnTarget === localParticipant?.arenaUserId);
    if (speakingTurnActive && speakingTurnTarget) {
      setLocalAudioEnabled(!!floorHotMic);
      return;
    }
    if (!structuredDebateEnabled) {
      setLocalAudioEnabled(true);
      return;
    }
    setLocalAudioEnabled(false);
  }, [
    isViewer,
    isHost,
    isJoined,
    micMutedByMediator,
    mediatorHoldingFloor,
    structuredDebateEnabled,
    speakingTurnActive,
    speakingTurnTarget,
    userId,
    localParticipant?.arenaUserId,
    setLocalAudioEnabled,
  ]);

  const toggleMute = (debaterId: string) => {
    setDebaters((prev) => {
      const next = prev.map((d) => (d.id === debaterId ? { ...d, isMuted: !d.isMuted } : d));
      const row = next.find((d) => d.id === debaterId);
      if (row && channelRef.current) {
        void channelRef.current.send({
          type: 'broadcast',
          event: 'mediator_mute_challenger',
          payload: { targetUserId: debaterId, muted: row.isMuted },
        });
      }
      return next;
    });
  };

  const acceptRequest = (request: ParticipationRequest) => {
    // Add to debaters list
    setDebaters([...debaters, {
      id: request.user_id,
      name: request.user_name,
      isMuted: true,
      speakingTime: 0,
    }]);
    // Remove from requests
    setParticipationRequests(participationRequests.filter(r => r.id !== request.id));
  };

  const rejectRequest = (requestId: string) => {
    setParticipationRequests(participationRequests.filter(r => r.id !== requestId));
  };

  const removeDebater = (debaterId: string) => {
    setDebaters(debaters.filter(d => d.id !== debaterId));
  };

  const inviteDebater = async () => {
    if (!inviteInput.trim()) return;
    const username = inviteInput.startsWith('@') ? inviteInput.substring(1) : inviteInput;

    if (debaters.some(d => d.name === username)) {
      toast('Ce débatteur est déjà dans le débat', 'info');
      return;
    }

    // Find user in DB
    const { data: foundUser } = await supabase
      .from('users')
      .select('id, username, display_name')
      .or(`username.eq.${username},display_name.eq.${username}`)
      .limit(1)
      .maybeSingle();

    if (!foundUser) {
      toast('Utilisateur introuvable', 'error');
      return;
    }

    // Insert invitation + participant
    await supabase.from('beef_participants').upsert({
      beef_id: roomId,
      user_id: foundUser.id,
      role: 'participant',
      is_main: false,
      invite_status: 'pending',
    }, { onConflict: 'beef_id,user_id' });

    await supabase.from('beef_invitations').insert({
      beef_id: roomId,
      inviter_id: userId,
      invitee_id: foundUser.id,
      status: 'sent',
    });

    setDebaters([...debaters, {
      id: foundUser.id,
      name: foundUser.display_name || foundUser.username || username,
      isMuted: true,
      speakingTime: 0,
    }]);
    setInviteInput('');
    toast(`Invitation envoyée à ${foundUser.display_name || foundUser.username}`, 'success');
  };

  const handleInviteFromModal = async (invitedUserId: string) => {
    await supabase.from('beef_participants').upsert({
      beef_id: roomId,
      user_id: invitedUserId,
      role: 'participant',
      is_main: false,
      invite_status: 'pending',
    }, { onConflict: 'beef_id,user_id' });

    await supabase.from('beef_invitations').insert({
      beef_id: roomId,
      inviter_id: userId,
      invitee_id: invitedUserId,
      status: 'sent',
    });

    // Fetch user info for local debaters list
    const { data: invitedUser } = await supabase
      .from('users')
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
  };

  const openProfile = async (username: string, knownUserId?: string | null) => {
    const cacheKey =
      knownUserId && isValidArenaUserId(knownUserId) ? knownUserId : username;
    if (cacheKey && profileCache.current[cacheKey]) {
      const p = profileCache.current[cacheKey];
      setSelectedProfile(p);
      if (userId && p.id) {
        const { data: row } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', p.id)
          .maybeSingle();
        setProfileFollowsTarget(!!row);
      }
      setShowProfile(true);
      return;
    }

    type UserRow = { id: string; username: string; display_name: string | null; bio: string | null; created_at: string };
    let data: UserRow | null = null;

    if (knownUserId && isValidArenaUserId(knownUserId)) {
      const { data: d } = await supabase
        .from('users')
        .select('id, username, display_name, bio, created_at')
        .eq('id', knownUserId)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const { data: d } = await supabase
        .from('users')
        .select('id, username, display_name, bio, created_at')
        .eq('username', username)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const { data: d } = await supabase
        .from('users')
        .select('id, username, display_name, bio, created_at')
        .eq('display_name', username)
        .maybeSingle();
      data = d as UserRow | null;
    }

    if (!data) {
      toast('Profil introuvable', 'error');
      return;
    }

    const { count: followerCount } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('following_id', data.id);

    const { count: debateCount } = await supabase
      .from('beefs')
      .select('*', { count: 'exact', head: true })
      .eq('mediator_id', data.id);

    const { data: myFollow } = userId
      ? await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', userId)
          .eq('following_id', data.id)
          .maybeSingle()
      : { data: null };

    const profile: UserProfile = {
      id: data.id,
      username: data.username,
      displayName: data.display_name || data.username,
      bio: data.bio || '',
      isPrivate: false,
      joinedDate: data.created_at?.split('T')[0] || '',
      stats: {
        debates: debateCount ?? 0,
        wins: 0,
        followers: followerCount ?? 0,
        following: 0,
      },
    };
    profileCache.current[data.id] = profile;
    if (username) profileCache.current[username] = profile;
    setSelectedProfile(profile);
    setProfileFollowsTarget(!!myFollow);
    setShowProfile(true);
  };

  const toggleFollowProfileTarget = async () => {
    if (!userId || !selectedProfile || selectedProfile.id === userId) return;
    try {
      if (profileFollowsTarget) {
        await supabase.from('followers').delete().eq('follower_id', userId).eq('following_id', selectedProfile.id);
        setProfileFollowsTarget(false);
        toast('Tu ne suis plus cet utilisateur', 'info');
      } else {
        await supabase.from('followers').insert({ follower_id: userId, following_id: selectedProfile.id });
        setProfileFollowsTarget(true);
        toast('Tu suis cet utilisateur', 'success');
      }
    } catch {
      toast('Impossible de modifier l’abonnement', 'error');
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const cleanContent = sanitizeMessage(chatInput);
    if (!cleanContent) return;

    const senderInitial = userName?.[0]?.toUpperCase() || '?';
    const localKey = `${userName}::${cleanContent}`;
    seenMsgKeys.current.add(localKey);
    setTimeout(() => seenMsgKeys.current.delete(localKey), 5000);
    setChatInput('');

    const { data: inserted, error } = await supabase
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

    if (error || !inserted?.id) {
      seenMsgKeys.current.delete(localKey);
      console.error('[Live] Message insert failed:', error?.message, error);
      toast('Impossible d\'envoyer le message', 'error');
      setChatInput(cleanContent);
      return;
    }

    const localMsg: VisibleMessage = {
      id: inserted.id,
      user_name: userName,
      content: cleanContent,
      timestamp: Date.now(),
      initial: senderInitial,
    };
    setVisibleMessages(prev => [...prev, localMsg].slice(-80));

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'message',
        payload: { user_name: userName, content: cleanContent, initial: senderInitial, id: inserted.id },
      }).catch(() => console.warn('[Live] Message broadcast failed'));
    }
    console.log('[Live] Sending message as:', userName, '| userId:', userId?.slice(0, 8));
  };

  const isUuid = (s: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);

  const handleDeleteMessage = async (messageId: string) => {
    setContextMenuMsg(null);
    if (!isUuid(messageId)) return;
    const { error } = await supabase.from('beef_messages').update({ is_deleted: true }).eq('id', messageId);
    if (error) {
      toast('Suppression impossible', 'error');
      return;
    }
    setVisibleMessages((prev) => prev.filter((m) => m.id !== messageId));
  };

  useEffect(() => {
    if (!contextMenuMsg) return;
    const close = () => setContextMenuMsg(null);
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener('click', close);
    };
  }, [contextMenuMsg]);


  // Join: enregistre le flux pré-acquis puis lance join() via l’effet ci-dessus
  const handleJoin = (preAcquired: MediaStream | null) => {
    setPreJoinMediaStream(preAcquired);
    setHasJoined(true);
  };

  const [isLeaving, setIsLeaving] = useState(false);

  // Leave: for mediators, triggers endBeef. For others, just leave.
  const handleLeave = useCallback(async () => {
    if (beefEndedRef.current) {
      router.replace('/feed');
      return;
    }
    if (isHost) {
      const ok = window.confirm(
        'Mettre fin au beef pour tous les participants ? Cette action est définitive.',
      );
      if (!ok) return;
    }
    setIsLeaving(true);
    if (isHost) {
      await endBeef('Le médiateur a mis fin au beef');
    } else {
      await leave();
      router.replace('/feed');
    }
  }, [leave, router, isHost, endBeef]);

  // Show pre-join screen before entering
  if (!hasJoined) {
    return (
      <div className="w-full h-full relative">
        <PreJoinScreen userName={userName} onJoin={handleJoin} viewerMode={isViewer} />
        {/* Waiting for Daily.co room to be ready */}
        {!dailyRoomUrl && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-brand-400 text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            Préparation de la room vidéo...
          </div>
        )}
      </div>
    );
  }

  // Waiting for join to complete (dailyRoomUrl just became available)
  if (hasJoined && dailyRoomUrl && !isJoined && isJoining) {
    // We're in the process of joining — show arena but with a connecting overlay
  }

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full flex-col bg-[#08080A]">
      {/* Instant black overlay when leaving — hides camera before tracks stop */}
      {isLeaving && !beefEnded && (
        <div className="absolute inset-0 bg-black z-[999] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Déconnexion...</span>
          </div>
        </div>
      )}

      <VerdictConfettiBurst active={verdictConfetti} />
      <RematchVerdictOverlay
        visible={rematchSequence && !beefEnded}
        onDismiss={() => {
          setRematchSequence(false);
          if (rematchExitTimerRef.current) {
            window.clearTimeout(rematchExitTimerRef.current);
            rematchExitTimerRef.current = null;
          }
          router.push(`/beef/${roomId}/summary`);
        }}
      />

      {isViewer && previewPaywall && liveContinuationPrice > 0 && (
        <div
          className="absolute inset-0 z-[2500] flex items-center justify-center bg-black/95 backdrop-blur-xl p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paywall-preview-title"
        >
          <div className="max-w-md w-full text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-xl bg-brand-500/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-brand-400" strokeWidth={1} aria-hidden />
            </div>
            <h2 id="paywall-preview-title" className="text-xl font-black text-white">Fin de la prévisualisation gratuite</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Les {freePreviewMinutes} premières minutes sont offertes. Pour la suite du direct, utilise tes points.
            </p>
            <div className="rounded-xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left space-y-3">
              <p className="text-center text-white text-sm font-semibold">
                Accès suite du direct :{' '}
                <span className="text-brand-400 font-black tabular-nums">{liveContinuationPrice}</span>
                <span className="text-gray-400 font-medium"> pts</span>
              </p>
              <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-500 to-amber-400 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((userPoints / Math.max(liveContinuationPrice, 1)) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-center text-xs text-gray-400">
                Ton solde :{' '}
                <span className={userPoints >= liveContinuationPrice ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {userPoints} pts
                </span>
                {userPoints < liveContinuationPrice && (
                  <span className="text-gray-500">
                    {' '}
                    — il manque <span className="text-white font-semibold tabular-nums">{liveContinuationPrice - userPoints}</span> pts
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {userPoints >= liveContinuationPrice ? (
                <button
                  type="button"
                  onClick={handlePayContinuation}
                  disabled={continuationLoading}
                  className="w-full py-3.5 rounded-xl brand-gradient text-black font-bold text-sm disabled:opacity-50"
                >
                  {continuationLoading ? 'Traitement…' : `Débloquer · ${liveContinuationPrice} pts`}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => goBuyPoints()}
                    className="w-full py-3.5 rounded-xl brand-gradient text-black font-bold text-sm"
                  >
                    Recharger des points
                  </button>
                  <button
                    type="button"
                    onClick={handlePayContinuation}
                    disabled={continuationLoading}
                    className="w-full py-2.5 rounded-xl bg-white/10 text-gray-400 text-xs font-semibold disabled:opacity-50"
                  >
                    Réessayer après achat
                  </button>
                </>
              )}
              <button
                type="button"
                onClick={() => router.replace('/feed')}
                className="text-gray-500 text-sm pt-2"
              >
                Quitter le beef
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── END-OF-BEEF SUMMARY SCREEN ── */}
      {beefEnded && endSummary && (
        <div
          className="absolute inset-0 z-[1000] bg-gradient-to-b from-gray-950 via-gray-900 to-black flex flex-col items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beef-end-summary-title"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 20 }}
            className="w-full max-w-sm space-y-6 text-center"
          >
            {/* Header */}
            <div className="space-y-2">
              <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-brand-500 to-orange-500 flex items-center justify-center" aria-hidden>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 id="beef-end-summary-title" className="text-2xl font-bold text-white">Beef terminé</h2>
              <p className="text-sm text-gray-400">{endSummary.endReason}</p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-brand-400">{endSummary.duration}</div>
                <div className="text-xs text-gray-500 mt-1">Durée</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-blue-400">{endSummary.viewers}</div>
                <div className="text-xs text-gray-500 mt-1">Spectateurs</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-green-400">{endSummary.messages}</div>
                <div className="text-xs text-gray-500 mt-1">Messages</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-cobalt-400">{endSummary.votesA + endSummary.votesB}</div>
                <div className="text-xs text-gray-500 mt-1">Votes</div>
              </div>
            </div>

            {/* Vote Result */}
            {(endSummary.votesA + endSummary.votesB > 0) && (
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-xs text-gray-400 mb-2">Résultat des votes</div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-blue-400 w-10 text-right">
                    {Math.round((endSummary.votesA / (endSummary.votesA + endSummary.votesB)) * 100)}%
                  </span>
                  <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full transition-all"
                      style={{ width: `${(endSummary.votesA / (endSummary.votesA + endSummary.votesB)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-red-400 w-10">
                    {Math.round((endSummary.votesB / (endSummary.votesA + endSummary.votesB)) * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
                  router.replace('/feed');
                }}
                className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors"
              >
                Retour au feed
              </motion.button>
              <p className="text-xs text-gray-600">Redirection automatique dans quelques secondes...</p>
            </div>
          </motion.div>
        </div>
      )}

      {/* ── MEDIATOR GRACE PERIOD BANNER ── */}
      {mediatorGraceActive && !beefEnded && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[100] bg-yellow-500/90 backdrop-blur-sm text-black px-4 py-2 rounded-xl flex items-center gap-3 shadow-lg"
        >
          <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold text-center max-w-[min(100vw-2rem,20rem)]">
            Médiateur déconnecté — {mediatorGraceSeconds}s (le direct continue)
          </div>
        </motion.div>
      )}
      {/* ── MEDIATOR WAITING MESSAGE (before mediator joins) ── */}
      {!isHost && !mediatorWasConnectedRef.current && isJoined && !beefEnded && !remoteParticipants.some(p => remoteMatchesMediator(p, host.id, host.name)) && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-16 left-1/2 -translate-x-1/2 z-[100] bg-white/10 backdrop-blur-sm text-white px-5 py-3 rounded-xl flex items-center gap-3 shadow-lg border border-white/10"
        >
          <div className="w-5 h-5 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-medium">
            En attente du médiateur...
          </div>
        </motion.div>
      )}

      {/* ── NETWORK RECONNECTION OVERLAY ── */}
      {isOffline && !beefEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-[90] bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center"
        >
          <div className="w-12 h-12 border-3 border-brand-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-semibold text-lg">Reconnexion en cours...</p>
          <p className="text-gray-400 text-sm mt-1">Vérifie ta connexion internet</p>
        </motion.div>
      )}

      {/* TikTok Live : vidéo zone haute + chat pleine largeur en dessous (sans chevauchement) */}
      <div className="relative flex min-h-0 w-full max-w-full flex-1 flex-col bg-[#08080A]">
        {dailyRoomUrl ? (
          <div
            className="relative z-[1] min-h-0 w-full flex-1 overflow-hidden"
          >
            <div className="pointer-events-none absolute inset-0 z-0 flex h-full w-full flex-row">
              {/* LEFT — Participant A (moitié gauche) */}
              <motion.div
                className="pointer-events-auto relative h-full w-1/2 overflow-hidden bg-[#08080A]"
                animate={
                  rematchSequence
                    ? { x: [0, -5, 5, -4, 4, -3, 3, 0], y: [0, 3, -3, 2, -2, 0] }
                    : { x: 0, y: 0 }
                }
                transition={
                  rematchSequence
                    ? { duration: 0.35, repeat: 22, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
              >
                <div className="pointer-events-none absolute left-4 top-4 z-[22] flex w-[calc(100%-3rem)] items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(leftPanelName, leftPanel?.arenaUserId ?? null);
                    }}
                    className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-left font-mono text-xs font-semibold text-white"
                  >
                    {leftPanelName} ({pulseVoicesA})
                  </button>
                  {userRole === 'viewer' && (
                    <div className="pointer-events-auto relative flex shrink-0 items-center justify-center">
                      <ChallengerSupportHalo side="A" burstKey={supportBurst.A} leader={impactLeader === 'A'} />
                      <PointTrigger
                        count={pulseVoicesA}
                        onPulse={() => handlePulseVoice('A')}
                        interactive
                        hideImpactCount
                        aria-label="Envoyer une voix pour ce challenger"
                      />
                    </div>
                  )}
                </div>
                <AnimatePresence>
                  {leftNeonAudio && (
                    <motion.div
                      key="left-speaking"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute inset-0 z-[4]"
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: [
                            'inset 0 0 32px rgba(0, 240, 255, 0.25)',
                            'inset 0 0 56px rgba(145, 70, 255, 0.35)',
                            'inset 0 0 32px rgba(0, 240, 255, 0.25)',
                          ],
                        }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' && (
                    <motion.div
                      key="left-hotmic-ember"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute inset-0 z-[5] block"
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: speakingTurnPaused
                            ? [
                                'inset 0 0 44px rgba(255,77,0,0.16)',
                                'inset 0 0 58px rgba(255,120,0,0.24)',
                                'inset 0 0 44px rgba(255,77,0,0.16)',
                              ]
                            : [
                                'inset 0 0 38px rgba(255,77,0,0.42)',
                                'inset 0 0 76px rgba(255,85,0,0.62)',
                                'inset 0 0 38px rgba(255,77,0,0.42)',
                              ],
                        }}
                        transition={{
                          duration: speakingTurnPaused ? 3 : 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          opacity: speakingTurnPaused ? [0.18, 0.32, 0.18] : [0.38, 0.62, 0.38],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          background:
                            'radial-gradient(circle at 50% 42%, rgba(255,95,0,0.28) 0%, rgba(255,55,0,0.1) 45%, transparent 70%)',
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={leftPanel?.sessionId ? `vid-left-${leftPanel.sessionId}` : 'empty-left'}
                    className="absolute inset-0"
                    initial={{ opacity: 0.88, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.75 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {leftPanel?.videoTrack ? (
                      <ParticipantVideo
                        videoTrack={leftPanel.videoTrack}
                        audioTrack={leftPanelIsLocal ? undefined : leftPanel.audioTrack}
                        muted={leftPanelIsLocal ? true : leftRemoteAudioMuted}
                        mirror={leftPanelIsLocal}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-cobalt-500/10">
                        <span className="text-5xl font-black text-white/80">
                          {leftPanel ? leftPanelName[0].toUpperCase() : '👤'}
                        </span>
                        {!leftPanel && (
                          <div className="mt-3 flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-md">
                            <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                            <span className="text-white text-[11px] font-semibold tracking-tight">En attente...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                {/* Vote tap overlay — viewers tap to vote for this challenger */}
                {userRole === 'viewer' && (
                  <button
                    type="button"
                    onClick={() => {
                      emitTapSupport('A');
                      castVote('A');
                    }}
                    className="absolute inset-0 z-[5] touch-manipulation"
                    aria-label={`Voter pour ${leftPanelName}`}
                  />
                )}
                {!beefEnded && dailyRoomUrl && (isHost || userRole === 'challenger') && (
                  <button
                    type="button"
                    onClick={() => emitTapSupport('A')}
                    className="absolute inset-0 z-[4] touch-manipulation bg-transparent"
                    aria-label="Envoyer du soutien au challenger A"
                  />
                )}
                {/* Vote guide — first time only */}
                {userRole === 'viewer' && (
                  <div className="absolute top-24 left-1/2 -translate-x-1/2 z-[8] pointer-events-auto">
                    <FeatureGuide
                      id="arena-vote"
                      title="Voter pour un challenger"
                      description="Tape sur l'écran d'un challenger pour voter ! Tu peux changer d'avis à tout moment."
                      position="bottom"
                      suppress={featureGuideSuppress}
                    />
                  </div>
                )}
                {/* Vote flash animation */}
                <AnimatePresence>
                  {voteAnimation === 'A' && (
                    <motion.div
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="absolute inset-0 bg-blue-500/20 z-[6] pointer-events-none"
                    />
                  )}
                </AnimatePresence>
                {speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' && (
                  <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1.5 font-mono text-[11px] font-black tabular-nums text-white shadow-[0_16px_44px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                    {speakingTurnPaused && (
                      <span className="text-[9px] font-black uppercase tracking-tight text-amber-300">Pause</span>
                    )}
                    {Math.floor(speakingTurnRemaining / 60)}:
                    {(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                  </div>
                )}
                {leftPanelIsLocal && !isViewer && (
                  <div className="absolute bottom-3 right-3 z-20 flex gap-1.5">
                    <button
                      type="button"
                      onClick={toggleMic}
                      aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all ${micEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                    >
                      {micEnabled ? (
                        <Mic className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                      ) : (
                        <MicOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={toggleCam}
                      aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all ${camEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                    >
                      {camEnabled ? (
                        <Video className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                      ) : (
                        <VideoOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                      )}
                    </button>
                  </div>
                )}
              </motion.div>

              {/* CENTER — Médiateur (bulle prestige jaune, z-50) */}
              <div className="pointer-events-auto absolute left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-2"
                >
                  <div className="relative">
                    <AnimatePresence>
                      {mediatorNeonAudio && (
                        <motion.div
                          key="mediator-gold-aura"
                          initial={{ opacity: 0, scale: 0.92 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.95 }}
                          className="pointer-events-none absolute -inset-4 rounded-full sm:-inset-5"
                          aria-hidden
                        >
                          {/* Ondes sonores discrètes — or / ambre (médiateur) */}
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ boxShadow: '0 0 0 1px rgba(253,230,138,0.12), 0 0 28px rgba(251,191,36,0.08)' }}
                            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0, 0.45] }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            style={{ boxShadow: '0 0 0 1px rgba(252,211,77,0.1), 0 0 36px rgba(245,158,11,0.06)' }}
                            animate={{ scale: [1, 1.2, 1], opacity: [0.35, 0, 0.35] }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut', delay: 0.35 }}
                          />
                          <motion.div
                            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,rgba(255,220,140,0.38)_0%,rgba(180,120,40,0.12)_45%,transparent_72%)]"
                            animate={{
                              opacity: [0.55, 0.95, 0.55],
                              scale: [1, 1.04, 1],
                            }}
                            transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <motion.div
                            className="absolute inset-0 rounded-full"
                            animate={{
                              boxShadow: [
                                '0 0 20px rgba(255, 200, 100, 0.38)',
                                '0 0 40px rgba(255, 215, 80, 0.58)',
                                '0 0 20px rgba(255, 200, 100, 0.38)',
                              ],
                            }}
                            transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <MediatorSupportHalo burstKey={supportBurst.M} />
                    <button
                      type="button"
                      onClick={() => emitTapSupport('M')}
                      aria-label="Envoyer du soutien au médiateur"
                      className="relative h-[min(170px,32dvh)] w-[min(170px,32dvh)] shrink-0 overflow-hidden rounded-full border-4 border-yellow-300 bg-yellow-500 shadow-[0_0_20px_rgba(255,215,0,0.8)] transition-transform active:scale-[0.98]"
                    >
                      {mediatorParticipant?.videoTrack ? (
                        <ParticipantVideo
                          videoTrack={mediatorParticipant.videoTrack}
                          audioTrack={mediatorIsLocal ? undefined : mediatorParticipant.audioTrack}
                          muted={mediatorIsLocal}
                          mirror={mediatorIsLocal}
                          className="absolute inset-0 h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="font-mono text-3xl font-black text-white md:text-4xl">
                          {mediatorName?.[0]?.toUpperCase() || '·'}
                        </span>
                      )}
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(mediatorName, host.id);
                    }}
                    className="flex max-w-[min(72vw,16rem)] items-center justify-center gap-2 rounded-full bg-black/50 px-3 py-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-opacity hover:opacity-95"
                  >
                    <Award className="h-4 w-4 shrink-0 text-amber-200/90" strokeWidth={1.2} aria-hidden />
                    <span className="max-w-[min(56vw,12rem)] truncate text-center font-mono text-sm font-semibold text-white">
                      {mediatorName}
                    </span>
                  </button>
                </motion.div>
              </div>

              {/* RIGHT — Participant B (moitié droite) */}
              <motion.div
                className="pointer-events-auto relative h-full w-1/2 overflow-hidden border-l border-white/20 bg-[#08080A]"
                animate={
                  rematchSequence
                    ? { x: [0, 5, -5, 4, -4, 3, -3, 0], y: [0, -3, 3, -2, 2, 0] }
                    : { x: 0, y: 0 }
                }
                transition={
                  rematchSequence
                    ? { duration: 0.35, repeat: 22, ease: 'easeInOut' }
                    : { duration: 0.2 }
                }
              >
                <div
                  className={`pointer-events-none absolute right-4 top-4 z-[22] flex w-[calc(100%-3rem)] items-start gap-2 ${userRole === 'viewer' ? 'justify-between' : 'justify-end'}`}
                >
                  {userRole === 'viewer' && (
                    <div className="pointer-events-auto relative flex shrink-0 items-center justify-center">
                      <ChallengerSupportHalo side="B" burstKey={supportBurst.B} leader={impactLeader === 'B'} />
                      <PointTrigger
                        count={pulseVoicesB}
                        onPulse={() => handlePulseVoice('B')}
                        interactive
                        hideImpactCount
                        aria-label="Envoyer une voix pour ce challenger"
                      />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(rightPanelName, rightPanel?.arenaUserId ?? null);
                    }}
                    className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-right font-mono text-xs font-semibold text-white"
                  >
                    {rightPanelName} ({pulseVoicesB})
                  </button>
                </div>
                <AnimatePresence>
                  {rightNeonAudio && (
                    <motion.div
                      key="right-speaking"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute inset-0 z-[4]"
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: [
                            'inset 0 0 32px rgba(255, 0, 80, 0.22)',
                            'inset 0 0 56px rgba(0, 240, 255, 0.28)',
                            'inset 0 0 32px rgba(255, 0, 80, 0.22)',
                          ],
                        }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence>
                  {speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' && (
                    <motion.div
                      key="right-hotmic-ember"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="pointer-events-none absolute inset-0 z-[5] block"
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: speakingTurnPaused
                            ? [
                                'inset 0 0 44px rgba(255,77,0,0.16)',
                                'inset 0 0 58px rgba(255,120,0,0.24)',
                                'inset 0 0 44px rgba(255,77,0,0.16)',
                              ]
                            : [
                                'inset 0 0 38px rgba(255,77,0,0.42)',
                                'inset 0 0 76px rgba(255,85,0,0.62)',
                                'inset 0 0 38px rgba(255,77,0,0.42)',
                              ],
                        }}
                        transition={{
                          duration: speakingTurnPaused ? 3 : 2,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          opacity: speakingTurnPaused ? [0.18, 0.32, 0.18] : [0.38, 0.62, 0.38],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                        style={{
                          background:
                            'radial-gradient(circle at 50% 42%, rgba(255,95,0,0.28) 0%, rgba(255,55,0,0.1) 45%, transparent 70%)',
                        }}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={rightPanel?.sessionId ? `vid-right-${rightPanel.sessionId}` : 'empty-right'}
                    className="absolute inset-0"
                    initial={{ opacity: 0.88, scale: 1.02 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0.75 }}
                    transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                  >
                    {rightPanel?.videoTrack ? (
                      <ParticipantVideo
                        videoTrack={rightPanel.videoTrack}
                        audioTrack={rightPanel.audioTrack}
                        muted={rightRemoteAudioMuted}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-ember-500/10">
                        <span className="text-5xl font-black text-white/80">
                          {rightPanel ? rightPanelName[0].toUpperCase() : '👤'}
                        </span>
                        {!rightPanel && (
                          <div className="mt-3 flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-md">
                            <div className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                            <span className="text-white text-[11px] font-semibold tracking-tight">En attente...</span>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
                {/* Vote tap overlay — viewers tap to vote for this challenger */}
                {userRole === 'viewer' && (
                  <button
                    type="button"
                    onClick={() => {
                      emitTapSupport('B');
                      castVote('B');
                    }}
                    className="absolute inset-0 z-[5] touch-manipulation"
                    aria-label={`Voter pour ${rightPanelName}`}
                  />
                )}
                {!beefEnded && dailyRoomUrl && (isHost || userRole === 'challenger') && (
                  <button
                    type="button"
                    onClick={() => emitTapSupport('B')}
                    className="absolute inset-0 z-[4] touch-manipulation bg-transparent"
                    aria-label="Envoyer du soutien au challenger B"
                  />
                )}
                {/* Vote flash animation */}
                <AnimatePresence>
                  {voteAnimation === 'B' && (
                    <motion.div
                      initial={{ opacity: 0.6 }}
                      animate={{ opacity: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.8 }}
                      className="absolute inset-0 bg-red-500/20 z-[6] pointer-events-none"
                    />
                  )}
                </AnimatePresence>
                {speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' && (
                  <div className="pointer-events-none absolute left-1/2 top-14 z-30 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1.5 font-mono text-[11px] font-black tabular-nums text-white shadow-[0_16px_44px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
                    {speakingTurnPaused && (
                      <span className="text-[9px] font-black uppercase tracking-tight text-amber-300">Pause</span>
                    )}
                    {Math.floor(speakingTurnRemaining / 60)}:
                    {(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </motion.div>

            </div>
            <div className="pointer-events-none absolute inset-0 z-[45]">
              <FlyingReactionsLayer
                  reactions={flyingReactions}
                  onRemove={(id) => setFlyingReactions((prev) => prev.filter((r) => r.id !== id))}
                />
                <AnimatePresence>
                  {giftPrestigeFlash > 0 && (
                    <motion.div
                      key={giftPrestigeFlash}
                      initial={{ opacity: 0.5 }}
                      animate={{ opacity: 0 }}
                      transition={{ duration: 0.9, ease: 'easeOut' }}
                      className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,rgba(251,191,36,0.42),transparent_55%)]"
                    />
                  )}
                </AnimatePresence>
            </div>

            {/* Joining indicator */}
            {isJoining && (
              <div className="absolute inset-0 z-[160] flex items-center justify-center bg-black/60">
                <div className="flex items-center gap-3 rounded-xl bg-black/90 px-6 py-4">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  <span className="font-semibold text-white">Connexion en cours...</span>
                </div>
              </div>
            )}
            {callError && (
              <div className="absolute left-1/2 top-4 z-30 -translate-x-1/2 rounded-xl border border-red-500 bg-red-900/90 px-4 py-2">
                <span className="text-sm text-red-300">⚠️ {callError}</span>
              </div>
            )}
          </div>
        ) : (
        /* Placeholder — même hauteur vidéo que avec room */
        <div
          className="relative z-[1] min-h-0 w-full flex-1 overflow-hidden"
        >
          <div className="pointer-events-none absolute inset-0 z-0 flex h-full w-full flex-row">
          {debaters[0] ? (
            <div className="pointer-events-auto relative h-full w-1/2 overflow-hidden bg-[#08080A]">
              <div className="pointer-events-none absolute left-4 top-4 z-[22] flex w-[calc(100%-2rem)] items-start justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void openProfile(debaters[0].name, debaters[0].id)}
                  className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-left font-mono text-xs font-semibold text-white"
                >
                  {debaters[0].name} ({pulseVoicesA})
                </button>
                {userRole === 'viewer' && (
                  <div className="pointer-events-auto relative flex shrink-0 items-center justify-center">
                    <ChallengerSupportHalo side="A" burstKey={supportBurst.A} leader={impactLeader === 'A'} />
                    <PointTrigger
                      count={pulseVoicesA}
                      onPulse={() => handlePulseVoice('A')}
                      interactive
                      hideImpactCount
                      aria-label="Envoyer une voix pour ce challenger"
                    />
                  </div>
                )}
              </div>
              <div className={`absolute inset-0 flex items-center justify-center bg-cobalt-500/10 text-5xl font-black text-white/80 ${
                speakingTurnTarget === debaters[0]?.id ? 'ring-2 ring-inset ring-green-400' : ''
              }`}>
                👤
              </div>
              <AnimatePresence>
                {speakingTurnTarget === debaters[0]?.id && timerRunning && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute right-4 top-14 z-20 rounded-2xl bg-black/95 px-4 py-2 shadow-2xl backdrop-blur-xl"
                    style={{
                      borderWidth: '3px',
                      borderStyle: 'solid',
                      borderColor: speakingTurnRemaining <= 10 ? '#ef4444' : speakingTurnRemaining <= 30 ? '#fb923c' : '#4ade80'
                    }}
                  >
                    <div className={`text-4xl font-black tabular-nums ${speakingTurnRemaining <= 10 ? 'text-red-500 animate-pulse' : speakingTurnRemaining <= 30 ? 'text-brand-400' : 'text-green-400'}`}>
                      {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="pointer-events-auto relative h-full w-1/2 overflow-hidden bg-[#08080A]">
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-cobalt-500/5">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-5xl"
                >
                  👤
                </motion.div>
                <p className="mt-2 text-[11px] font-medium text-white/50">En attente...</p>
              </div>
            </div>
          )}

          {/* Médiateur — bulle 170px prestige (jaune) */}
          <div className="pointer-events-auto absolute left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
              className="relative flex flex-col items-center gap-2"
            >
              <div className="flex h-[min(170px,32dvh)] w-[min(170px,32dvh)] shrink-0 items-center justify-center rounded-full border-4 border-yellow-300 bg-yellow-500 text-4xl shadow-[0_0_20px_rgba(255,215,0,0.8)]">
                👤
              </div>
              <button
                type="button"
                onClick={() => void openProfile(mediatorName, host.id)}
                className="flex max-w-[min(72vw,16rem)] items-center justify-center gap-2 rounded-full bg-black/50 px-3 py-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-opacity hover:opacity-95"
              >
                <Award className="h-4 w-4 shrink-0 text-amber-200/90" strokeWidth={1.2} aria-hidden />
                <span className="max-w-[min(56vw,12rem)] truncate text-center font-mono text-sm font-semibold text-white">
                  {mediatorName}
                </span>
              </button>
              {/* Debate Title */}
              <div className="relative mt-1">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <AnimatePresence>
                    {showDebateTitle && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0, y: -10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0, opacity: 0, y: -10 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        className="rounded-full bg-gradient-to-r from-cobalt-600/95 via-ember-500/95 to-cobalt-500/95 px-4 py-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.55),0_0_32px_rgba(251,146,60,0.12)] backdrop-blur-2xl"
                      >
                        <h2 className="text-white text-[10px] sm:text-xs font-black text-center drop-shadow-lg">
                          {debateTitle}
                        </h2>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.div>
          </div>

          {debaters[1] ? (
            <div className="pointer-events-auto relative h-full w-1/2 overflow-hidden border-l border-white/20 bg-[#08080A]">
              <div
                className={`pointer-events-none absolute right-4 top-4 z-[22] flex w-[calc(100%-2rem)] items-start gap-2 ${userRole === 'viewer' ? 'justify-between' : 'justify-end'}`}
              >
                {userRole === 'viewer' && (
                  <div className="pointer-events-auto relative flex shrink-0 items-center justify-center">
                    <ChallengerSupportHalo side="B" burstKey={supportBurst.B} leader={impactLeader === 'B'} />
                    <PointTrigger
                      count={pulseVoicesB}
                      onPulse={() => handlePulseVoice('B')}
                      interactive
                      hideImpactCount
                      aria-label="Envoyer une voix pour ce challenger"
                    />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void openProfile(debaters[1].name, debaters[1].id)}
                  className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-right font-mono text-xs font-semibold text-white"
                >
                  {debaters[1].name} ({pulseVoicesB})
                </button>
              </div>
              <div className={`absolute inset-0 flex items-center justify-center bg-ember-500/10 text-5xl font-black text-white/80 ${
                speakingTurnTarget === debaters[1]?.id ? 'ring-2 ring-inset ring-green-400' : ''
              }`}>
                👤
              </div>
              <AnimatePresence>
                {speakingTurnTarget === debaters[1]?.id && timerRunning && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute left-4 top-14 z-20 rounded-2xl bg-black/95 px-4 py-2 shadow-2xl backdrop-blur-xl"
                    style={{
                      borderWidth: '3px',
                      borderStyle: 'solid',
                      borderColor: speakingTurnRemaining <= 10 ? '#ef4444' : speakingTurnRemaining <= 30 ? '#fb923c' : '#4ade80'
                    }}
                  >
                    <div className={`text-4xl font-black tabular-nums ${speakingTurnRemaining <= 10 ? 'text-red-500 animate-pulse' : speakingTurnRemaining <= 30 ? 'text-brand-400' : 'text-green-400'}`}>
                      {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="pointer-events-auto relative h-full w-1/2 overflow-hidden border-l border-white/20 bg-[#08080A]">
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-ember-500/5">
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="text-5xl"
                >
                  👤
                </motion.div>
                <p className="mt-2 text-[11px] font-medium text-white/50">En attente...</p>
              </div>
            </div>
          )}
          </div>
        </div>
        )}

      {/* ── Top Overlay — Header (z-[60] au-dessus bulle médiateur z-50) ── */}
      <div className="absolute left-0 right-0 top-0 z-[60] bg-transparent p-2 sm:p-3">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-transparent lg:from-transparent" />

        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 px-0.5">
          <div className="min-w-0 pl-0.5" aria-hidden />

          {/* Centre : chrono ou badge */}
          <div className="flex items-center justify-center gap-1.5">
            {isJoined && timerActive ? (
              <div
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.45)] transition-colors duration-200 max-lg:backdrop-blur-2xl lg:bg-transparent lg:shadow-none lg:backdrop-blur-none lg:hover:shadow-[0_0_28px_rgba(59,130,246,0.4)] ${
                timerPaused
                  ? 'bg-amber-950/88 lg:bg-transparent'
                  : beefTimeRemaining <= 5 * 60
                    ? 'animate-pulse bg-red-950/88 max-lg:animate-pulse lg:bg-transparent'
                    : 'bg-zinc-950/90 lg:bg-transparent'
              }`}
              >
                {timerPaused ? (
                  <Pause className="h-3.5 w-3.5 text-amber-300" strokeWidth={1.2} aria-hidden />
                ) : (
                  <Timer className="h-3.5 w-3.5 text-white" strokeWidth={1.2} aria-hidden />
                )}
                <span className={`text-sm font-bold tabular-nums drop-shadow-sm ${
                  timerPaused
                    ? 'text-amber-200'
                    : beefTimeRemaining <= 5 * 60 ? 'text-red-300' : 'text-white'
                }`}>
                  {formatBeefTime(beefTimeRemaining)}
                </span>
                {timerPaused && (
                  <span className="text-amber-200 text-[10px] font-black animate-pulse ml-0.5">PAUSE</span>
                )}
              </div>
            ) : isJoined && !timerActive && isHost ? (
              <div className="flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1 shadow-[0_8px_28px_rgba(0,0,0,0.4)] max-lg:backdrop-blur-2xl lg:bg-transparent lg:shadow-none lg:backdrop-blur-none lg:transition-colors lg:hover:shadow-[0_0_22px_rgba(59,130,246,0.32)]">
                <span className="text-xs font-medium text-white/55">Pas de chrono</span>
              </div>
            ) : null}
          </div>

          {/* Droite : partage, LIVE, spectateurs, régie ou quitter */}
          <div className="flex min-w-0 items-center justify-end gap-1.5">
            <button
              type="button"
              onClick={onShare}
              aria-label="Partager le direct"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors max-lg:bg-white/[0.06] max-lg:shadow-[0_8px_28px_rgba(0,0,0,0.35)] max-lg:backdrop-blur-2xl lg:bg-transparent lg:hover:shadow-[0_0_22px_rgba(59,130,246,0.35)]"
            >
              <Share2 className="h-[18px] w-[18px] text-white" strokeWidth={1.2} aria-hidden />
            </button>
            {/* LIVE badge */}
            <div className="flex items-center rounded-full bg-red-600/95 px-2 py-0.5 shadow-[0_6px_24px_rgba(220,38,38,0.35)] lg:bg-transparent lg:shadow-[0_0_24px_rgba(239,68,68,0.25)] lg:transition-all lg:hover:shadow-[0_0_28px_rgba(59,130,246,0.38)]">
              <div className={`mr-1 h-1.5 w-1.5 rounded-full ${liveConnected ? 'animate-pulse bg-white' : 'bg-yellow-300'}`} />
              <span className="text-[10px] font-black tracking-wider text-white">LIVE</span>
            </div>
            {/* Viewer count — clickable to show viewer list */}
            <button
              onClick={() => setShowViewerList(true)}
              className="flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors max-lg:bg-white/[0.07] max-lg:shadow-[0_8px_28px_rgba(0,0,0,0.35)] max-lg:backdrop-blur-2xl lg:bg-transparent lg:backdrop-blur-none lg:hover:shadow-[0_0_26px_rgba(59,130,246,0.45)]"
            >
              <Eye className="h-3.5 w-3.5 text-white" strokeWidth={1.2} aria-hidden />
              {liveViewerCount > 0 && (
                <span className="text-[11px] font-bold tabular-nums text-white">{liveViewerCount}</span>
              )}
            </button>
            {isHost ? (
              <button
                type="button"
                onClick={() => setMediatorSidebarOpen((o) => !o)}
                aria-expanded={mediatorSidebarOpen}
                aria-label={
                  mediatorSidebarOpen ? 'Fermer la commande médiateur' : 'Ouvrir la commande médiateur'
                }
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#08080a]/80 text-ember-300 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-md transition-colors hover:bg-ember-500/12 lg:bg-transparent lg:text-white lg:shadow-none lg:backdrop-blur-none lg:hover:text-cobalt-100 lg:hover:shadow-[0_0_26px_rgba(59,130,246,0.42)]"
              >
                <PanelRight className="h-5 w-5" strokeWidth={1.2} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLeave}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 shadow-[0_8px_28px_rgba(0,0,0,0.4)] backdrop-blur-md transition-colors hover:bg-black/50 lg:bg-transparent lg:shadow-none lg:backdrop-blur-none lg:hover:shadow-[0_0_22px_rgba(59,130,246,0.35)] lg:hover:bg-transparent"
              >
                <X className="h-4 w-4 text-white" strokeWidth={1.2} aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Médiateur — barre de commande (privée) — ouverture via bouton header (plus de FAB) ── */}
      {isHost && isJoined && !beefEnded && dailyRoomUrl && (
        <>
          <MediatorSidebar
            open={mediatorSidebarOpen}
            onClose={() => setMediatorSidebarOpen(false)}
            timerActive={timerActive}
            beefTimerPaused={timerPaused}
            onPauseBeefTimer={pauseBeefTimer}
            onResumeBeefTimer={resumeBeefTimer}
            onResetBeefTimer={resetBeefTimerToFull}
            startingBeef={startingBeef}
            onStartBeef={async () => {
              setStartingBeef(true);
              try {
                await startBeefTimer();
              } finally {
                setStartingBeef(false);
              }
            }}
            onVerdict={handleMediatorVerdict}
            remoteRows={mediatorRemoteRows}
            speakingTurnActive={speakingTurnActive}
            speakingTurnPaused={speakingTurnPaused}
            hotMicSpeakerSlot={hotMicSpeakerSlot}
            onHotMic={startHotMicTurn}
            onStopSpeakingTurn={stopTimer}
            onPauseSpeakingTurn={pauseSpeakingTurn}
            onResumeSpeakingTurn={resumeSpeakingTurn}
            onRestartSpeakingTurn={restartSpeakingTurn}
            beefTimeFormatted={formatBeefTime(beefTimeRemaining)}
            onSetChallengerMuted={handleMediatorChallengerMute}
            onEjectParticipant={async (sid) => {
              const ok = await ejectRemoteParticipant(sid);
              if (ok) toast('Participant expulsé', 'success');
              else {
                toast(
                  'Expulsion impossible (participant introuvable ou droits Daily insuffisants).',
                  'error',
                );
              }
            }}
            onAdjustTime={adjustBeefTime}
            mediatorMicEnabled={micEnabled}
            mediatorCamEnabled={camEnabled}
            onMediatorToggleMic={() => void toggleMic()}
            onMediatorToggleCam={() => void toggleCam()}
          />
        </>
      )}

      {/* ── Dock social — pleine largeur, collé au bas, sans chevauchement vidéo ── */}
      {!beefEnded && (
        <div className="relative z-[40] flex h-[28%] min-h-[118px] max-lg:min-h-[132px] w-full shrink-0 flex-col overflow-visible">
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-visible rounded-t-3xl border-x border-t border-white/10 bg-black/40 shadow-2xl backdrop-blur-3xl max-lg:gap-1 lg:flex-row lg:items-stretch lg:gap-6 lg:rounded-t-[2rem] lg:px-4 lg:pt-3 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            aria-live="polite"
          >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-1.5 max-lg:max-h-[min(22dvh,140px)] sm:px-4 sm:py-2 hide-scrollbar [mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.5)_12%,#000_30%)] [-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.5)_12%,#000_30%)] lg:max-h-none"
          >
            {visibleMessages.map((message) => {
              const canDelete =
                isUuid(message.id) && (message.user_name === userName || isHost);
              const clearLongPress = () => {
                if (longPressTimerRef.current) {
                  clearTimeout(longPressTimerRef.current);
                  longPressTimerRef.current = null;
                }
              };
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative flex max-w-full items-start gap-1.5"
                >
                  <div className="pointer-events-none flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cobalt-500/90 to-ember-500/90 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_4px_14px_rgba(0,0,0,0.35)]">
                    <span className="text-[9px] font-bold text-white">{message.initial}</span>
                  </div>
                  <div
                    className={`pointer-events-auto max-w-[calc(100%-2rem)] rounded-2xl bg-[#08080a]/55 px-2 py-1 shadow-[0_6px_24px_rgba(0,0,0,0.4)] backdrop-blur-2xl ${
                      canDelete ? 'cursor-context-menu touch-manipulation' : ''
                    }`}
                    onContextMenu={
                      canDelete
                        ? (e) => {
                            e.preventDefault();
                            setContextMenuMsg(message.id);
                          }
                        : undefined
                    }
                    onTouchStart={
                      canDelete
                        ? () => {
                            clearLongPress();
                            longPressTimerRef.current = setTimeout(() => {
                              longPressTimerRef.current = null;
                              setContextMenuMsg(message.id);
                            }, 550);
                          }
                        : undefined
                    }
                    onTouchEnd={canDelete ? clearLongPress : undefined}
                    onTouchMove={canDelete ? clearLongPress : undefined}
                  >
                    <span className="block font-mono text-[9px] font-bold uppercase tracking-tight text-[#ffffff] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:[text-shadow:0_1px_2px_rgba(0,0,0,0.75)]">
                      {message.user_name}
                    </span>
                    <span className="break-words text-[12px] font-medium leading-snug tracking-tight text-[#ffffff] [text-shadow:0_2px_8px_rgba(0,0,0,0.95),0_1px_2px_rgba(0,0,0,0.85)] sm:[text-shadow:0_1px_2px_rgba(0,0,0,0.85)]">
                      {message.content}
                    </span>
                    {contextMenuMsg === message.id && (
                      <div
                        className="absolute bottom-full left-0 z-[50] mb-1 min-w-[8rem] rounded-xl border border-white/15 bg-black/95 py-1 shadow-xl backdrop-blur-md"
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          className="w-full px-3 py-2 text-left text-sm text-red-300 hover:bg-white/10"
                          onClick={() => handleDeleteMessage(message.id)}
                        >
                          Supprimer
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
          <div className="relative min-w-0 px-2 pb-1.5 pt-0.5 sm:px-3 sm:pb-2 sm:pt-1">
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder="Message..."
              aria-label="Message dans le chat du direct"
              autoComplete="off"
              className="w-full rounded-2xl bg-[#08080a]/65 py-2 pl-2.5 pr-10 text-[13px] font-medium tracking-tight text-white shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] placeholder-white/35 backdrop-blur-2xl focus:outline-none focus:shadow-[0_0_24px_rgba(59,130,246,0.22),0_8px_32px_rgba(0,0,0,0.45)]"
            />
            {chatInput.trim() && (
              <button
                type="button"
                onClick={handleSendMessage}
                aria-label="Envoyer le message"
                className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-xl bg-ember-500 hover:bg-ember-600"
              >
                <Send className="h-3 w-3 text-white" strokeWidth={1} aria-hidden />
              </button>
            )}
            <FeatureGuide
              id="arena-chat"
              title="Chat en direct"
              description="Envoie des messages visibles par tous les viewers et participants."
              position="top"
              suppress={featureGuideSuppress}
            />
          </div>
          </div>
          </div>

          <div
            ref={reactionDockRef}
            className="relative z-[120] flex w-full shrink-0 flex-row flex-wrap items-center justify-center gap-2 overflow-visible border-t border-white/10 px-1 py-1.5 max-lg:justify-evenly lg:w-auto lg:min-w-[10.5rem] lg:flex-col lg:flex-nowrap lg:border-t-0 lg:border-l lg:border-gray-800 lg:px-2 lg:py-2 lg:pl-6"
          >
            {userRole === 'viewer' && (
              <div className="flex flex-wrap justify-center gap-1">
                {SPECTATOR_QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => handleReaction(emoji)}
                    aria-label={`Réaction ${emoji}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-base shadow-[0_4px_18px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform hover:bg-white/10 active:scale-90"
                  >
                    <span aria-hidden>{emoji}</span>
                  </button>
                ))}
              </div>
            )}

            <div className="relative flex flex-wrap items-center justify-center gap-1.5 overflow-visible">
              <AnimatePresence>
                {showAllReactions && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="pointer-events-auto absolute bottom-full right-0 z-[200] mb-2 max-h-[min(50dvh,280px)] w-[min(calc(100vw-1rem),18rem)] max-w-[calc(100vw-1rem)] origin-bottom-right overflow-y-auto overscroll-contain rounded-xl border border-white/[0.1] bg-[#0c0c0f]/98 p-2 pt-1.5 shadow-2xl backdrop-blur-xl sm:left-auto sm:right-0 sm:translate-x-0"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
                      <span className="pl-0.5 text-[11px] font-semibold text-white/75">Réactions</span>
                      <button
                        type="button"
                        onClick={() => setShowAllReactions(false)}
                        aria-label="Fermer le panneau de réactions"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                      </button>
                    </div>
                    <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                      {POPULAR_REACTIONS.map((emoji) => (
                        <button
                          key={emoji}
                          type="button"
                          onClick={() => {
                            handleReaction(emoji);
                            setShowAllReactions(false);
                          }}
                          aria-label={`Réagir avec ${emoji}`}
                          className="flex h-9 w-9 items-center justify-center rounded-xl text-lg hover:bg-white/10 active:scale-90"
                        >
                          <span aria-hidden>{emoji}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <AnimatePresence>
                {showGiftPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.9 }}
                    className="pointer-events-auto absolute bottom-full right-0 z-[200] mb-2 w-[220px] rounded-xl border border-white/12 bg-[#0c0c0f]/98 p-3 pt-2 shadow-2xl backdrop-blur-xl"
                  >
                    <div className="mb-2 flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2">
                      <p className="min-w-0 flex-1 pl-0.5 text-[11px] font-semibold leading-snug text-white/75">
                        Envoyer au médiateur
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowGiftPicker(false)}
                        aria-label="Fermer les cadeaux"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { emoji: '🌹', label: 'Rose', id: 'rose', cost: 10 },
                        { emoji: '🔥', label: 'Fire', id: 'fire', cost: 25 },
                        { emoji: '👑', label: 'Couronne', id: 'crown', cost: 100 },
                        { emoji: '💎', label: 'Diamant', id: 'diamond', cost: 50 },
                      ].map((gift) => (
                        <button
                          key={gift.label}
                          onClick={async () => {
                            if (userPoints < gift.cost) {
                              toast(`Points insuffisants — il te manque ${gift.cost - userPoints} pts (solde ${userPoints})`, 'error', {
                                action: {
                                  label: 'Recharger',
                                  onClick: () => goBuyPoints(),
                                },
                              });
                              return;
                            }

                            try {
                              const {
                                data: { session },
                              } = await supabase.auth.getSession();
                              const res = await fetch('/api/gifts/send', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                  Authorization: `Bearer ${session?.access_token || ''}`,
                                },
                                body: JSON.stringify({
                                  beef_id: roomId,
                                  recipient_id: host.id,
                                  gift_type_id: gift.id,
                                  points_amount: gift.cost,
                                }),
                              });
                              const data = await res.json();
                              if (!res.ok) throw new Error(data.error);
                              setUserPoints(data.newBalance);
                              if (gift.cost >= 50) {
                                setGiftPrestigeFlash((k) => k + 1);
                              }
                              toast(`${gift.emoji} ${gift.label} envoyé !`, 'success');
                            } catch (err: any) {
                              const m = err?.message || "Erreur lors de l'envoi";
                              if (typeof m === 'string' && m.toLowerCase().includes('insuffisant')) {
                                toast(m, 'error', {
                                  action: { label: 'Recharger', onClick: () => goBuyPoints() },
                                });
                              } else {
                                toast(m, 'error');
                              }
                            }
                            setShowGiftPicker(false);
                          }}
                          className="flex flex-col items-center gap-1 rounded-xl bg-white/5 p-2 hover:bg-white/12"
                        >
                          <span className="text-2xl">{gift.emoji}</span>
                          <span className="text-[10px] font-bold text-white">{gift.label}</span>
                          <span className="text-[9px] font-semibold text-ember-400">{gift.cost} pts</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <motion.button
                type="button"
                whileTap={{ scale: 0.92 }}
                transition={{ duration: 0.3 }}
                onClick={() => {
                  setShowGiftPicker(false);
                  setShowAllReactions((v) => !v);
                }}
                aria-label={showAllReactions ? 'Fermer le panneau de réactions' : 'Ouvrir les réactions emoji'}
                aria-expanded={showAllReactions}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-lg shadow-[0_6px_22px_rgba(0,0,0,0.35)] backdrop-blur-md touch-manipulation"
              >
                <span aria-hidden>😀</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.88 }}
                transition={{ duration: 0.3 }}
                onClick={() => handleReaction('❤️')}
                aria-label="Envoyer une réaction cœur"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] shadow-[0_6px_22px_rgba(0,0,0,0.35)] backdrop-blur-md touch-manipulation"
              >
                <Heart className="h-[18px] w-[18px] text-ember-500 fill-ember-500" strokeWidth={1.2} aria-hidden />
              </motion.button>

              <div className="relative flex shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.88 }}
                  transition={{ duration: 0.3 }}
                  onClick={() => {
                    setShowAllReactions(false);
                    setShowGiftPicker((v) => !v);
                  }}
                  aria-label={showGiftPicker ? 'Fermer les cadeaux' : 'Ouvrir les cadeaux'}
                  aria-expanded={showGiftPicker}
                  className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-ember-600/90 to-cobalt-700/80 shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_24px_rgba(251,146,60,0.15)]"
                >
                  <Gift className="h-[18px] w-[18px] text-white" strokeWidth={1.2} aria-hidden />
                </motion.button>
                <FeatureGuide
                  id="arena-gift"
                  title="Envoyer un cadeau"
                  description="Soutiens le médiateur avec des points ! Les cadeaux s'affichent en live."
                  position="top"
                  align="end"
                  suppress={featureGuideSuppress}
                />
              </div>

            </div>
          </div>
        </div>
        </div>
      )}

      </div>

      {/* Invite Participant Modal */}
      <InviteParticipantModal
        isOpen={showInviteModal}
        currentParticipants={debaters.map(d => d.id).concat([userId])}
        onInvite={handleInviteFromModal}
        onClose={() => setShowInviteModal(false)}
      />

      {/* User Profile Modal */}
      <AnimatePresence>
        {showProfile && selectedProfile && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-b from-gray-900 to-black border border-white/20 rounded-xl max-w-md w-full overflow-hidden shadow-2xl"
            >
              {/* Header with gradient */}
              <div className="relative bg-gradient-to-r from-cobalt-600 via-ember-500 to-cobalt-500 p-6">
                <button
                  onClick={() => setShowProfile(false)}
                  className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-1"
                >
                  <X className="w-5 h-5 text-white" strokeWidth={1} />
                </button>
                <div className="flex flex-col items-center">
                  <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-4xl mb-3 border-2 border-white/30">
                    {selectedProfile.avatar || selectedProfile.displayName[0].toUpperCase()}
                  </div>
                  <h2 className="text-white font-black text-xl">{selectedProfile.displayName}</h2>
                  <p className="text-white/80 text-sm">@{selectedProfile.username}</p>
                </div>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                {/* Bio */}
                {selectedProfile.bio && (
                  <div>
                    <p className="text-white/90 text-sm text-center">{selectedProfile.bio}</p>
                  </div>
                )}

                {/* Stats */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                    <div className="text-2xl font-black text-white">{selectedProfile.stats.debates}</div>
                    <div className="text-xs text-white/60">Débats</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                    <div className="text-2xl font-black text-green-400">{selectedProfile.stats.wins}</div>
                    <div className="text-xs text-white/60">Victoires</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                    <div className="text-2xl font-black text-ember-400">{selectedProfile.stats.followers}</div>
                    <div className="text-xs text-white/60">Abonnés</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 text-center border border-white/10">
                    <div className="text-2xl font-black text-blue-400">{selectedProfile.stats.following}</div>
                    <div className="text-xs text-white/60">Abonnements</div>
                  </div>
                </div>

                {/* Member since */}
                <div className="text-center text-white/40 text-xs">
                  Membre depuis {new Date(selectedProfile.joinedDate).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {userId && selectedProfile.id !== userId && (
                      <button
                        type="button"
                        onClick={() => void toggleFollowProfileTarget()}
                        className={`flex-1 font-bold py-2.5 rounded-xl transition-colors ${
                          profileFollowsTarget
                            ? 'bg-white/15 text-white border border-white/25 hover:bg-white/25'
                            : 'bg-gradient-to-r from-ember-500 to-cobalt-500 text-white hover:from-ember-400 hover:to-cobalt-400'
                        }`}
                      >
                        {profileFollowsTarget ? 'Abonné ✓' : 'Suivre'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setShowProfile(false);
                        router.push('/messages');
                      }}
                      className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl border border-white/20"
                    >
                      Message
                    </button>
                  </div>
                  {userId && selectedProfile.id !== userId && (
                    <button
                      type="button"
                      onClick={() => {
                        setReportTargetUser({
                          id: selectedProfile.id,
                          userName: selectedProfile.username,
                        });
                        setShowReportModal(true);
                        setShowProfile(false);
                      }}
                      className="w-full rounded-xl border border-white/15 bg-transparent py-2 text-[13px] font-semibold text-white/55 transition-colors hover:border-ember-500/40 hover:text-ember-300/95"
                    >
                      Signaler ou bloquer
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Viewer List Modal */}
      {showViewerList && (
        <ViewerListModal
          viewers={remoteParticipants.map(p => ({ userName: p.userName }))}
          viewerCount={liveViewerCount}
          onClose={() => setShowViewerList(false)}
        />
      )}

      {showReportModal && reportTargetUser && (
        <ReportBlockModal
          userId={reportTargetUser.id}
          userName={reportTargetUser.userName}
          onClose={() => {
            setShowReportModal(false);
            setReportTargetUser(null);
          }}
        />
      )}

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}
