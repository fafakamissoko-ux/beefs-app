'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Gift,
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
  Sliders,
  Calendar,
  Flame,
} from 'lucide-react';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { ChatPanel } from './ChatPanel';
import { PreJoinScreen } from './PreJoinScreen';
import { ParticipantVideo } from './ParticipantVideo';
import { FeatureGuide } from './FeatureGuide';
import { ViewerListModal } from './ViewerListModal';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { useDailyCall } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';
import { DEFAULT_FREE_PREVIEW_MINUTES, viewerNeedsContinuationPay } from '@/lib/beef-preview';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import { escapeForIlikeExact } from '@/lib/ilike-exact';
import { PENDING_DM_WITH_STORAGE_KEY } from '@/lib/messages-deeplink';
import { ARENA_QUICK_REACTIONS } from '@/lib/arena-quick-reactions';
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
  type FlyingReactionEntry,
} from './FlyingReactionsLayer';
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

/** Bandeau mobile : 10 emojis scroll ; desktop : grille 2×5 + panneau 😀 pour le reste. */

const HEART_ON_FIRE = '❤️‍🔥';

const STRIP_SET = new Set<string>(ARENA_QUICK_REACTIONS);

const PICKER_REACTIONS = POPULAR_REACTIONS.filter((e) => {
  if (STRIP_SET.has(e)) return false;
  if (e === '❤️' || e === HEART_ON_FIRE) return false;
  return true;
});

/** Cœur / pouce : particules sur l’anneau du challenger (pas d’emoji flottant). */
const INTEGRATED_SUPPORT_REACTIONS = new Set<string>(['❤️', HEART_ON_FIRE, '👍']);

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
  avatarUrl: string | null;
  bio?: string;
  isPrivate: boolean;
  joinedDate: string;
  stats: {
    mediations: number;
    participations: number;
    followers: number;
    following: number;
    points: number;
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

  // ── AURA "FERVEUR SOCIALE" ──
  const [auraA, setAuraA] = useState(0);
  const [auraB, setAuraB] = useState(0);
  const [auraMed, setAuraMed] = useState(0);
  const [auraFeverMed, setAuraFeverMed] = useState(false);
  /** null = 50/50, A ou B = ce panneau occupe ~80 % de la largeur (synchronisé en broadcast pour tous) */
  const [focusTarget, setFocusTarget] = useState<null | 'A' | 'B'>(null);
  const focusTargetRef = useRef<null | 'A' | 'B'>(null);
  useEffect(() => {
    focusTargetRef.current = focusTarget;
  }, [focusTarget]);

  const [pendingInvites, setPendingInvites] = useState<Array<{ userId: string; label: string }>>([]);
  const [parolePresetSec, setParolePresetSec] = useState(60);
  const [announcementTicker, setAnnouncementTicker] = useState('');
  const [gloryChallengerSlot, setGloryChallengerSlot] = useState<null | 'A' | 'B'>(null);

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
  /** Évite de spammer le toast « challengers partis » tant que la room reste vide */
  const challengersAllLeftNotifiedRef = useRef(false);
  /** Sync DB status → live quand la salle est active (sans attendre « Démarrer le chrono »). */
  const autoLiveSyncedRef = useRef(false);
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
  /** Portail body : cadeaux / panneau réactions au-dessus de la vidéo (z-50) */
  const [dockPickersMounted, setDockPickersMounted] = useState(false);
  const [dockPickerPos, setDockPickerPos] = useState<{ bottom: number; right: number } | null>(null);
  /** Colonne emoji / cadeaux / partage — fermeture au tap extérieur */
  const reactionDockRef = useRef<HTMLDivElement>(null);
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const announcementClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setDockPickersMounted(true);
  }, []);

  const measureDockPickerPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!showAllReactions && !showGiftPicker) {
      setDockPickerPos(null);
      return;
    }
    const el = reactionDockRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setDockPickerPos({
      bottom: Math.max(8, window.innerHeight - r.top + 8),
      right: Math.max(8, window.innerWidth - r.right),
    });
  }, [showAllReactions, showGiftPicker]);

  useLayoutEffect(() => {
    measureDockPickerPosition();
    const id = window.requestAnimationFrame(() => measureDockPickerPosition());
    return () => window.cancelAnimationFrame(id);
  }, [measureDockPickerPosition]);

  useEffect(() => {
    if (!showAllReactions && !showGiftPicker) return;
    const ro = () => measureDockPickerPosition();
    window.addEventListener('resize', ro);
    window.visualViewport?.addEventListener('resize', ro);
    window.visualViewport?.addEventListener('scroll', ro);
    return () => {
      window.removeEventListener('resize', ro);
      window.visualViewport?.removeEventListener('resize', ro);
      window.visualViewport?.removeEventListener('scroll', ro);
    };
  }, [showAllReactions, showGiftPicker, measureDockPickerPosition]);

  useEffect(() => {
    if (!showAllReactions && !showGiftPicker) return;
    const onPointerDown = (e: PointerEvent) => {
      const root = reactionDockRef.current;
      const target = e.target;
      if (root?.contains(target as Node)) return;
      if (target instanceof Element && target.closest('[data-arena-dock-popover]')) return;
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

  const scrollChatToEnd = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = chatMessagesScrollRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
        chatMessagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
      });
    });
  }, []);

  useLayoutEffect(() => {
    scrollChatToEnd();
  }, [visibleMessages, scrollChatToEnd]);

  /** Clavier mobile (visualViewport) : la hauteur du dock change — rescroll + évite masque qui « mange » les bulles. */
  useEffect(() => {
    const vv = window.visualViewport;
    const onLayoutChange = () => scrollChatToEnd();
    vv?.addEventListener('resize', onLayoutChange);
    vv?.addEventListener('scroll', onLayoutChange);
    window.addEventListener('resize', onLayoutChange);
    return () => {
      vv?.removeEventListener('resize', onLayoutChange);
      vv?.removeEventListener('scroll', onLayoutChange);
      window.removeEventListener('resize', onLayoutChange);
    };
  }, [scrollChatToEnd]);

  useEffect(() => {
    if (!gloryChallengerSlot) return;
    const t = setTimeout(() => setGloryChallengerSlot(null), 15_000);
    return () => clearTimeout(t);
  }, [gloryChallengerSlot]);

  // Moderator controls — check if current user is the beef creator
  const isHost = userId === host.id;

  const fetchPendingInvites = useCallback(async () => {
    if (!isHost) return;
    type ParticipantPendingRow = {
      user_id: string;
      users:
        | { username: string | null; display_name: string | null }
        | { username: string | null; display_name: string | null }[]
        | null;
    };
    const { data, error } = await supabase
      .from('beef_participants')
      .select('user_id, users(username, display_name)')
      .eq('beef_id', roomId)
      .eq('invite_status', 'pending');
    if (error) {
      console.warn('[Live] Invités en attente:', error.message);
      return;
    }
    const raw = (data ?? []) as unknown as ParticipantPendingRow[];
    setPendingInvites(
      raw.map((r) => {
        const uJoin = r.users;
        const u = Array.isArray(uJoin) ? uJoin[0] : uJoin;
        return {
          userId: r.user_id,
          label:
            (u?.display_name && u.display_name.trim()) ||
            (u?.username && u.username.trim()) ||
            'Invité',
        };
      }),
    );
  }, [isHost, roomId]);

  useEffect(() => {
    if (!isHost || !mediatorSidebarOpen) return;
    void fetchPendingInvites();
  }, [isHost, mediatorSidebarOpen, fetchPendingInvites]);

  useEffect(() => {
    if (!isHost || !roomId) return;
    const ch = supabase
      .channel(`beef_participants_live_${roomId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beef_participants',
          filter: `beef_id=eq.${roomId}`,
        },
        () => {
          void fetchPendingInvites();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isHost, roomId, fetchPendingInvites]);

  const goBuyPoints = useCallback(() => {
    openBuyPointsPage(router);
  }, [router]);

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
  /** Sérialise les INSERT chat pour éviter les rafales concurrentes côté RLS. */
  const messageSendChainRef = useRef(Promise.resolve());

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
    void channelRef.current
      .send({
        type: 'broadcast',
        event: 'video_focus',
        payload: { target: focusTargetRef.current },
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

  // ── Aura decay (−1 toutes les 500ms) ──
  const auraFeverRef = useRef(false);
  useEffect(() => { auraFeverRef.current = auraFeverMed; }, [auraFeverMed]);

  useEffect(() => {
    const iv = setInterval(() => {
      setAuraA((v) => Math.max(0, v - 1));
      setAuraB((v) => Math.max(0, v - 1));
      if (!auraFeverRef.current) {
        setAuraMed((v) => Math.max(0, v - 1));
      }
    }, 500);
    return () => clearInterval(iv);
  }, []);

  // Auto-Fever médiateur : 15 s puis reset — deps SANS auraFeverMed sinon le cleanup annule le timer dès que fever passe à true
  useEffect(() => {
    if (auraMed < 100) return;
    setAuraFeverMed(true);
    const t = setTimeout(() => {
      setAuraFeverMed(false);
      setAuraMed(0);
    }, 15_000);
    return () => clearTimeout(t);
  }, [auraMed]);

  const auraIntensityA = Math.round(15 + (auraA / 100) * 45);
  const auraOpacityA = (0.2 + (auraA / 100) * 0.6).toFixed(2);
  const auraIntensityB = Math.round(15 + (auraB / 100) * 45);
  const auraOpacityB = (0.2 + (auraB / 100) * 0.6).toFixed(2);
  const auraIntensityMed = Math.round(20 + (auraMed / 100) * 50);
  const auraOpacityMed = (0.3 + (auraMed / 100) * 0.7).toFixed(2);

  /** Aura prestige-gold — cadre sponsor : les gains remontent au Host quand un soutien financier est détecté.
   *  TODO: brancher sur l'événement gift broadcast ; pour l'instant, activé par l'aura A ou B > 60. */
  const sponsorAuraActive = auraA > 60 || auraB > 60;
  const sponsorGlow = sponsorAuraActive
    ? 'shadow-[0_0_32px_rgba(212,175,55,0.25),inset_0_0_18px_rgba(212,175,55,0.08)]'
    : '';

  /** Pas de bulles « onboarding » quand la salle est déjà active ou pendant la connexion Daily */
  const featureGuideSuppress =
    isJoining ||
    (isJoined && (remoteParticipants.length > 0 || timerActive));

  useEffect(() => {
    challengersEverJoinedRef.current = false;
    autoLiveSyncedRef.current = false;
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

    // Challengers partis, médiateur toujours présent : ne pas terminer le beef — notification unique.
    if (
      isHost &&
      challengerUserIds.length > 0 &&
      challengersEverJoinedRef.current &&
      remoteParticipants.length === 0 &&
      isJoined
    ) {
      if (!challengersAllLeftNotifiedRef.current) {
        challengersAllLeftNotifiedRef.current = true;
        toast('Les challengers ont quitté la room — le direct continue. Tu peux terminer le beef depuis la régie.', 'info');
      }
    } else if (remoteParticipants.length > 0) {
      challengersAllLeftNotifiedRef.current = false;
    }
  }, [remoteParticipants, isJoined, isHost, host.id, host.name, participantRoles, mediatorGraceActive, toast]);

  // Mediator leaving triggers endBeef
  const handleLeaveAsMediator = useCallback(async () => {
    if (isHost) {
      await endBeef('Le médiateur a mis fin au beef');
    }
  }, [isHost, endBeef]);

  // Load beef participants from Supabase to map roles (noms via user_public_profile, pas users)
  useEffect(() => {
    const loadParticipants = async () => {
      const { data } = await supabase
        .from('beef_participants')
        .select('user_id, role, is_main')
        .eq('beef_id', roomId);

      if (!data?.length) {
        setParticipantRoles({});
        return;
      }

      const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
      const ids = data.map((p) => p.user_id).filter(Boolean);
      const pubMap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name');

      const roles: Record<string, BeefParticipantRowMeta> = {};
      data.forEach((p) => {
        const row = p as { user_id: string; role: string };
        const u = pubMap.get(row.user_id);
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

  const hasExpectedChallengers = useMemo(
    () => Object.keys(participantRoles).some((uid) => uid !== host.id),
    [participantRoles, host.id],
  );

  /** Spectateur : LIVE « chaud » dès qu’un challenger attendu est dans la room ; repli si rôles pas encore chargés. */
  const challengerOnAir = useMemo(() => {
    const matched = remoteParticipants.some((p) => {
      if (remoteMatchesMediator(p, host.id, host.name)) return false;
      return matchRemoteToExpectedBeefParticipant(p, host.id, host.name, participantRoles) !== null;
    });
    if (matched) return true;
    if (!isViewer) return false;
    const nonMediator = remoteParticipants.filter(
      (p) => !remoteMatchesMediator(p, host.id, host.name),
    );
    if (nonMediator.length === 0) return false;
    if (!hasExpectedChallengers) return true;
    return false;
  }, [remoteParticipants, host.id, host.name, participantRoles, isViewer, hasExpectedChallengers]);

  const liveBadgeHot = isViewer ? challengerOnAir : isJoined;

  // Video layout: determine which participant goes in each slot based on role
  const hostRemoteParticipant = !isHost
    ? remoteParticipants.find(p => remoteMatchesMediator(p, host.id, host.name)) ?? null
    : null;

  /**
   * Remotes qui correspondent à des challengers attendus (beef_participants), pas le médiateur ni un inconnu.
   * Ordre stable : tri parent (participant d’abord). Slots A/B = [0] et [1].
   * Exclut le participant local (challenger ou spectateur) pour ne jamais dupliquer le même flux sur les deux dalles.
   */
  const challengerRemoteSlots = useMemo(() => {
    const matched = sortedRemoteParticipants.filter(
      (p) => matchRemoteToExpectedBeefParticipant(p, host.id, host.name, participantRoles) !== null,
    );
    const withoutSelf = !localParticipant?.sessionId
      ? matched
      : matched.filter((p) => p.sessionId !== localParticipant.sessionId);
    if (withoutSelf.length > 0 || Object.keys(participantRoles).length > 0) {
      return withoutSelf;
    }
    /* Rôles beef pas encore hydratés : exclure uniquement le médiateur + le local (évite deux fois le même challenger). */
    const naive = sortedRemoteParticipants.filter(
      (p) => !remoteMatchesMediator(p, host.id, host.name),
    );
    return !localParticipant?.sessionId
      ? naive
      : naive.filter((p) => p.sessionId !== localParticipant.sessionId);
  }, [
    sortedRemoteParticipants,
    host.id,
    host.name,
    participantRoles,
    localParticipant?.sessionId,
  ]);

  const leftPanel = isHost
    ? challengerRemoteSlots[0] ?? null
    : isViewer
      ? challengerRemoteSlots[0] ?? null
      : localParticipant;
  const leftPanelIsLocal = !isHost && !isViewer;
  const leftPanelName = isHost
    ? (challengerRemoteSlots[0]?.userName || 'Challenger 1')
    : isViewer
      ? (challengerRemoteSlots[0]?.userName || 'Challenger 1')
      : userName;

  const rightPanel = isHost
    ? challengerRemoteSlots[1] ?? null
    : isViewer
      ? challengerRemoteSlots[1] ?? null
      : challengerRemoteSlots[0] ?? null;
  /** Si le flux local Daily est mappé sur le panneau droit (rare mais possible selon l’ordre des peers). */
  const rightPanelIsLocal =
    !isHost &&
    !isViewer &&
    !!localParticipant &&
    !!rightPanel &&
    rightPanel.sessionId === localParticipant.sessionId;
  const rightPanelName = isHost
    ? (challengerRemoteSlots[1]?.userName || 'Challenger 2')
    : isViewer
      ? (challengerRemoteSlots[1]?.userName || 'Challenger 2')
      : (challengerRemoteSlots[0]?.userName || 'Challenger 2');

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
  /** Micro du médiateur (local ou distant) — bulle prestige « audio-reactive ». */
  const mediatorMicEnabled = mediatorIsLocal ? micEnabled : !!mediatorParticipant?.audioOn;

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

  const gloryIntenseA =
    gloryChallengerSlot === 'A' &&
    speakingTurnActive &&
    effectiveHotMicSpeakerSlot === 'A' &&
    !speakingTurnPaused;
  const gloryIntenseB =
    gloryChallengerSlot === 'B' &&
    speakingTurnActive &&
    effectiveHotMicSpeakerSlot === 'B' &&
    !speakingTurnPaused;

  // Multi-participant system
  const [ringParticipants, setRingParticipants] = useState<RingParticipant[]>([]);
  const [participationRequests, setParticipationRequests] = useState<ParticipationRequest[]>([]);
  const [debaters, setDebaters] = useState<Debater[]>([]);
  const inviteExcludeParticipantIds = useMemo(
    () => Array.from(new Set([...debaters.map((d) => d.id), userId].filter(Boolean))),
    [debaters, userId],
  );
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

  useEffect(() => {
    if (!isHost || !isJoined || !liveConnected || beefEnded || !roomId) return;
    if (autoLiveSyncedRef.current) return;
    if (remoteParticipants.length < 1) return;

    let cancelled = false;
    void (async () => {
      const { data: row } = await supabase
        .from('beefs')
        .select('status')
        .eq('id', roomId)
        .maybeSingle();
      if (cancelled || !row) return;
      const s = String((row as { status?: string }).status ?? '');
      if (s !== 'pending' && s !== 'ready') return;
      const { error } = await supabase
        .from('beefs')
        .update({ status: 'live' })
        .eq('id', roomId)
        .in('status', ['pending', 'ready']);
      if (!error) autoLiveSyncedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [isHost, isJoined, liveConnected, beefEnded, roomId, remoteParticipants.length]);

  const seenMsgKeys = useRef(new Set<string>());

  const addRemoteMessage = useCallback((msgUserName: string, content: string, initial?: string, dbId?: string) => {
    const key = dbId ? `id:${dbId}` : `${msgUserName}::${content}`;
    if (seenMsgKeys.current.has(key)) return;
    seenMsgKeys.current.add(key);
    const ttlMs = dbId ? 60_000 : 5000;
    setTimeout(() => seenMsgKeys.current.delete(key), ttlMs);
    const msgId = dbId || `m_${Date.now()}_${Math.random()}`;
    const newMsg: VisibleMessage = {
      id: msgId,
      user_name: msgUserName,
      content,
      timestamp: Date.now(),
      initial: initial || msgUserName?.[0]?.toUpperCase() || '?',
    };
    setVisibleMessages((prev) => {
      if (dbId && prev.some((m) => m.id === dbId)) return prev;
      return [...prev, newMsg].slice(-80);
    });
  }, []);

  const addRemoteReaction = useCallback((emoji: string, supportSlot?: 'A' | 'B' | 'M' | null) => {
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && (supportSlot === 'A' || supportSlot === 'B')) {
      setSupportBurst((prev) => ({ ...prev, [supportSlot]: prev[supportSlot] + 1 }));
      if (emoji === '❤️' || emoji === HEART_ON_FIRE) {
        if (supportSlot === 'A') setAuraA((v) => Math.min(100, v + 4));
        else setAuraB((v) => Math.min(100, v + 4));
      }
      return;
    }
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && supportSlot === 'M') {
      setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
      if (emoji === '❤️' || emoji === HEART_ON_FIRE) setAuraMed((v) => Math.min(100, v + 3));
      return;
    }
    const entry = createFlyingReactionEntry(emoji);
    setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
  }, []);

  const emitTapSupport = useCallback((target: 'A' | 'B' | 'M') => {
    if (target === 'M') {
      setSupportBurst((p) => ({ ...p, M: p.M + 1 }));
      setAuraMed((v) => Math.min(100, v + 3));
    } else {
      setSupportBurst((p) => ({ ...p, [target]: p[target] + 1 }));
      if (target === 'A') setAuraA((v) => Math.min(100, v + 4));
      else setAuraB((v) => Math.min(100, v + 4));
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
      .on('broadcast', { event: 'video_focus' }, ({ payload }: { payload?: { target?: unknown } }) => {
        const t = payload?.target;
        if (t === null || t === 'A' || t === 'B') {
          setFocusTarget(t);
        }
      })
      .on('broadcast', { event: 'announcement_banner' }, ({ payload }: { payload?: { text?: string; durationSec?: number } }) => {
        if (isHostRef.current) return;
        const raw = String(payload?.text ?? '').trim();
        if (announcementClearTimerRef.current) {
          clearTimeout(announcementClearTimerRef.current);
          announcementClearTimerRef.current = null;
        }
        if (!raw) {
          setAnnouncementTicker('');
          return;
        }
        const d = Math.max(3, Math.min(120, Math.floor(Number(payload?.durationSec) || 12)));
        setAnnouncementTicker(raw);
        announcementClearTimerRef.current = setTimeout(() => {
          setAnnouncementTicker('');
          announcementClearTimerRef.current = null;
        }, d * 1000);
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
          if (isHostRef.current) {
            void channel
              .send({
                type: 'broadcast',
                event: 'video_focus',
                payload: { target: focusTargetRef.current },
              })
              .catch(() => {});
          }
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
    if (!isHost || !liveConnected || !channelRef.current) return;
    void channelRef.current
      .send({
        type: 'broadcast',
        event: 'video_focus',
        payload: { target: focusTarget },
      })
      .catch(() => {});
  }, [focusTarget, isHost, liveConnected]);

  useEffect(() => {
    if (!liveConnected || !isHost || !timerActive) return;
    broadcastBeefGlobalTimer();
  }, [liveConnected, isHost, timerActive, broadcastBeefGlobalTimer]);

  useEffect(() => {
    if (!liveConnected || !isHost || !timerActive || timerPaused) return;
    const id = window.setInterval(() => broadcastBeefGlobalTimer(), 10_000);
    return () => window.clearInterval(id);
  }, [liveConnected, isHost, timerActive, timerPaused, broadcastBeefGlobalTimer]);

  /** Chat : uniquement les messages du live (pas d’historique DB au join). */
  useEffect(() => {
    if (!roomId) return;
    seenMsgKeys.current.clear();
    setVisibleMessages([]);
  }, [roomId]);

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
          data.forEach((msg) => {
            if (String(msg.user_id) === String(userId)) return;
            addRemoteMessage(msg.display_name || msg.username, msg.content, undefined, msg.id);
          });
        }
      } catch {}
    };

    const interval = setInterval(poll, 8000);
    return () => clearInterval(interval);
  }, [roomId, userId, addRemoteMessage]);

  // 3) Reaction polling fallback — requêtes DB (intervalle large pour limiter la charge réseau)
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

    const interval = setInterval(pollReactions, 8000);
    return () => clearInterval(interval);
  }, [roomId, userId, addRemoteReaction]);

  const handleReaction = (emoji: string) => {
    onReaction(emoji);

    const integrated = INTEGRATED_SUPPORT_REACTIONS.has(emoji);
    const slotAB = (myVote ?? lastPulseSideRef.current ?? 'A') as 'A' | 'B';
    const isHeartEmoji = emoji === '❤️' || emoji === HEART_ON_FIRE;
    const heartTarget: 'A' | 'B' | 'M' =
      isHeartEmoji && speakingTurnActive && effectiveHotMicSpeakerSlot
        ? effectiveHotMicSpeakerSlot
        : isHeartEmoji
          ? 'M'
          : slotAB;

    if (integrated && isHeartEmoji) {
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
            integrated && isHeartEmoji
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
      .from('user_public_profile')
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
    void fetchPendingInvites();
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

    type UserRow = {
      id: string;
      username: string;
      display_name: string | null;
      bio: string | null;
      created_at: string;
      avatar_url: string | null;
      points: number | null;
    };
    let data: UserRow | null = null;

    if (knownUserId && isValidArenaUserId(knownUserId)) {
      const { data: d } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .eq('id', knownUserId)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const term = escapeForIlikeExact(username.trim());
      const { data: d } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .ilike('username', term)
        .maybeSingle();
      data = d as UserRow | null;
    }
    if (!data && username) {
      const term = escapeForIlikeExact(username.trim());
      const { data: rows } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, bio, created_at, avatar_url, points')
        .ilike('display_name', term)
        .limit(1);
      data = (rows?.[0] as UserRow | undefined) ?? null;
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

    const { count: followingCount } = await supabase
      .from('followers')
      .select('*', { count: 'exact', head: true })
      .eq('follower_id', data.id);

    const { data: partRows } = await supabase
      .from('beef_participants')
      .select('beef_id')
      .eq('user_id', data.id);
    const participations = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

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
      avatarUrl: data.avatar_url ?? null,
      bio: data.bio || '',
      isPrivate: false,
      joinedDate: data.created_at?.split('T')[0] || '',
      stats: {
        mediations: debateCount ?? 0,
        participations,
        followers: followerCount ?? 0,
        following: followingCount ?? 0,
        points: data.points ?? 0,
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

  const clearAnnouncementBanner = useCallback(() => {
    if (announcementClearTimerRef.current) {
      clearTimeout(announcementClearTimerRef.current);
      announcementClearTimerRef.current = null;
    }
    setAnnouncementTicker('');
    if (channelRef.current && isHost) {
      void channelRef.current
        .send({
          type: 'broadcast',
          event: 'announcement_banner',
          payload: { text: '', durationSec: 0 },
        })
        .catch(() => {});
    }
  }, [isHost]);

  const publishAnnouncementBanner = useCallback(
    (text: string, durationSec: number) => {
      const trimmed = text.trim();
      if (announcementClearTimerRef.current) {
        clearTimeout(announcementClearTimerRef.current);
        announcementClearTimerRef.current = null;
      }
      if (!trimmed) {
        clearAnnouncementBanner();
        return;
      }
      const d = Math.max(3, Math.min(120, Math.floor(durationSec) || 12));
      setAnnouncementTicker(trimmed);
      announcementClearTimerRef.current = setTimeout(() => {
        setAnnouncementTicker('');
        announcementClearTimerRef.current = null;
      }, d * 1000);
      if (channelRef.current && isHost) {
        void channelRef.current
          .send({
            type: 'broadcast',
            event: 'announcement_banner',
            payload: { text: trimmed, durationSec: d },
          })
          .catch(() => {});
      }
    },
    [isHost, clearAnnouncementBanner],
  );

  useEffect(
    () => () => {
      if (announcementClearTimerRef.current) {
        clearTimeout(announcementClearTimerRef.current);
        announcementClearTimerRef.current = null;
      }
    },
    [],
  );

  const handleSendMessage = () => {
    if (!chatInput.trim()) return;

    const cleanContent = sanitizeMessage(chatInput);
    if (!cleanContent) return;

    const senderInitial = userName?.[0]?.toUpperCase() || '?';
    const pendingId =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? `pending_${crypto.randomUUID()}`
        : `pending_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;

    const optimistic: VisibleMessage = {
      id: pendingId,
      user_name: userName,
      content: cleanContent,
      timestamp: Date.now(),
      initial: senderInitial,
    };
    setVisibleMessages((prev) => [...prev, optimistic].slice(-80));
    setChatInput('');

    const isRlsPolicyError = (err: { code?: string; message?: string } | null) => {
      const msg = (err?.message ?? '').toLowerCase();
      return (
        err?.code === '42501' ||
        msg.includes('row-level security') ||
        msg.includes('policy')
      );
    };

    const attemptInsert = async (attempt: number): Promise<void> => {
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

      if (!error && inserted?.id) {
        seenMsgKeys.current.add(`id:${inserted.id}`);
        setVisibleMessages((prev) =>
          prev.map((m) =>
            m.id === pendingId
              ? {
                  id: inserted.id,
                  user_name: userName,
                  content: cleanContent,
                  timestamp: Date.now(),
                  initial: senderInitial,
                }
              : m,
          ),
        );
        queueMicrotask(() => {
          scrollChatToEnd();
          window.setTimeout(() => scrollChatToEnd(), 50);
          window.setTimeout(() => scrollChatToEnd(), 200);
        });
        channelRef.current
          ?.send({
            type: 'broadcast',
            event: 'message',
            payload: {
              user_name: userName,
              content: cleanContent,
              initial: senderInitial,
              id: inserted.id,
            },
          })
          .catch(() => console.warn('[Live] Message broadcast failed'));
        return;
      }

      if (error && isRlsPolicyError(error) && attempt < 6) {
        await new Promise((r) => setTimeout(r, 100 + attempt * 120));
        return attemptInsert(attempt + 1);
      }

      setVisibleMessages((prev) => prev.filter((m) => m.id !== pendingId));
      console.error('[Live] Message insert failed:', error?.message, error);
      if (error && isRlsPolicyError(error)) {
        toast(
          'Envoi temporairement refusé (limite ou droits). Réessaie dans un instant.',
          'error',
        );
      } else {
        toast('Impossible d’envoyer le message', 'error');
      }
      setChatInput(cleanContent);
    };

    messageSendChainRef.current = messageSendChainRef.current
      .then(() => attemptInsert(0))
      .catch((e) => console.error('[Live] Message send chain:', e));
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

  const arenaHasAnnouncement = announcementTicker.trim() !== '';

  return (
    <div className="relative flex h-full flex-1 min-w-0 flex-col overflow-hidden bg-[#08080A]">
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
                  className="h-full rounded-full bg-gradient-to-r from-ember-500 to-cobalt-500 transition-all duration-500"
                  style={{
                    width: `${Math.min(100, Math.round((userPoints / Math.max(liveContinuationPrice, 1)) * 100))}%`,
                  }}
                />
              </div>
              <p className="text-center text-xs text-gray-400">
                Ton solde :{' '}
                <span className={userPoints >= liveContinuationPrice ? 'text-cobalt-400 font-bold' : 'text-ember-400 font-bold'}>
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
              <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-ember-600 to-cobalt-600 flex items-center justify-center shadow-glow" aria-hidden>
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
                <div className="text-2xl font-bold text-cobalt-400">{endSummary.viewers}</div>
                <div className="text-xs text-gray-500 mt-1">Spectateurs</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl p-4 border border-white/10">
                <div className="text-2xl font-bold text-ember-400">{endSummary.messages}</div>
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
                  <span className="text-xs font-semibold text-cobalt-400 w-10 text-right">
                    {Math.round((endSummary.votesA / (endSummary.votesA + endSummary.votesB)) * 100)}%
                  </span>
                  <div className="flex-1 h-3 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cobalt-600 to-cobalt-400 rounded-full transition-all"
                      style={{ width: `${(endSummary.votesA / (endSummary.votesA + endSummary.votesB)) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-semibold text-ember-400 w-10">
                    {Math.round((endSummary.votesB / (endSummary.votesA + endSummary.votesB)) * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <p className="text-xs text-gray-500 leading-relaxed px-1">
                Il n’y a pas de fil de commentaires sur cet écran : les spectateurs peuvent{' '}
                <span className="text-gray-400">noter le médiateur</span> (étoiles + commentaire) depuis le résumé du
                beef.
              </p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
                  router.push(`/beef/${roomId}/summary`);
                }}
                className="w-full py-3 rounded-xl bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-colors border border-white/10"
              >
                Résumé & avis médiateur
              </motion.button>
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
          className="absolute top-28 left-1/2 -translate-x-1/2 z-[100] bg-prestige-gold/90 backdrop-blur-sm text-black px-4 py-2 rounded-xl flex items-center gap-3 shadow-prestige-ring"
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
          className="absolute top-28 left-1/2 -translate-x-1/2 z-[100] bg-white/10 backdrop-blur-sm text-white px-5 py-3 rounded-xl flex items-center gap-3 shadow-glow-cyan border border-white/10"
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

      {/* TikTok Battle : vidéo 60% + chat overlay */}
      <div className="relative flex min-h-0 w-full max-w-full flex-1 flex-col bg-[#08080A]">
        {dailyRoomUrl ? (
          <div
            className={`relative z-[65] pointer-events-none min-h-0 w-full shrink-0 flex-[0_0_60%] landscape:flex-1 lg:flex-1 lg:pb-0 overflow-hidden max-lg:pb-28 ${arenaHasAnnouncement ? 'pt-[8.5rem] max-sm:pt-[9.5rem]' : 'pt-24 max-sm:pt-28'}`}
          >
            {/* Espace sous le header Islands (fixed) — dalles vidéo en squircle */}
            <div className={`pointer-events-none absolute z-10 flex flex-row items-stretch gap-1 min-h-0 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:w-full max-lg:px-1 max-lg:inset-y-0 max-lg:h-full lg:inset-x-0 lg:top-[12vh] lg:h-[50vh] lg:gap-4 lg:px-6 transition-shadow duration-700 ${sponsorGlow}`}>
              {/* LEFT — Participant A */}
              <motion.div
                className="pointer-events-auto relative flex-1 min-w-0 min-h-0 h-full overflow-hidden bg-[#08080A] rounded-l-xl lg:rounded-2xl border-r border-white/20 shadow-lg flex items-center justify-center"
                animate={
                  rematchSequence
                    ? { x: [0, -5, 5, -4, 4, -3, 3, 0], y: [0, 3, -3, 2, -2, 0], scale: 1 }
                    : {
                        x: 0,
                        y: 0,
                        scale: gloryIntenseA ? 1.075 : gloryChallengerSlot === 'A' ? 1.04 : 1,
                      }
                }
                transition={
                  rematchSequence
                    ? { duration: 0.35, repeat: 22, ease: 'easeInOut' }
                    : { duration: gloryIntenseA ? 0.35 : 0.2 }
                }
              >
                {/* Aura gauge badge (host only) */}
                {isHost && auraA > 0 && (
                  <div className="pointer-events-auto absolute bottom-3 left-3 z-[50] flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-md">
                    <div className="h-1.5 rounded-full bg-cobalt-500 transition-all duration-300" style={{ width: `${Math.max(8, auraA * 0.5)}px` }} />
                    <span className="pointer-events-none font-mono text-[8px] font-bold tabular-nums text-cobalt-300">{auraA}%</span>
                    {auraA >= 100 && (
                      <span className="pointer-events-none text-[8px] font-black text-cobalt-200 animate-pulse">PRÊT</span>
                    )}
                    {auraA >= 100 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGloryChallengerSlot('A');
                        }}
                        className="ml-0.5 shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase tracking-wide text-white shadow-[0_0_12px_rgba(255,255,255,0.35)] hover:bg-white/35"
                      >
                        Gloire
                      </button>
                    )}
                  </div>
                )}
                <div className="pointer-events-none absolute left-4 top-4 z-[50] flex w-[calc(100%-3rem)] items-start justify-start gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(leftPanelName, leftPanel?.arenaUserId ?? null);
                    }}
                    className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-left font-mono text-xs font-semibold text-white lg:hidden"
                  >
                    {leftPanelName} ({pulseVoicesA})
                  </button>
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
                  {gloryChallengerSlot === 'A' && (
                    <motion.div
                      key="glory-overlay-a"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`pointer-events-none absolute inset-0 ${gloryIntenseA ? 'z-[8]' : 'z-[6]'}`}
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: gloryIntenseA
                            ? [
                                'inset 0 0 56px rgba(255,255,255,0.75)',
                                'inset 0 0 120px rgba(200,230,255,0.95)',
                                'inset 0 0 72px rgba(255,255,255,0.85)',
                                'inset 0 0 120px rgba(186,220,255,0.9)',
                                'inset 0 0 56px rgba(255,255,255,0.75)',
                              ]
                            : [
                                'inset 0 0 40px rgba(255,255,255,0.4)',
                                'inset 0 0 88px rgba(186,230,255,0.55)',
                                'inset 0 0 40px rgba(255,255,255,0.4)',
                              ],
                        }}
                        transition={{
                          duration: gloryIntenseA ? 0.45 : 0.75,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      {gloryIntenseA && (
                        <motion.div
                          className="absolute inset-0 mix-blend-screen"
                          animate={{
                            opacity: [0.25, 0.55, 0.3, 0.5, 0.25],
                            background: [
                              'radial-gradient(circle at 30% 40%, rgba(255,255,255,0.5) 0%, transparent 55%)',
                              'radial-gradient(circle at 70% 55%, rgba(200,240,255,0.55) 0%, transparent 50%)',
                              'radial-gradient(circle at 50% 35%, rgba(255,255,255,0.45) 0%, transparent 60%)',
                            ],
                          }}
                          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
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
                        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,77,0,0.28)_0%,rgba(255,77,0,0.1)_45%,transparent_70%)]"
                        animate={{
                          opacity: speakingTurnPaused ? [0.18, 0.32, 0.18] : [0.38, 0.62, 0.38],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
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
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-cobalt-500/10">
                        <span className="text-5xl font-black text-white/80">
                          {leftPanel ? leftPanelName[0].toUpperCase() : '👤'}
                        </span>
                        {!leftPanel && (
                          <div className="mt-3 flex items-center gap-2 rounded-full bg-black/30 px-3 py-1.5 backdrop-blur-md">
                            <div className="h-2 w-2 rounded-full bg-cobalt-400 animate-pulse" />
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
                    className="absolute inset-0 z-[28] touch-manipulation"
                    aria-label={`Voter pour ${leftPanelName}`}
                  />
                )}
                {!beefEnded &&
                  dailyRoomUrl &&
                  (isHost || userRole === 'challenger') &&
                  !leftPanelIsLocal && (
                  <button
                    type="button"
                    onClick={() => emitTapSupport('A')}
                    className="absolute inset-0 z-[28] touch-manipulation bg-transparent"
                    aria-label="Envoyer du soutien au challenger A"
                  />
                )}
                {/* Vote guide — first time only */}
                {userRole === 'viewer' && (
                  <div className="pointer-events-none absolute top-24 left-1/2 z-[8] -translate-x-1/2">
                    <FeatureGuide
                      id="arena-vote"
                      title="Voter pour un challenger"
                      description="Tape sur l'écran d'un challenger pour voter ! Tu peux changer d'avis à tout moment."
                      position="bottom"
                      suppress={featureGuideSuppress}
                      stack="under-tap-overlays"
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
                      className="absolute inset-0 bg-cobalt-500/20 z-[6] pointer-events-none"
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
                {/* Bas dalle : pseudo + micro/cam — z élevé + pointer-events pour rester au-dessus du dock chat */}
                <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[120] flex w-[min(92%,16rem)] max-w-[min(18rem,calc(100%-1rem))] -translate-x-1/2 flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(leftPanelName, leftPanel?.arenaUserId ?? null);
                    }}
                    className="glass-prestige flex max-w-full touch-manipulation items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold uppercase text-white"
                      aria-hidden
                    >
                      {leftPanelName.trim().startsWith('En attente') ? '—' : (leftPanelName.charAt(0) || '?').toUpperCase()}
                    </span>
                    <span className="max-w-[150px] truncate text-left font-sans text-sm font-bold text-white" title={leftPanelName}>
                      {leftPanelName}
                    </span>
                  </button>
                  {leftPanelIsLocal && !isViewer && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleMic();
                        }}
                        aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                        className={`flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all active:scale-95 ${micEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                      >
                        {micEnabled ? (
                          <Mic className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        ) : (
                          <MicOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleCam();
                        }}
                        aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                        className={`flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all active:scale-95 ${camEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                      >
                        {camEnabled ? (
                          <Video className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        ) : (
                          <VideoOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>

              {/* CENTER — Médiateur : hit targets seulement sur la bulle et le badge (évite de bloquer micro/cam des challengers) */}
              <div className="pointer-events-none absolute left-1/2 top-1/2 z-50 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="pointer-events-none flex flex-col items-center gap-2"
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
                            className="absolute inset-0 rounded-full ring-1 ring-prestige-gold/25 shadow-prestige-ring"
                            animate={{ scale: [1, 1.12, 1], opacity: [0.45, 0, 0.45] }}
                            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                          />
                          <motion.div
                            className="absolute inset-0 rounded-full ring-1 ring-prestige-gold/20 shadow-glow"
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
                      className={`pointer-events-auto relative flex h-24 w-24 sm:h-32 sm:w-32 lg:h-[min(170px,32dvh)] lg:w-[min(170px,32dvh)] shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-prestige-gold bg-prestige-gold text-4xl text-black shadow-glow ring-2 ring-prestige-gold/40 transition-transform active:scale-[0.98] touch-manipulation ${auraFeverMed ? 'saturate-150 brightness-110' : ''} ${mediatorMicEnabled ? 'animate-pulse shadow-[0_0_40px_rgba(251,191,36,0.6)]' : ''}`}
                    >
                      {mediatorParticipant?.videoTrack ? (
                        <ParticipantVideo
                          videoTrack={mediatorParticipant.videoTrack}
                          audioTrack={mediatorIsLocal ? undefined : mediatorParticipant.audioTrack}
                          muted={mediatorIsLocal}
                          mirror={mediatorIsLocal}
                          className="pointer-events-none absolute inset-0 h-full w-full rounded-full object-cover"
                        />
                      ) : (
                        <span className="font-mono text-3xl font-black text-white md:text-4xl">
                          {mediatorName?.[0]?.toUpperCase() || '·'}
                        </span>
                      )}
                    </button>
                    {/* Aura gauge badge (host only) */}
                    {isHost && auraMed > 0 && (
                      <div className="pointer-events-none absolute -bottom-1 left-1/2 z-[26] flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-md">
                        <div className="h-1.5 rounded-full bg-prestige-gold transition-all duration-300" style={{ width: `${Math.max(8, auraMed * 0.4)}px` }} />
                        <span className="font-mono text-[8px] font-bold tabular-nums text-prestige-gold">{auraMed}%</span>
                        {auraFeverMed && <span className="text-[8px] font-black text-prestige-gold animate-pulse">FEVER</span>}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(mediatorName, host.id);
                    }}
                    className="pointer-events-auto flex max-w-[min(72vw,16rem)] touch-manipulation items-center justify-center gap-2 rounded-full bg-black/50 px-3 py-1.5 shadow-[0_16px_44px_rgba(0,0,0,0.45)] backdrop-blur-xl transition-opacity hover:opacity-95"
                  >
                    <Award className="h-4 w-4 shrink-0 text-amber-200/90" strokeWidth={1.2} aria-hidden />
                    <span className="max-w-[min(56vw,12rem)] truncate text-center font-mono text-sm font-semibold text-white">
                      {mediatorName}
                    </span>
                  </button>
                </motion.div>
              </div>

              {/* RIGHT — Participant B */}
              <motion.div
                className="pointer-events-auto relative flex-1 min-w-0 min-h-0 h-full overflow-hidden bg-[#08080A] rounded-r-xl lg:rounded-2xl border-l border-white/10 shadow-lg flex items-center justify-center"
                animate={
                  rematchSequence
                    ? { x: [0, 5, -5, 4, -4, 3, -3, 0], y: [0, -3, 3, -2, 2, 0], scale: 1 }
                    : {
                        x: 0,
                        y: 0,
                        scale: gloryIntenseB ? 1.075 : gloryChallengerSlot === 'B' ? 1.04 : 1,
                      }
                }
                transition={
                  rematchSequence
                    ? { duration: 0.35, repeat: 22, ease: 'easeInOut' }
                    : { duration: gloryIntenseB ? 0.35 : 0.2 }
                }
              >
                {/* Aura gauge badge (host only) */}
                {isHost && auraB > 0 && (
                  <div className="pointer-events-auto absolute bottom-3 right-3 z-[50] flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-md">
                    <div className="h-1.5 rounded-full bg-ember-500 transition-all duration-300" style={{ width: `${Math.max(8, auraB * 0.5)}px` }} />
                    <span className="pointer-events-none font-mono text-[8px] font-bold tabular-nums text-ember-300">{auraB}%</span>
                    {auraB >= 100 && (
                      <span className="pointer-events-none text-[8px] font-black text-ember-200 animate-pulse">PRÊT</span>
                    )}
                    {auraB >= 100 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setGloryChallengerSlot('B');
                        }}
                        className="ml-0.5 shrink-0 rounded-full bg-white/25 px-1.5 py-0.5 font-mono text-[7px] font-black uppercase tracking-wide text-white shadow-[0_0_12px_rgba(255,255,255,0.35)] hover:bg-white/35"
                      >
                        Gloire
                      </button>
                    )}
                  </div>
                )}
                <div
                  className="pointer-events-none absolute right-4 top-4 z-[50] flex w-[calc(100%-3rem)] items-start justify-end gap-2"
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(rightPanelName, rightPanel?.arenaUserId ?? null);
                    }}
                    className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-right font-mono text-xs font-semibold text-white lg:hidden"
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
                  {gloryChallengerSlot === 'B' && (
                    <motion.div
                      key="glory-overlay-b"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className={`pointer-events-none absolute inset-0 ${gloryIntenseB ? 'z-[8]' : 'z-[6]'}`}
                    >
                      <motion.div
                        className="absolute inset-0"
                        animate={{
                          boxShadow: gloryIntenseB
                            ? [
                                'inset 0 0 56px rgba(255,255,255,0.72)',
                                'inset 0 0 118px rgba(255,230,200,0.92)',
                                'inset 0 0 72px rgba(255,255,255,0.8)',
                                'inset 0 0 118px rgba(255,215,180,0.88)',
                                'inset 0 0 56px rgba(255,255,255,0.72)',
                              ]
                            : [
                                'inset 0 0 40px rgba(255,255,255,0.4)',
                                'inset 0 0 88px rgba(255,220,186,0.5)',
                                'inset 0 0 40px rgba(255,255,255,0.4)',
                              ],
                        }}
                        transition={{
                          duration: gloryIntenseB ? 0.45 : 0.75,
                          repeat: Infinity,
                          ease: 'easeInOut',
                        }}
                      />
                      {gloryIntenseB && (
                        <motion.div
                          className="absolute inset-0 mix-blend-screen"
                          animate={{
                            opacity: [0.25, 0.52, 0.28, 0.48, 0.25],
                            background: [
                              'radial-gradient(circle at 65% 42%, rgba(255,255,255,0.48) 0%, transparent 55%)',
                              'radial-gradient(circle at 35% 58%, rgba(255,230,200,0.5) 0%, transparent 50%)',
                              'radial-gradient(circle at 50% 38%, rgba(255,255,255,0.42) 0%, transparent 58%)',
                            ],
                          }}
                          transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                        />
                      )}
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
                        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,77,0,0.28)_0%,rgba(255,77,0,0.1)_45%,transparent_70%)]"
                        animate={{
                          opacity: speakingTurnPaused ? [0.18, 0.32, 0.18] : [0.38, 0.62, 0.38],
                        }}
                        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
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
                        audioTrack={rightPanelIsLocal ? undefined : rightPanel.audioTrack}
                        muted={rightPanelIsLocal ? true : rightRemoteAudioMuted}
                        mirror={rightPanelIsLocal}
                        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
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
                    className="absolute inset-0 z-[28] touch-manipulation"
                    aria-label={`Voter pour ${rightPanelName}`}
                  />
                )}
                {!beefEnded &&
                  dailyRoomUrl &&
                  (isHost || userRole === 'challenger') &&
                  !rightPanelIsLocal && (
                  <button
                    type="button"
                    onClick={() => emitTapSupport('B')}
                    className="absolute inset-0 z-[28] touch-manipulation bg-transparent"
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
                      className="absolute inset-0 bg-ember-500/20 z-[6] pointer-events-none"
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
                <div className="pointer-events-auto absolute bottom-3 left-1/2 z-[120] flex w-[min(92%,16rem)] max-w-[min(18rem,calc(100%-1rem))] -translate-x-1/2 flex-col items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void openProfile(rightPanelName, rightPanel?.arenaUserId ?? null);
                    }}
                    className="glass-prestige flex max-w-full touch-manipulation items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-bold uppercase text-white"
                      aria-hidden
                    >
                      {rightPanelName.trim().startsWith('En attente') ? '—' : (rightPanelName.charAt(0) || '?').toUpperCase()}
                    </span>
                    <span className="max-w-[150px] truncate text-left font-sans text-sm font-bold text-white" title={rightPanelName}>
                      {rightPanelName}
                    </span>
                  </button>
                  {rightPanelIsLocal && !isViewer && (
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleMic();
                        }}
                        aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                        className={`flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all active:scale-95 ${micEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                      >
                        {micEnabled ? (
                          <Mic className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        ) : (
                          <MicOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          toggleCam();
                        }}
                        aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                        className={`flex h-12 w-12 shrink-0 touch-manipulation items-center justify-center rounded-full bg-black/55 shadow-[0_12px_40px_rgba(0,0,0,0.45)] backdrop-blur-2xl transition-all active:scale-95 ${camEnabled ? 'text-white hover:bg-white/10' : 'bg-red-600/90 text-white'}`}
                      >
                        {camEnabled ? (
                          <Video className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        ) : (
                          <VideoOff className="h-[18px] w-[18px]" strokeWidth={1.2} aria-hidden />
                        )}
                      </button>
                    </div>
                  )}
                </div>
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
              <div className="pointer-events-auto absolute inset-0 z-[160] flex items-center justify-center bg-black/60">
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
        <div className="relative z-[65] pointer-events-none min-h-0 w-full shrink-0 flex-[0_0_60%] landscape:flex-1 lg:flex-1 overflow-hidden">
          <div className="pointer-events-none absolute z-10 flex flex-row items-stretch gap-1 min-h-0 max-lg:left-1/2 max-lg:-translate-x-1/2 max-lg:w-full max-lg:px-1 max-lg:inset-y-0 max-lg:h-full lg:inset-x-0 lg:top-[12vh] lg:h-[50vh] lg:gap-4 lg:px-6">
          {debaters[0] ? (
            <div className="pointer-events-auto relative flex-1 min-w-0 min-h-0 h-full overflow-hidden bg-[#08080A] rounded-l-xl lg:rounded-2xl border-r border-white/20 shadow-lg flex flex-col items-center justify-center">
              <div className="pointer-events-none absolute left-4 top-4 z-[50] flex w-[calc(100%-2rem)] items-start justify-start gap-2">
                <button
                  type="button"
                  onClick={() => void openProfile(debaters[0].name, debaters[0].id)}
                  className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-left font-mono text-xs font-semibold text-white"
                >
                  {debaters[0].name} ({pulseVoicesA})
                </button>
              </div>
              <div className={`absolute inset-0 flex items-center justify-center bg-cobalt-500/10 text-5xl font-black text-white/80 ${
                speakingTurnTarget === debaters[0]?.id ? 'ring-2 ring-inset ring-cobalt-400' : ''
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
                    className={`absolute right-4 top-14 z-20 rounded-2xl bg-black/95 px-4 py-2 shadow-2xl backdrop-blur-xl border-[3px] border-solid ${
                      speakingTurnRemaining <= 10
                        ? 'border-ember-600'
                        : speakingTurnRemaining <= 30
                          ? 'border-ember-500/80'
                          : 'border-cobalt-500/80'
                    }`}
                  >
                    <div
                      className={`text-4xl font-black tabular-nums ${
                        speakingTurnRemaining <= 10
                          ? 'text-ember-500 animate-pulse'
                          : speakingTurnRemaining <= 30
                            ? 'text-ember-400'
                            : 'text-cobalt-400'
                      }`}
                    >
                      {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="pointer-events-auto relative flex-1 overflow-hidden bg-[#08080A] lg:rounded-2xl">
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
              <div
                className={`flex h-24 w-24 sm:h-32 sm:w-32 lg:h-[min(170px,32dvh)] lg:w-[min(170px,32dvh)] shrink-0 items-center justify-center rounded-full border-4 border-prestige-gold bg-prestige-gold text-4xl text-black shadow-glow ring-2 ring-prestige-gold/40${mediatorMicEnabled ? ' animate-pulse shadow-[0_0_40px_rgba(251,191,36,0.6)]' : ''}`}
              >
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
            <div className="pointer-events-auto relative flex-1 min-w-0 min-h-0 h-full overflow-hidden bg-[#08080A] rounded-r-xl lg:rounded-2xl border-l border-white/10 shadow-lg flex flex-col items-center justify-center">
              <div className="pointer-events-none absolute right-4 top-4 z-[50] flex w-[calc(100%-2rem)] items-start justify-end gap-2">
                <button
                  type="button"
                  onClick={() => void openProfile(debaters[1].name, debaters[1].id)}
                  className="pointer-events-auto max-w-[min(100%,14rem)] truncate text-right font-mono text-xs font-semibold text-white"
                >
                  {debaters[1].name} ({pulseVoicesB})
                </button>
              </div>
              <div className={`absolute inset-0 flex items-center justify-center bg-ember-500/10 text-5xl font-black text-white/80 ${
                speakingTurnTarget === debaters[1]?.id ? 'ring-2 ring-inset ring-ember-400' : ''
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
                    className={`absolute left-4 top-14 z-20 rounded-2xl bg-black/95 px-4 py-2 shadow-2xl backdrop-blur-xl border-[3px] border-solid ${
                      speakingTurnRemaining <= 10
                        ? 'border-ember-600'
                        : speakingTurnRemaining <= 30
                          ? 'border-ember-500/80'
                          : 'border-cobalt-500/80'
                    }`}
                  >
                    <div
                      className={`text-4xl font-black tabular-nums ${
                        speakingTurnRemaining <= 10
                          ? 'text-ember-500 animate-pulse'
                          : speakingTurnRemaining <= 30
                            ? 'text-ember-400'
                            : 'text-cobalt-400'
                      }`}
                    >
                      {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="pointer-events-auto relative flex-1 overflow-hidden border-l border-white/20 bg-[#08080A] lg:rounded-2xl">
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

      {/* ── Header fixe : annonce puis chrono / LIVE (pile unique, mobile + desktop) ── */}
      {/* z-[80] > zone vidéo z-[65] : sinon la dalle droite volait les taps sur LIVE / Sliders (command deck) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[80] flex w-full flex-col p-2 lg:p-4">
        {arenaHasAnnouncement && (
          <div className="pointer-events-none shrink-0 border-b border-white/10 bg-black/65 px-3 py-2 backdrop-blur-md">
            <p className="text-center font-mono text-[10px] font-bold uppercase tracking-[0.28em] text-white">
              {announcementTicker}
            </p>
          </div>
        )}
        <div
          className={`pointer-events-none grid w-full grid-cols-1 items-start gap-2 sm:grid-cols-[1fr_auto_1fr] sm:gap-3 ${arenaHasAnnouncement ? 'px-4 pb-3 pt-2' : 'p-4'}`}
        >
        <div className="pointer-events-none hidden min-w-0 sm:block" aria-hidden />

        <div className="pointer-events-none flex justify-center">
          <div className="glass-prestige pointer-events-auto flex flex-col items-center justify-center gap-0.5 rounded-full px-4 py-2 text-center">
            {isJoined && timerActive ? (
              <div
                className={`flex items-center gap-1 font-mono text-xs font-bold tabular-nums ${
                  timerPaused
                    ? 'text-amber-200'
                    : beefTimeRemaining <= 5 * 60
                      ? 'text-red-300'
                      : 'text-white/90'
                }`}
              >
                {timerPaused ? (
                  <Pause className="h-3 w-3 shrink-0" strokeWidth={1.2} aria-hidden />
                ) : (
                  <Timer className="h-3 w-3 shrink-0" strokeWidth={1.2} aria-hidden />
                )}
                <span>{formatBeefTime(beefTimeRemaining)}</span>
                {timerPaused && (
                  <span className="text-[9px] font-black uppercase tracking-wide text-amber-200 animate-pulse">Pause</span>
                )}
              </div>
            ) : isJoined && !timerActive && isHost ? (
              <span className="font-mono text-[9px] uppercase tracking-wider text-white/50">Pas de chrono</span>
            ) : isJoined && !timerActive && !isHost ? (
              <span className="max-w-[14rem] font-mono text-[9px] uppercase leading-tight tracking-wider text-white/45">
                Chrono au lancement (médiateur)
              </span>
            ) : null}
          </div>
        </div>

        <div className="pointer-events-none flex justify-center sm:justify-end">
          <div className="glass-prestige pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-full py-1.5 pl-2 pr-1.5 sm:gap-2 sm:pl-3">
            <div
              className={`flex items-center rounded-full px-2 py-0.5 ${
                liveBadgeHot
                  ? 'animate-pulse bg-red-600 shadow-[0_4px_20px_rgba(220,38,38,0.45)]'
                  : 'bg-white/10'
              }`}
            >
              <div
                className={`mr-1 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'bg-white' : 'bg-amber-300'}`}
              />
              <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-white">LIVE</span>
            </div>
            <button
              type="button"
              onClick={() => setShowViewerList(true)}
              className="flex items-center gap-1 rounded-full px-1.5 py-1 transition-colors hover:bg-white/10"
              aria-label="Spectateurs"
            >
              <Eye className="h-3.5 w-3.5 text-white" strokeWidth={1.2} aria-hidden />
              <span className="min-w-[1ch] font-mono text-[11px] font-medium tabular-nums text-white">
                {liveViewerCount > 0 ? liveViewerCount : '—'}
              </span>
            </button>
            <button
              type="button"
              onClick={onShare}
              aria-label="Partager le direct"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
            >
              <Share2 className="h-[17px] w-[17px] text-white" strokeWidth={1.2} aria-hidden />
            </button>
            {isHost ? (
              <button
                type="button"
                onClick={() => setMediatorSidebarOpen((o) => !o)}
                aria-expanded={mediatorSidebarOpen}
                aria-label={
                  mediatorSidebarOpen ? 'Fermer la commande médiateur' : 'Ouvrir la commande médiateur'
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-amber-200 transition-colors hover:bg-white/10 hover:text-white"
              >
                <Sliders className="h-5 w-5" strokeWidth={1.2} aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleLeave}
                aria-label="Quitter le direct"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4 text-white" strokeWidth={1.2} aria-hidden />
              </button>
            )}
          </div>
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
            focusTarget={focusTarget}
            onFocusTargetChange={setFocusTarget}
            beefRemainingSec={beefTimeRemaining}
            maxBeefDurationSec={MAX_BEEF_DURATION}
            parolePresetSec={parolePresetSec}
            onParolePresetSecChange={setParolePresetSec}
            announcementText={announcementTicker}
            onPublishAnnouncement={publishAnnouncementBanner}
            onClearAnnouncement={clearAnnouncementBanner}
            pendingInvites={pendingInvites}
            onInviteParticipant={handleInviteFromModal}
            inviteExcludeParticipantIds={inviteExcludeParticipantIds}
            inviteCurrentUserId={userId}
          />
        </>
      )}

      {/* ── Dock social : top-[60%] aligné sur la zone vidéo — pas de chevauchement avec micro/cam (z vidéo > dock) ── */}
      {!beefEnded && (
        <div className="pointer-events-none absolute bottom-0 z-[55] flex min-h-0 flex-col justify-end overflow-visible max-lg:inset-x-0 max-lg:w-full max-lg:top-[60%] landscape:top-auto landscape:bottom-0 landscape:h-[120px] lg:inset-x-0 lg:top-auto lg:h-[35vh] lg:px-6">
        <div className="pointer-events-auto flex min-h-0 flex-1 flex-col overflow-visible bg-gradient-to-t from-black/95 via-black/70 to-transparent max-lg:gap-1 lg:flex-row lg:items-end lg:gap-6 lg:px-4 lg:pt-3 px-2 pt-6 pb-[max(0.5rem,env(safe-area-inset-bottom))] max-lg:landscape:bg-none">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"
            aria-live="polite"
          >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={chatMessagesScrollRef}
            className="min-h-0 flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-2 py-1.5 sm:px-4 sm:py-2 hide-scrollbar max-lg:min-h-0 max-lg:max-h-[min(30svh,240px)] max-lg:flex-1 max-lg:[mask-image:none] max-lg:[-webkit-mask-image:none] lg:max-h-[min(32vh,320px)] lg:[mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.5)_12%,#000_28%)] lg:[-webkit-mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.5)_12%,#000_28%)]"
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
                    <ProfileUserLink
                      username={message.user_name}
                      onArenaProfileClick={(q) => void openProfile(q, undefined)}
                      className="block font-mono text-[9px] font-bold uppercase tracking-tight text-[#ffffff] [text-shadow:0_1px_3px_rgba(0,0,0,0.9)] sm:[text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
                    >
                      {message.user_name}
                    </ProfileUserLink>
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
            <div ref={chatMessagesEndRef} className="h-px w-full shrink-0 scroll-mt-1" aria-hidden />
          </div>
          <div className="relative z-[130] min-w-0 shrink-0 px-2 pb-1.5 pt-0.5 sm:px-3 sm:pb-2 sm:pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
                placeholder="Message..."
                aria-label="Message dans le chat du direct"
                autoComplete="off"
                enterKeyHint="send"
                className="min-w-0 flex-1 rounded-2xl bg-[#08080a]/65 py-2 pl-2.5 pr-3 text-[13px] font-medium tracking-tight text-white shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] placeholder-white/35 backdrop-blur-2xl focus:outline-none focus:shadow-[0_0_24px_rgba(59,130,246,0.22),0_8px_32px_rgba(0,0,0,0.45)]"
              />
              <button
                type="button"
                disabled={!chatInput.trim()}
                onClick={() => void handleSendMessage()}
                aria-label="Envoyer le message"
                className="flex h-9 w-9 shrink-0 touch-manipulation items-center justify-center rounded-xl bg-ember-500 hover:bg-ember-600 disabled:pointer-events-none disabled:opacity-35"
              >
                <Send className="h-3.5 w-3.5 text-white" strokeWidth={1} aria-hidden />
              </button>
            </div>
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
            className="relative z-[200] isolate flex w-full shrink-0 flex-row flex-wrap items-center justify-center gap-1 overflow-visible px-1 py-1 max-lg:justify-center lg:w-auto lg:min-w-[12.5rem] lg:max-w-[15rem] lg:flex-col lg:flex-nowrap lg:items-end lg:justify-end lg:gap-1.5 lg:self-end lg:border-l lg:border-white/10 lg:px-2 lg:py-2 lg:pl-6"
          >
            {/* Desktop : grille 2×5 (10 réactions) + 😀 / cœur / cadeau */}
            <div
              role="toolbar"
              aria-label="Réactions rapides"
              className="mb-0 hidden w-full shrink-0 gap-1 px-0.5 lg:mb-0 lg:grid lg:w-[12.25rem] lg:grid-cols-5 lg:grid-rows-2 lg:justify-items-center"
            >
              {ARENA_QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReaction(emoji)}
                  aria-label={`Réaction ${emoji}`}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-lg shadow-[0_4px_18px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform duration-75 hover:bg-white/10 active:scale-90 touch-manipulation"
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>
            <div
              role="toolbar"
              aria-label="Réactions rapides"
              className="touch-pan-x flex max-w-full flex-nowrap justify-center gap-0.5 overflow-x-auto overflow-y-hidden px-0.5 hide-scrollbar [-webkit-overflow-scrolling:touch] lg:hidden"
            >
              {ARENA_QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => handleReaction(emoji)}
                  aria-label={`Réaction ${emoji}`}
                  className="flex h-9 min-h-[2.25rem] w-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-full bg-black/40 text-[15px] shadow-[0_4px_18px_rgba(0,0,0,0.4)] backdrop-blur-md transition-transform duration-75 hover:bg-white/10 active:scale-90 touch-manipulation"
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>

            <div className="relative z-[210] flex flex-wrap items-center justify-center gap-2 overflow-visible max-lg:gap-1.5 lg:shrink-0">
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.08, ease: 'easeOut' }}
                onClick={() => {
                  setShowGiftPicker(false);
                  setShowAllReactions((v) => !v);
                }}
                aria-label={showAllReactions ? 'Fermer le panneau de réactions' : 'Ouvrir les réactions emoji'}
                aria-expanded={showAllReactions}
                className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl bg-white/[0.06] text-lg shadow-[0_6px_22px_rgba(0,0,0,0.35)] backdrop-blur-md touch-manipulation"
              >
                <span aria-hidden>😀</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.08, ease: 'easeOut' }}
                onClick={() => handleReaction(HEART_ON_FIRE)}
                aria-label="Envoyer une réaction cœur enflammé"
                className="flex h-10 w-10 shrink-0 select-none items-center justify-center rounded-xl bg-white/[0.06] text-xl leading-none shadow-[0_6px_22px_rgba(0,0,0,0.35)] backdrop-blur-md touch-manipulation"
              >
                <span aria-hidden>{HEART_ON_FIRE}</span>
              </motion.button>

              <div className="relative flex shrink-0">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.96 }}
                  transition={{ duration: 0.08, ease: 'easeOut' }}
                  onClick={() => {
                    setShowAllReactions(false);
                    setShowGiftPicker((v) => !v);
                  }}
                  aria-label={showGiftPicker ? 'Fermer les cadeaux' : 'Ouvrir les cadeaux'}
                  aria-expanded={showGiftPicker}
                  className="flex h-10 w-10 select-none items-center justify-center rounded-xl bg-gradient-to-br from-ember-600/90 to-cobalt-700/80 shadow-[0_8px_28px_rgba(0,0,0,0.45),0_0_24px_rgba(251,146,60,0.15)] touch-manipulation"
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

      {dockPickersMounted &&
        typeof document !== 'undefined' &&
        dockPickerPos &&
        (showAllReactions || showGiftPicker) &&
        createPortal(
          <AnimatePresence mode="wait">
            {showAllReactions && (
              <motion.div
                key="arena-all-reactions"
                data-arena-dock-popover
                role="dialog"
                aria-modal="true"
                aria-label="Réactions"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  bottom: dockPickerPos.bottom,
                  right: dockPickerPos.right,
                  zIndex: 560,
                }}
                className="pointer-events-auto max-h-[min(50dvh,280px)] w-[min(calc(100vw-1rem),18rem)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-xl border border-white/[0.1] bg-[#0c0c0f]/98 p-2 pt-1.5 shadow-2xl backdrop-blur-xl"
              >
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
                  <span className="pl-0.5 text-[11px] font-semibold text-white/75">Réactions</span>
                  <button
                    type="button"
                    onClick={() => setShowAllReactions(false)}
                    aria-label="Fermer le panneau de réactions"
                    className="flex h-9 min-h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
                  {PICKER_REACTIONS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => {
                        handleReaction(emoji);
                        setShowAllReactions(false);
                      }}
                      aria-label={`Réagir avec ${emoji}`}
                      className="flex h-9 min-h-9 w-9 min-w-9 touch-manipulation items-center justify-center rounded-xl text-lg hover:bg-white/10 active:scale-95"
                    >
                      <span aria-hidden>{emoji}</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            {showGiftPicker && (
              <motion.div
                key="arena-gift-picker"
                data-arena-dock-popover
                role="dialog"
                aria-modal="true"
                aria-label="Cadeaux"
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.98 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                style={{
                  position: 'fixed',
                  bottom: dockPickerPos.bottom,
                  right: dockPickerPos.right,
                  zIndex: 560,
                }}
                className="pointer-events-auto w-[min(calc(100vw-1.5rem),220px)] rounded-xl border border-white/12 bg-[#0c0c0f]/98 p-3 pt-2 shadow-2xl backdrop-blur-xl"
              >
                <div className="mb-2 flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2">
                  <p className="min-w-0 flex-1 pl-0.5 text-[11px] font-semibold leading-snug text-white/75">
                    Envoyer au médiateur
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowGiftPicker(false)}
                    aria-label="Fermer les cadeaux"
                    className="flex h-9 min-h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-xl text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
                      type="button"
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
                        } catch (err: unknown) {
                          const m = err instanceof Error ? err.message : "Erreur lors de l'envoi";
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
                      className="flex touch-manipulation flex-col items-center gap-1 rounded-xl bg-white/5 p-2 transition-transform active:scale-[0.98] hover:bg-white/12"
                    >
                      <span className="text-2xl">{gift.emoji}</span>
                      <span className="text-[10px] font-bold text-white">{gift.label}</span>
                      <span className="text-[9px] font-semibold text-ember-400">{gift.cost} pts</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}

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
              className="relative max-w-md w-full overflow-hidden rounded-3xl border border-gray-700 bg-gradient-to-br from-gray-800/50 to-gray-900/50 shadow-2xl"
            >
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>

              <div className="relative h-28 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-600/20">
                <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10" />
              </div>

              <div className="relative px-6 pb-6 -mt-12">
                <div className="mb-4 flex justify-center">
                  <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-gray-900 bg-gradient-to-br from-gray-700 to-gray-800 text-3xl font-black text-white">
                    {selectedProfile.avatarUrl ? (
                      <Image
                        src={selectedProfile.avatarUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="96px"
                      />
                    ) : (
                      selectedProfile.displayName[0]?.toUpperCase() || '?'
                    )}
                  </div>
                </div>

                <div className="mb-3 text-center">
                  <h2 className="font-sans text-2xl font-black text-white">{selectedProfile.displayName}</h2>
                  <p className="text-sm text-gray-400">@{selectedProfile.username}</p>
                </div>

                {selectedProfile.bio ? (
                  <p className="mb-4 text-center text-sm text-gray-300">{selectedProfile.bio}</p>
                ) : null}

                <div className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
                  <div className="text-center">
                    <span className="text-2xl font-black text-white">{selectedProfile.stats.participations}</span>
                    <span className="ml-1 text-sm text-gray-400">Participations</span>
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-black text-white">{selectedProfile.stats.mediations}</span>
                    <span className="ml-1 text-sm text-gray-400">Médiations</span>
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-black text-white">{selectedProfile.stats.followers}</span>
                    <span className="ml-1 text-sm text-gray-400">Abonnés</span>
                  </div>
                  <div className="text-center">
                    <span className="text-2xl font-black text-white">{selectedProfile.stats.following}</span>
                    <span className="ml-1 text-sm text-gray-400">Abonnements</span>
                  </div>
                  <div className="flex items-center justify-center gap-2">
                    <Flame className="h-5 w-5 shrink-0 text-brand-400" />
                    <span className="text-2xl font-black text-white">{selectedProfile.stats.points}</span>
                    <span className="text-sm text-gray-400">Points</span>
                  </div>
                </div>

                <div className="mb-5 flex items-center justify-center gap-2 text-sm text-gray-400">
                  <Calendar className="h-4 w-4 shrink-0" />
                  <span>
                    Membre depuis{' '}
                    {new Date(selectedProfile.joinedDate).toLocaleDateString('fr-FR', {
                      month: 'long',
                      year: 'numeric',
                    })}
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    {userId && selectedProfile.id !== userId && (
                      <button
                        type="button"
                        onClick={() => void toggleFollowProfileTarget()}
                        className={`flex-1 rounded-lg py-2.5 font-bold transition-colors ${
                          profileFollowsTarget
                            ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
                            : 'brand-gradient text-black hover:opacity-90'
                        }`}
                      >
                        {profileFollowsTarget ? 'Abonné ✓' : 'Suivre'}
                      </button>
                    )}
                    {userId && selectedProfile.id !== userId && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowProfile(false);
                          try {
                            sessionStorage.setItem(PENDING_DM_WITH_STORAGE_KEY, selectedProfile.id);
                          } catch {
                            /* private mode */
                          }
                          router.push(`/messages?with=${encodeURIComponent(selectedProfile.id)}`);
                        }}
                        className="flex-1 rounded-lg border border-white/10 bg-white/5 py-2.5 font-bold text-white transition-colors hover:bg-white/10"
                      >
                        Message
                      </button>
                    )}
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
          onSelectViewer={(name) => {
            setShowViewerList(false);
            void openProfile(name, undefined);
          }}
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
