'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ConfirmModal } from '@/components/ConfirmModal';
import {
  Eye,
  Gift,
  X,
  PanelRight,
  Send,
  Award,
  Share2,
  Calendar,
  Menu,
  MessageCircle,
  Home,
  User,
  Settings as SettingsIcon,
  Maximize,
} from 'lucide-react';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { VsTransition } from './VsTransition';

import { PreJoinScreen } from './PreJoinScreen';
import { ArenaChatMessages } from './ArenaChatMessages';
import { ArenaLayoutManager } from '@/components/Arena/ArenaLayoutManager';
import { PremiumNotificationBadge } from '@/components/shared/PremiumNotificationBadge';

import { ViewerListModal } from './ViewerListModal';

import { physicalPeerToCallParticipant, useDailyCall, type CallParticipant } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { userIdsEqual } from '@/lib/user-id-equal';
import { useToast } from '@/components/Toast';
import { useMediaSession } from '@/hooks/useMediaSession';
import { useWakeLock } from '@/hooks/useWakeLock';
import { sanitize as sanitizeTicker, sanitizeMessage } from '@/lib/security';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';
import { type BeefManageAction } from '@/lib/beef-manage-client';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { useUnreadDMs } from '@/hooks/useUnreadDMs';
import { useAuthGate, type AuthHookState } from '@/hooks/useAuthGate';
import { useBeefManage } from '@/hooks/useBeefManage';
import { usePendingInvites } from '@/hooks/usePendingInvites';
import { useDebaterInvites, type Debater } from '@/hooks/useDebaterInvites';
import { useArenaProfile, type ArenaUserProfile } from '@/hooks/useArenaProfile';
import { useArenaChat } from '@/hooks/useArenaChat';
import { useParticipantRoles } from '@/hooks/useParticipantRoles';
import { useBeefTimer, DEFAULT_BEEF_DURATION, MAX_BEEF_DURATION } from '@/hooks/useBeefTimer';
import { useBeefLifecycle, type EndSummary } from '@/hooks/useBeefLifecycle';
import { useGiftSend } from '@/hooks/useGiftSend';
import { ArenaProfileModal } from '@/components/Arena/ArenaProfileModal';
import { ArenaBeefEndSummary } from '@/components/Arena/ArenaBeefEndSummary';
import { ArenaMenuPanel } from '@/components/Arena/ArenaMenuPanel';
import { ArenaDockPickersPortal } from '@/components/Arena/ArenaDockPickersPortal';
import { AcceptedInviteAlert, RefInviteAlert } from '@/components/Arena/ArenaInviteAlerts';
import { ArenaAuthHookModal } from '@/components/Arena/ArenaAuthHookModal';
import { IngotIcon } from '@/components/shared/IngotIcon';
import { escapeForIlikeExact } from '@/lib/ilike-exact';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import {
  buildParticipantAliasSet,
  isValidArenaUserId,
  matchRemoteToExpectedBeefParticipant,
  ORPHAN_GUEST_LABEL,
  reconcilePeers,
  remoteMatchesMediator,
  type BeefParticipantRowMeta,
  type ReconcileExpectedRoles,
} from '@/lib/participant-identity';
import {
  addAuraBatchToRecord,
  ARENA_CHALLENGER_SLOT_COUNT,
  AURA_DISPLAY_CAP,
  CHALLENGER_SLOT_IDS,
  createEmptyChallengerAuras,
  createZeroAuraBatch,
  hasAnyAuraBatchDelta,
  indexToChallengerSlot,
  challengerSlotToIndex,
  snapshotToChallengerAuras,
  type ArenaSupportSlotId,
  type ChallengerSlotId,
  type AuraBatchPayload,
} from '@/lib/arena-slots';
import {
  FlyingReactionsLayer,
  createFlyingReactionEntry,
  type FlyingReactionEntry,
} from './FlyingReactionsLayer';
import { useArenaVolatileStore, type ArenaBigGiftPayload } from '@/lib/stores/arenaVolatileStore';

import { useArenaPulseVoicesStore } from '@/lib/stores/arenaPulseVoicesStore';
import { useArenaVerdictStore } from '@/lib/stores/arenaVerdictStore';
import { VerdictConfettiBurst, RematchVerdictOverlay } from './VerdictEffects';
import { playRematchThunderSfx } from '@/lib/playVerdictSfx';
import { MediatorSidebar, type MediatorRemoteRow } from './MediatorSidebar';
import { FullscreenGiftAnimation } from './Arena/FullscreenGiftAnimation';
import { MeetingAudioOutlet } from '@/components/MeetingAudioOutlet';
import {
  useArenaRealtime,
  type UseArenaRealtimeResult,
  type ArenaRealtimeCallbacks,
  type StructuredDebateBroadcastPayload,
} from '@/hooks/useArenaRealtime';
import { useWalletStore } from '@/lib/stores/walletStore';



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
  userRole: 'mediator' | 'challenger' | 'viewer' | 'spectator';
  viewerCount?: number;
  tension?: number;
  points?: number;
  debateTitle?: string;
  dailyRoomUrl?: string | null;
  /** Jeton Daily `GET /api/beef/access` (médiateur / challenger / avant fetch spectateur). */
  dailyMeetingToken?: string | null;
  onReaction: (emoji: string) => void;
  onTap?: () => void;
  onShare: () => void;
}


const HEART_ON_FIRE = '❤️‍🔥';

/** Cœur / pouce : particules sur l’anneau du challenger (pas d’emoji flottant). */
const INTEGRATED_SUPPORT_REACTIONS = new Set<string>(['❤️', HEART_ON_FIRE, '👍']);



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
  dailyMeetingToken,
  onReaction,
  onShare,
}: TikTokStyleArenaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  // --- BACKGROUND AUDIO (Tier-1) ---
  const { startSystemAudio } = useMediaSession(debateTitle || 'Live Agora', host?.name || 'Ref');

  // --- ANTI-VEILLE ÉCRAN (Tier-1) ---
  useWakeLock(true);

  const { runBeefManage } = useBeefManage(supabase, toast);

  const isViewer = userRole === 'viewer';

  // ── AUTH HOOK (Conversion des anonymes + mur freemium mandatory) ──
  const { authHook, setAuthHook, requireAuth } = useAuthGate(userId);

  const [hasJoined, setHasJoined] = useState(false);
  const [showPreJoin, setShowPreJoin] = useState(true);

  useEffect(() => {
    if (hasJoined) setShowPreJoin(false);
  }, [hasJoined]);

  /** MediaStream du pré-joint (médiateur / challenger) — réutilisé par Daily pour éviter un 2ᵉ getUserMedia bloqué sur mobile. */
  const [preJoinMediaStream, setPreJoinMediaStream] = useState<MediaStream | null>(null);
  const [preJoinCamEnabled, setPreJoinCamEnabled] = useState(true);
  const preJoinMediaStreamRef = useRef<MediaStream | null>(null);
  useEffect(() => {
    preJoinMediaStreamRef.current = preJoinMediaStream;
  }, [preJoinMediaStream]);

  // chatInput — now in useArenaChat hook (initialized below)
  /** Chat en overlay bas-gauche (pas de sidebar) */
  const [mediatorSidebarOpen, setMediatorSidebarOpen] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);
  const [showArenaMenu, setShowArenaMenu] = useState(false);
  const { openDrawer } = useMessagesDrawer();
  const [isCinematicMode, setIsCinematicMode] = useState(false);
  const [showVsScreen, setShowVsScreen] = useState(true);
  /** Spectateur promu co-hôte : le médiateur a accepté l’invitation (beef_participants). */
  const [acceptedInviteAlert, setAcceptedInviteAlert] = useState(false);
  /** Spectateur invité par le Ref en direct. */
  const [refInviteAlert, setRefInviteAlert] = useState(false);

  useEffect(() => {
    if (isViewer && userId) {
      void supabase
        .from('beef_invitations')
        .select('status')
        .eq('beef_id', roomId)
        .eq('invitee_id', userId)
        .eq('status', 'sent')
        .maybeSingle()
        .then(({ data }) => {
          if (data?.status === 'sent') setRefInviteAlert(true);
        });
    }
  }, [isViewer, userId, roomId]);

  // ── AURA "FERVEUR SOCIALE" ──
  const [auras, setAuras] = useState<Record<ChallengerSlotId, number>>(createEmptyChallengerAuras);
  const auraA = auras.A;
  const auraB = auras.B;
  const auraC = auras.C;
  const auraD = auras.D;
  const [auraMed, setAuraMed] = useState(0);
  const [auraFeverMed, setAuraFeverMed] = useState(false);
  /** Heat Index global : activité de la salle (chat, spectateurs, réactions) — lueur chaude sur le bandeau vidéo. */
  const [globalHeat, setGlobalHeat] = useState(0);
  // handsRaised + refInvites now in usePendingInvites hook (initialized below after isHost)
  const [parolePresetSec, setParolePresetSec] = useState(60);
  const [announcementTicker, setAnnouncementTicker] = useState('');
  const [gloryChallengerSlot, setGloryChallengerSlot] = useState<null | 'A' | 'B'>(null);

  const mediatorGraceRef = useRef<NodeJS.Timeout | null>(null);
  const [mediatorGraceActive, setMediatorGraceActive] = useState(false);
  const [mediatorGraceSeconds, setMediatorGraceSeconds] = useState(0);
  const mediatorWasConnectedRef = useRef(false);
  /** True dès qu’au moins un challenger attendu a été vu dans la room Daily (évite la fin auto tant qu’on attend les connexions). */
  const challengersEverJoinedRef = useRef(false);
  /** Évite de spammer le toast « challengers partis » tant que la room reste vide */
  const challengersAllLeftNotifiedRef = useRef(false);
  /** Supprime le toast « challengers partis » juste après un kick volontaire */
  const recentKickRef = useRef(false);
  const walletBalance = useWalletStore((s) => s.balance);
  const walletInit = useWalletStore((s) => s.initialize);
  // profileFollowsTarget — now in useArenaProfile hook (initialized below)

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
    slot: ChallengerSlotId;
  } | null>(null);

  /** Débat structuré (budget challengers, tours imposés, micros) */
  const [structuredDebateEnabled, setStructuredDebateEnabled] = useState(false);
  const [debateBudgetMinutes, setDebateBudgetMinutes] = useState(60);
  const [challengerBudgetRemaining, setChallengerBudgetRemaining] = useState(60 * 60);
  /** Quand le médiateur parle : les chronos challengers sont en pause (ne consomment pas le budget) */
  const [mediatorHoldingFloor, setMediatorHoldingFloor] = useState(false);
  /** Coupure micro imposée par le médiateur (broadcast — le toggle local seul ne suffisait pas) */
  const [micMutedByMediator, setMicMutedByMediator] = useState(false);

  const addMessage = useArenaVolatileStore((s) => s.addMessage);
  const deleteMessage = useArenaVolatileStore((s) => s.deleteMessage);
  const clearMessages = useArenaVolatileStore((s) => s.clearMessages);
  const addReaction = useArenaVolatileStore((s) => s.addReaction);
  const clearReactions = useArenaVolatileStore((s) => s.clearReactions);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportTargetUser, setReportTargetUser] = useState<{
    id: string;
    userName: string;
  } | null>(null);
  const { isOffline } = useNetworkStatus({
    onOffline: () => toast('Connexion perdue — reconnexion...', 'error'),
    onOnline: () => toast('Connexion rétablie', 'success'),
  });
  // contextMenuMsg — now in useArenaChat hook (initialized below)
  const { unreadDMsCount } = useUnreadDMs(supabase, userId);
  const [showAllReactions, setShowAllReactions] = useState(false); // NEW: Toggle pour afficher toutes les réactions
  /** Portail body : cadeaux / panneau réactions au-dessus de la vidéo (z-50) */
  const [dockPickersMounted, setDockPickersMounted] = useState(false);
  const [dockPickerPos, setDockPickerPos] = useState<{ bottom: number; right: number } | null>(null);
  /** Colonne emoji / cadeaux / partage — fermeture au tap extérieur */
  const reactionDockRef = useRef<HTMLDivElement | null>(null);
  const announcementClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Accumulateur d’Aura (réactions / tap intégrés) — flush réseau ~1,5 s pour limiter le flood. */
  const auraBufferRef = useRef<AuraBatchPayload>(createZeroAuraBatch());
  /** Snapshot pour `aura_master_sync` (intervalle sans recréer la closure). */
  const auraSnapshotRef = useRef<AuraBatchPayload>(createZeroAuraBatch());

  useEffect(() => {
    auraSnapshotRef.current = { ...createZeroAuraBatch(), ...auras, M: auraMed };
  }, [auras, auraMed]);

  useEffect(() => {
    setDockPickersMounted(true);
  }, []);

  const measureDockPickerPosition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (!showAllReactions && !showGiftPicker) {
      setDockPickerPos(null);
      return;
    }
      let el = document.getElementById('dock-desktop');
      if (!el || el.clientWidth === 0) el = document.getElementById('dock-mobile');
      if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 && r.height < 4) return;
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
      const target = e.target;
      if (target instanceof Element) {
        if (target.closest('#dock-desktop') || target.closest('#dock-mobile') || target.closest('[data-arena-dock-popover]')) return;
      }
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

  /** Clic extérieur → fermer la régie (le backdrop gère déjà le tap sur le voile) */
  useEffect(() => {
    if (!mediatorSidebarOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (document.querySelector('[data-mediator-regie-sheet]')?.contains(t)) return;
      if (document.querySelector('[data-mediator-sidebar-toggle]')?.contains(t)) return;
      setMediatorSidebarOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [mediatorSidebarOpen]);

  useEffect(() => {
    if (!gloryChallengerSlot) return;
    const t = setTimeout(() => setGloryChallengerSlot(null), 15_000);
    return () => clearTimeout(t);
  }, [gloryChallengerSlot]);

  // Moderator controls — même logique normalisée que les pages arène / live (UUID casse / espaces).
  const isHost = userIdsEqual(userId, host.id);

  const {
    handsRaised,
    refInvites,
    fetchPendingInvites,
    handleAcceptPendingInvite,
    handleRejectPendingInvite,
  } = usePendingInvites({ isHost, roomId, supabaseClient: supabase, toast, runBeefManage });

  // Use refs for stats so endBeef captures the latest values without stale closures
  const statsRef = useRef({
    beefTimeRemaining: DEFAULT_BEEF_DURATION,
    liveViewerCount: 0,
    messagesCount: 0,
    /** Résonance « distante » (réactions reçues en broadcast), cumulée côté client. */
    votesA: 0,
    votesB: 0,
    votesC: 0,
    votesD: 0,
    votesE: 0,
    votesF: 0,
  });


  const addRemoteReaction = useCallback((emoji: string, supportSlot?: ArenaSupportSlotId | null) => {
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji)) {
      if (supportSlot === 'A') {
        statsRef.current.votesA += 1;
        return;
      }
      if (supportSlot === 'B') {
        statsRef.current.votesB += 1;
        return;
      }
      if (supportSlot === 'C') {
        statsRef.current.votesC += 1;
        return;
      }
      if (supportSlot === 'D') {
        statsRef.current.votesD += 1;
        return;
      }
      if (supportSlot === 'E') {
        statsRef.current.votesE += 1;
        return;
      }
      if (supportSlot === 'F') {
        statsRef.current.votesF += 1;
        return;
      }
      if (supportSlot === 'M') {
        setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
        return;
      }
    }
    const entry = createFlyingReactionEntry(emoji);
    addReaction({
      emoji: entry.emoji,
      x: entry.x,
      opacityMul: entry.opacityMul ?? 1,
      scaleMul: entry.scaleMul ?? 1,
    });
  }, [addReaction]);

  /** Boost par tap / réaction soutenue : fixe 15 (équitable, généreux vs decay −3 / 500 ms). */
  const getAuraBoost = () => 15;

  const emitTapSupport = useCallback(
    (target: ArenaSupportSlotId) => {
      if (requireAuth('Fais grimper l\'Aura', 'Crée un compte gratuit pour tapoter l\'écran et soutenir tes favoris !')) return;
      const boost = getAuraBoost();
      setGlobalHeat((v) => Math.min(100, v + 2));
      if (target === 'M') {
        setSupportBurst((p) => ({ ...p, M: p.M + 1 }));
        setAuraMed((v) => Math.min(AURA_DISPLAY_CAP, v + boost));
      } else {
        setSupportBurst((p) => ({ ...p, [target]: p[target] + 1 }));
        setAuras((prev) => ({
          ...prev,
          [target]: Math.min(AURA_DISPLAY_CAP, prev[target] + boost),
        }));
      }
      auraBufferRef.current[target] += boost;
    },
    [requireAuth],
  );

  useEffect(() => {
    if (!isHost || !mediatorSidebarOpen) return;
    void fetchPendingInvites();
  }, [isHost, mediatorSidebarOpen, fetchPendingInvites]);

  const goBuyPoints = useCallback(() => {
    const width = 450;
    const height = 750;
    const left = (window.innerWidth / 2) - (width / 2);
    const top = (window.innerHeight / 2) - (height / 2);
    window.open('/buy-points', 'StripeCheckout', `width=${width},height=${height},top=${top},left=${left}`);
  }, []);

  // Participant roles from DB — extracted hook
  const {
    participantRoles, participantUidOrder, rolesLoaded, expectedUids, loadParticipants,
  } = useParticipantRoles({
    roomId, userId, hostId: host.id, isViewer, isHost,
    supabaseClient: supabase, toast,
  });

  // ── BEEF TIMER (extracted hook) ──
  const {
    beefTimeRemaining, setBeefTimeRemaining,
    timerActive, setTimerActive,
    timerPaused, setTimerPaused,
    startingBeef,
    beefTimeRemainingRef, timerActiveRef, timerPausedRef,
    beefEndsAtMsRef, beefWallClockStartedAtRef,
    beefWarning5Shown, beefWarning1Shown,
    isHostRef,
    beefGlobalTimerFlushRef, scheduleBeefGlobalTimerBroadcast,
    adjustBeefTime, resetBeefTimerToFull, pauseBeefTimer, resumeBeefTimer,
    handleStartBeef, endBeefRef,
  } = useBeefTimer({ isHost, roomId, toast, runBeefManage });

  const leaveRef = useRef<() => Promise<void>>(async () => {});
  const stopAllMediaTracksRef = useRef<() => void>(() => {});
  const arenaOutboundRef = useRef<Partial<UseArenaRealtimeResult>>({});

  // ── CHAT (extracted hook) ──
  const {
    chatInput, setChatInput, contextMenuMsg, setContextMenuMsg,
    seenMsgKeys, messageSendChainRef, addRemoteMessage,
    handleSendMessage, handleDeleteMessage,
  } = useArenaChat({
    roomId, userId, userName, supabaseClient: supabase, toast, requireAuth,
    addMessage, deleteMessage, clearMessages, clearReactions,
    setGlobalHeat, arenaOutboundRef,
  });

  const resetPulseVoices = useArenaPulseVoicesStore((s) => s.reset);
  const resetArenaVerdict = useArenaVerdictStore((s) => s.reset);
  const addPulseVoices = useArenaPulseVoicesStore((s) => s.addPulse);
  const pulseBroadcastPending = useRef({ A: 0, B: 0 });

  const pulseBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myVote, setMyVote] = useState<ChallengerSlotId | null>(null);
  const lastPulseSideRef = useRef<ChallengerSlotId | null>(null);
  const [supportBurst, setSupportBurst] = useState<AuraBatchPayload>(createZeroAuraBatch);
  const supportBurstRef = useRef(supportBurst);
  useEffect(() => {
    supportBurstRef.current = supportBurst;
  }, [supportBurst]);
  const [giftPrestigeFlash, setGiftPrestigeFlash] = useState(0);
  const rematchExitTimerRef = useRef<number | null>(null);

  // ── BEEF LIFECYCLE (extracted hook) ──
  const {
    beefEnded, setBeefEnded,
    endSummary, setEndSummary,
    beefEndedRef, endSummaryTimerRef,
    verdictConfetti, setVerdictConfetti,
    rematchSequence, setRematchSequence,
    rematchVerdictTimerRef,
    endBeef, handleMediatorVerdict,
  } = useBeefLifecycle({
    roomId, userId, isHost, runBeefManage,
    stopAllMediaTracksRef, leaveRef, arenaOutboundRef,
    beefEndsAtMsRef, beefWallClockStartedAtRef,
    statsRef, supportBurstRef,
  });

  /** Mémorise le panneau « préféré » pour les réactions intégrées (pas de compteur de vote). */
  const preferSide = useCallback((side: ArenaSupportSlotId) => {
    if (side !== 'M') {
      setMyVote(side);
      lastPulseSideRef.current = side;
    }
  }, []);

  const flushPulseBroadcast = useCallback(() => {
    pulseBroadcastTimerRef.current = null;
    const p = pulseBroadcastPending.current;
    const dA = p.A;
    const dB = p.B;
    p.A = 0;
    p.B = 0;
    if (dA === 0 && dB === 0) return;
    arenaOutboundRef.current.broadcastPulseVoice?.(dA, dB);
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
    statsRef.current.votesA = 0;
    statsRef.current.votesB = 0;
    statsRef.current.votesC = 0;
    statsRef.current.votesD = 0;
    statsRef.current.votesE = 0;
    statsRef.current.votesF = 0;
    setSupportBurst(createZeroAuraBatch());
    setAuras(createEmptyChallengerAuras());
  }, [roomId, resetPulseVoices, resetArenaVerdict]);

  useEffect(() => {
    return () => {
      if (pulseBroadcastTimerRef.current) {
        clearTimeout(pulseBroadcastTimerRef.current);
        pulseBroadcastTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => { endBeefRef.current = endBeef; }, [endBeef]);
  useEffect(() => {
    statsRef.current = {
      ...statsRef.current,
      beefTimeRemaining,
      messagesCount: useArenaVolatileStore.getState().messages.length,
    };
  }, [beefTimeRemaining]);

  useEffect(() => {
    return useArenaVolatileStore.subscribe((state) => {
      statsRef.current.messagesCount = state.messages.length;
    });
  }, []);

  const formatBeefTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // ── Aura decay (−3 toutes les 500ms) ──
  const auraFeverRef = useRef(false);
  useEffect(() => { auraFeverRef.current = auraFeverMed; }, [auraFeverMed]);

  useEffect(() => {
    if (!isHost) return;
    const iv = setInterval(() => {
      setAuras((prev) => {
        const next = { ...prev };
        for (const id of CHALLENGER_SLOT_IDS) {
          next[id] = Math.max(0, prev[id] - 3);
        }
        return next;
      });
      if (!auraFeverRef.current) {
        setAuraMed((v) => Math.max(0, v - 3));
      }
    }, 500);
    return () => clearInterval(iv);
  }, [isHost]);

  useEffect(() => {
    const iv = window.setInterval(() => {
      setGlobalHeat((v) => Math.max(0, v - 1));
    }, 1000);
    return () => window.clearInterval(iv);
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

  useEffect(() => {
    challengersEverJoinedRef.current = false;
  }, [roomId]);

  // Mediator leaving triggers endBeef
  const handleLeaveAsMediator = useCallback(async () => {
    if (isHost) {
      await endBeef('Le Ref a mis fin au beef');
    }
  }, [isHost, endBeef]);

  useEffect(() => {
    if (!userId) return;
    void walletInit(userId);
  }, [userId, walletInit]);

  const effectiveDailyRoomUrl = dailyRoomUrl ?? null;
  const meetingTokenForDaily = dailyMeetingToken ?? null;

  const {
    join,
    leave,
    stopCamera,
    toggleMic,
    toggleCam,
    setLocalAudioEnabled,
    hardMuteParticipant,
    ejectRemoteParticipant,
    isJoined,
    isJoining,
    micEnabled,
    camEnabled,
    physicalPeers,
    localParticipant,
    remoteParticipants,
    activeSpeakerPeerId,
    isCameraInterrupted,
    recoverMediaDevices,
    networkQuality,
    flipCamera,
  } = useDailyCall(effectiveDailyRoomUrl, userName, isViewer, userId, meetingTokenForDaily);

  const stopAllMediaTracks = useCallback(() => {
    const stopped = new Set<MediaStreamTrack>();
    const stopTrack = (track: MediaStreamTrack | null | undefined) => {
      if (!track || stopped.has(track)) return;
      stopped.add(track);
      try {
        track.stop();
      } catch {
        /* ignore */
      }
    };

    preJoinMediaStreamRef.current?.getTracks().forEach(stopTrack);

    if (localParticipant?.videoTrack) stopTrack(localParticipant.videoTrack);
    if (localParticipant?.audioTrack) stopTrack(localParticipant.audioTrack);

    for (const peer of physicalPeers) {
      if (!peer.isLocal) continue;
      stopTrack(peer.videoTrack);
      stopTrack(peer.audioTrack);
    }

    try {
      stopCamera();
    } catch {
      /* ignore */
    }

    preJoinMediaStreamRef.current = null;
    setPreJoinMediaStream(null);
  }, [localParticipant, physicalPeers, stopCamera]);

  useEffect(() => {
    stopAllMediaTracksRef.current = stopAllMediaTracks;
  }, [stopAllMediaTracks]);

  useEffect(() => {
    return () => {
      stopAllMediaTracksRef.current();
    };
  }, []);

  const reconcileExpected = useMemo(
    (): ReconcileExpectedRoles => ({
      mediatorUserId: host.id,
      mediatorDisplayName: host.name,
      challengerUidsOrdered: expectedUids,
      roles: participantRoles,
    }),
    [host.id, host.name, expectedUids, participantRoles],
  );

  const reconciledPeers = useMemo(
    () => reconcilePeers(physicalPeers, reconcileExpected),
    [physicalPeers, reconcileExpected],
  );

  /** Grille challengers : index = slot attribué par reconcilePeers (A=0 … F=5). */
  const challengerRemoteSlots = useMemo((): Array<CallParticipant | null> => {
    const panels: Array<CallParticipant | null> = Array.from(
      { length: ARENA_CHALLENGER_SLOT_COUNT },
      () => null,
    );
    for (const r of reconciledPeers) {
      const idx = r.semantic.expectedSlotIndex;
      if (idx >= 0 && idx < ARENA_CHALLENGER_SLOT_COUNT) {
        panels[idx] = physicalPeerToCallParticipant(r.physical);
      }
    }
    return panels;
  }, [reconciledPeers]);

  const displayPanelsFixed = challengerRemoteSlots;

  const hostRemoteParticipant = useMemo((): CallParticipant | null => {
    if (isHost) return null;
    const m = reconciledPeers.find((r) => r.semantic.expectedSlotIndex === -1);
    return m ? physicalPeerToCallParticipant(m.physical) : null;
  }, [isHost, reconciledPeers]);

  useEffect(() => {
    leaveRef.current = leave;
  }, [leave]);

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

  // Médiateur : mémoriser qu’un challenger invité est réellement entré dans la room (réconciliation identité)
  useEffect(() => {
    if (!isHost || !isJoined) return;
    const expectedChallengerSlots = Object.keys(participantRoles).filter((uid) => uid !== host.id);
    if (expectedChallengerSlots.length === 0) return;
    const anyChallengerPresent = reconciledPeers.some(
      (r) =>
        r.semantic.expectedSlotIndex >= 0 &&
        r.semantic.kind === 'expected' &&
        !r.physical.isLocal,
    );
    if (anyChallengerPresent) {
      challengersEverJoinedRef.current = true;
    }
  }, [isHost, isJoined, reconciledPeers, participantRoles, host.id]);

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
                'Le Ref est toujours absent — le direct reste ouvert jusqu’à son retour ou la fin côté Ref.',
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
      toast('Le Ref est de retour', 'success');
    }

    if (remoteParticipants.length > 0) {
      challengersAllLeftNotifiedRef.current = false;
    }
  }, [remoteParticipants, isJoined, isHost, host.id, host.name, participantRoles, mediatorGraceActive, toast]);

  const joinAttemptedRef = useRef(false);
  // Auto-join quand « Rejoindre » + URL Daily + jeton (fournis par la page parente).
  useEffect(() => {
    // CORRECTION ARCHITECTURALE :
    // Les Spectateurs ne passent pas par le SAS de préparation caméra (qui passe hasJoined à true).
    // Ils doivent être connectés instantanément au réseau WebRTC.
    const isReadyToConnect = isViewer || hasJoined;

    if (!isReadyToConnect || !effectiveDailyRoomUrl || !meetingTokenForDaily || isJoined || isJoining || joinAttemptedRef.current) {
      return;
    }

    joinAttemptedRef.current = true;
    void join(preJoinMediaStream, { camEnabled: preJoinCamEnabled });
  }, [hasJoined, effectiveDailyRoomUrl, meetingTokenForDaily, isJoined, isJoining, join, preJoinMediaStream, preJoinCamEnabled, isViewer]);

  const handleRaiseHand = useCallback(async () => {
    if (!userId || !roomId) return;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/beef/raise-hand', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ beefId: roomId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || 'Erreur');
      toast('Demande envoyée ! Le Ref va te répondre.', 'success');
    } catch (error) {
      console.error('Erreur lors de la demande');
      const msg = error instanceof Error ? error.message : 'Impossible d’envoyer la demande.';
      toast(msg, 'error');
    }
  }, [userId, roomId, toast]);

  const hasExpectedChallengers = useMemo(
    () => Object.keys(participantRoles).some((uid) => uid !== host.id),
    [participantRoles, host.id],
  );

  /** Spectateur : LIVE « chaud » — au moins un slot grille 0–3 avec flux (y compris orphelins). */
  const challengerOnAir = useMemo(() => {
    const hasGridVideo = reconciledPeers.some(
      (r) => r.semantic.expectedSlotIndex >= 0 && r.physical.videoTrack,
    );
    if (hasGridVideo) return true;
    if (!isViewer) return false;
    const nonMediator = remoteParticipants.filter(
      (p) => !remoteMatchesMediator(p, host.id, host.name),
    );
    if (nonMediator.length === 0) return false;
    if (!hasExpectedChallengers) return true;
    return false;
  }, [reconciledPeers, remoteParticipants, host.id, host.name, isViewer, hasExpectedChallengers]);

  const liveBadgeHot = isViewer ? challengerOnAir : isJoined;

  const leftPanel = isHost
    ? challengerRemoteSlots[0] ?? null
    : isViewer
      ? challengerRemoteSlots[0] ?? null
      : localParticipant;
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

  const getSlotForUser = useCallback(
    (uid?: string | null): ChallengerSlotId => {
      if (!uid) return 'A';
      const idx = expectedUids.indexOf(uid);
      if (idx >= 0) return indexToChallengerSlot(idx);
      const j = challengerRemoteSlots.findIndex((p) => p && p.arenaUserId === uid);
      if (j >= 0) return indexToChallengerSlot(j);
      return 'A';
    },
    [expectedUids, challengerRemoteSlots],
  );

  const expectedChallengers = useMemo(
    () =>
      Object.values(participantRoles)
        .filter((r) => r.role !== 'mediator' && r.role !== 'host')
        .map((r) => r.name),
    [participantRoles],
  );

  const mediatorParticipant = isHost ? localParticipant : hostRemoteParticipant;
  const mediatorIsLocal = isHost;
  const mediatorName = isHost ? userName : host.name;

  // ── GIFT SEND (extracted hook) ──
  const { giftTarget, setGiftTarget, giftRecipients, sendGift } = useGiftSend({
    roomId, userId, userName, hostId: host.id, hostName: host.name, mediatorName,
    challengerRemoteSlots, toast, arenaOutboundRef,
    addRemoteMessage, setAuraMed, setGiftPrestigeFlash, setShowGiftPicker, goBuyPoints,
  });

  const mediatorMicEnabled = mediatorIsLocal ? micEnabled : !!mediatorParticipant?.audioOn;

  /** Halos néon (Phase 2) : parole réelle Daily + micro ouvert sur la piste audio. */
  const leftNeonAudio =
    !!effectiveDailyRoomUrl &&
    !!leftPanel &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === leftPanel.sessionId &&
    leftPanel.audioOn;

  const rightNeonAudio =
    !!effectiveDailyRoomUrl &&
    !!rightPanel &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === rightPanel.sessionId &&
    rightPanel.audioOn;

  const mediatorNeonAudio =
    !!effectiveDailyRoomUrl &&
    !!mediatorParticipant &&
    !!activeSpeakerPeerId &&
    activeSpeakerPeerId === mediatorParticipant.sessionId &&
    mediatorParticipant.audioOn;

  const mediatorRemoteRows = useMemo((): MediatorRemoteRow[] => {
    if (!isHost || !effectiveDailyRoomUrl) return [];
    const challengerSlotCount = Math.min(
      ARENA_CHALLENGER_SLOT_COUNT,
      Math.max(expectedUids.length, challengerRemoteSlots.length),
    );
    if (expectedUids.length === 0) {
      return challengerRemoteSlots.slice(0, challengerSlotCount).map((p, idx) => {
        const r = reconciledPeers.find((x) => x.semantic.expectedSlotIndex === idx);
        const orphan = r?.semantic.kind === 'orphan';
        return {
          sessionId: p?.sessionId ?? '',
          label: orphan
            ? `@${ORPHAN_GUEST_LABEL}`
            : p?.userName || `Participant ${idx + 1}`,
          slot: indexToChallengerSlot(idx),
          debaterId: p?.arenaUserId ?? null,
          audioOn: p?.audioOn ?? false,
        };
      });
    }
    return expectedUids.slice(0, ARENA_CHALLENGER_SLOT_COUNT).map((uid, idx) => {
      const panel = displayPanelsFixed[idx];
      const slot = indexToChallengerSlot(idx);
      const r = reconciledPeers.find((x) => x.semantic.expectedSlotIndex === idx);
      const label =
        r?.semantic.kind === 'orphan'
          ? `@${ORPHAN_GUEST_LABEL}`
          : participantRoles[uid]?.name?.trim() || panel?.userName || `Participant ${idx + 1}`;
      const debaterId =
        r?.semantic.kind === 'orphan' ? panel?.arenaUserId ?? null : uid;
      return {
        sessionId: panel?.sessionId ?? '',
        label,
        slot,
        debaterId,
        audioOn: panel?.audioOn ?? false,
      };
    });
  }, [
    isHost,
    effectiveDailyRoomUrl,
    expectedUids,
    displayPanelsFixed,
    participantRoles,
    challengerRemoteSlots,
    reconciledPeers,
  ]);


  const hotMicSpeakerSlot = useMemo((): ChallengerSlotId | null => {
    if (!speakingTurnActive || !speakingTurnTarget) return null;
    for (const p of challengerRemoteSlots) {
      if (p && p.arenaUserId === speakingTurnTarget) {
        return getSlotForUser(p.arenaUserId);
      }
    }
    return null;
  }, [speakingTurnActive, speakingTurnTarget, challengerRemoteSlots, getSlotForUser]);

  /** Slot affiché sur les panneaux (spectateurs : parfois pas de match arenaUserId → fallback bannière). */
  const effectiveHotMicSpeakerSlot = useMemo((): ChallengerSlotId | null => {
    if (!speakingTurnActive) return null;
    return hotMicSpeakerSlot ?? floorAnnouncement?.slot ?? null;
  }, [speakingTurnActive, hotMicSpeakerSlot, floorAnnouncement]);

  // Multi-participant system
  const {
    debaters, setDebaters, inviteInput, setInviteInput, inviteExcludeParticipantIds,
    removeDebater, inviteDebater, handleInviteFromModal,
  } = useDebaterInvites({
    roomId, userId, supabaseClient: supabase, toast, runBeefManage, fetchPendingInvites,
  });

  const handleMediatorChallengerMute = useCallback(
    (sessionId: string, debaterId: string | null, muted: boolean) => {
      hardMuteParticipant(sessionId, muted);
      if (debaterId) {
        setDebaters((prev) =>
          prev.map((d) => (d.id === debaterId ? { ...d, isMuted: muted } : d)),
        );
        arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(debaterId, muted);
        /** Couper le micro du locuteur actif = fin du tour de parole (chrono arrêté) */
        if (muted && debaterId === speakingTurnTargetRef.current) {
          setSpeakingTurnPaused(false);
          stopTimerRef.current();
        }
      }
    },
    [hardMuteParticipant],
  );

  const handleMuteAll = useCallback(() => {
    for (const p of remoteParticipants) {
      if (p.isLocal) continue;
      hardMuteParticipant(p.sessionId, true);
    }
    toast('Silence imposé à tous', 'info');
  }, [remoteParticipants, hardMuteParticipant, toast]);

  // User profiles — now in useArenaProfile hook
  const {
    showProfile, setShowProfile, selectedProfile, setSelectedProfile,
    profileFollowsTarget, setProfileFollowsTarget, profileCache,
    openProfile, toggleFollowProfileTarget,
  } = useArenaProfile({ userId, supabaseClient: supabase, toast, requireAuth });

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


  const handleReaction = (emoji: string) => {
    if (requireAuth('Donne de la force', 'Crée un compte gratuit pour envoyer des réactions.')) return;
    onReaction(emoji);

    const integrated = INTEGRATED_SUPPORT_REACTIONS.has(emoji);
    const slotPick: ChallengerSlotId = myVote ?? lastPulseSideRef.current ?? 'A';
    const isHeartEmoji = emoji === '❤️' || emoji === HEART_ON_FIRE;
    const heartTarget: ArenaSupportSlotId =
      isHeartEmoji && speakingTurnActive && effectiveHotMicSpeakerSlot
        ? effectiveHotMicSpeakerSlot
        : isHeartEmoji
          ? 'M'
          : slotPick;

    if (integrated && isHeartEmoji) {
      const boost = getAuraBoost();
      if (heartTarget === 'M') {
        setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
        setAuraMed((v) => Math.min(300, v + boost));
      } else {
        setSupportBurst((prev) => ({ ...prev, [heartTarget]: prev[heartTarget] + 1 }));
        setAuras((prev) => ({
          ...prev,
          [heartTarget]: Math.min(AURA_DISPLAY_CAP, prev[heartTarget] + boost),
        }));
      }
      auraBufferRef.current[heartTarget] += boost;
      const xPercent =
        heartTarget === 'A'
          ? 14 + Math.random() * 16
          : heartTarget === 'B'
            ? 70 + Math.random() * 16
            : heartTarget === 'C'
              ? 82 + Math.random() * 10
              : heartTarget === 'D'
                ? 38 + Math.random() * 24
                : heartTarget === 'E'
                  ? 52 + Math.random() * 20
                  : heartTarget === 'F'
                    ? 62 + Math.random() * 18
                    : 44 + Math.random() * 12;
      const entry = createFlyingReactionEntry(emoji, {
        x: xPercent,
        opacityMul: 0.5,
        scaleMul: 0.82,
      });
      addReaction({
        emoji: entry.emoji,
        x: entry.x,
        opacityMul: entry.opacityMul ?? 1,
        scaleMul: entry.scaleMul ?? 1,
      });
    } else if (integrated) {
      const boost = getAuraBoost();
      setSupportBurst((prev) => ({ ...prev, [slotPick]: prev[slotPick] + 1 }));
      setAuras((prev) => ({
        ...prev,
        [slotPick]: Math.min(AURA_DISPLAY_CAP, prev[slotPick] + boost),
      }));
      auraBufferRef.current[slotPick] += boost;
      const entry = createFlyingReactionEntry(emoji);
      addReaction({
        emoji: entry.emoji,
        x: entry.x,
        opacityMul: entry.opacityMul ?? 1,
        scaleMul: entry.scaleMul ?? 1,
      });
    } else {
      const entry = createFlyingReactionEntry(emoji);
      addReaction({
        emoji: entry.emoji,
        x: entry.x,
        opacityMul: entry.opacityMul ?? 1,
        scaleMul: entry.scaleMul ?? 1,
      });
    }

    if (!integrated) {
      arenaOutboundRef.current.broadcastReaction?.(emoji);
    }
    supabase.from('beef_reactions').insert({ beef_id: roomId, user_id: userId, emoji }).then(() => {});
  };

  // Messages and reactions are now received via Broadcast channel above

  const toggleMediatorFloor = () => {
    if (!isHost) return;
    setMediatorHoldingFloor((prev) => {
      const next = !prev;
      arenaOutboundRef.current.broadcastMediatorFloor?.(next);
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
    arenaOutboundRef.current.broadcastMediationToss?.(pick.id, pick.name);
  };

  const startTimer = (debaterId: string) => {
    setSpeakingTurnPaused(false);
    setMediatorHoldingFloor(false);
    arenaOutboundRef.current.broadcastMediatorFloor?.(false);
    setSpeakingTurnActive(true);
    setSpeakingTurnTarget(debaterId);
    setSpeakingTurnRemaining(speakingTurnDuration);

    setDebaters((prev) =>
      prev.map((d) =>
        d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true },
      ),
    );

    const panelMatch = challengerRemoteSlots.find((p) => p && p.arenaUserId === debaterId);
    const slot = panelMatch?.arenaUserId ? getSlotForUser(panelMatch.arenaUserId) : undefined;
    const speakerLabel =
      debaters.find((d) => d.id === debaterId)?.name ??
      panelMatch?.userName ??
      'Intervenant';
    if (slot) {
      setFloorAnnouncement({ name: speakerLabel, slot });
    }
    arenaOutboundRef.current.broadcastSpeakingTurn?.({
      action: 'start',
      debaterId,
      duration: speakingTurnDuration,
      slot,
      speakerName: speakerLabel,
    });
    arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(debaterId, false);

  };

  const startHotMicTurn = useCallback(
    (slot: ChallengerSlotId, durationSec: number, opts?: { force?: boolean }) => {
      if (speakingTurnActive && !opts?.force) {
        toast('Un tour de parole est déjà en cours.', 'info');
        return;
      }
      if (opts?.force && speakingTurnActive) {
        stopTimerRef.current();
      }
      setSpeakingTurnPaused(false);
      const duration = Math.max(15, Math.min(600, Math.round(durationSec / 5) * 5));
      const activePanel = challengerRemoteSlots[challengerSlotToIndex(slot)] ?? null;
      const debaterId = activePanel?.arenaUserId ?? null;
      if (!debaterId || !activePanel?.sessionId) {
        toast('Challenger non connecté pour ce slot.', 'info');
        return;
      }
      setSpeakingTurnDuration(duration);
      setMediatorHoldingFloor(false);
      arenaOutboundRef.current.broadcastMediatorFloor?.(false);
      for (const p of challengerRemoteSlots) {
        if (!p?.sessionId || !p.arenaUserId) continue;
        const isSpeaker = p.sessionId === activePanel.sessionId;
        hardMuteParticipant(p.sessionId, !isSpeaker);
        arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(
          p.arenaUserId,
          !isSpeaker,
        );
      }

      setSpeakingTurnActive(true);
      setSpeakingTurnTarget(debaterId);
      setSpeakingTurnRemaining(duration);

      setDebaters((prev) =>
        prev.map((d) =>
          d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true },
        ),
      );

      const speakerLabel =
        debaters.find((d) => d.id === debaterId)?.name ??
        activePanel.userName ??
        `Challenger ${slot}`;
      setFloorAnnouncement({ name: speakerLabel, slot });

      arenaOutboundRef.current.broadcastSpeakingTurn?.({
        action: 'start',
        debaterId,
        duration,
        slot,
        speakerName: speakerLabel,
      });
    },
    [
      speakingTurnActive,
      challengerRemoteSlots,
      hardMuteParticipant,
      toast,
      debaters,
    ],
  );

  const stopTimer = useCallback(() => {
    setSpeakingTurnPaused(false);
    setFloorAnnouncement(null);
    const endedSpeakerId = speakingTurnTargetRef.current;
    if (isHost && endedSpeakerId) {
      const p = challengerRemoteSlots.find((x) => x && x.arenaUserId === endedSpeakerId);
      const sid = p?.sessionId;
      if (sid) hardMuteParticipant(sid, true);
      arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(endedSpeakerId, true);
    }

    setSpeakingTurnActive(false);
    setSpeakingTurnTarget(null);
    if (speakingTurnIntervalRef.current) {
      clearInterval(speakingTurnIntervalRef.current);
      speakingTurnIntervalRef.current = null;
    }

    setDebaters((prev) =>
      structuredDebateEnabled ? prev.map((d) => ({ ...d, isMuted: true })) : prev,
    );

    if (isHost) {
      arenaOutboundRef.current.broadcastSpeakingTurn?.({ action: 'stop' });
    }
  }, [isHost, structuredDebateEnabled, hardMuteParticipant, challengerRemoteSlots]);

  const pauseSpeakingTurn = useCallback(() => {
    if (!speakingTurnActive) return;
    setSpeakingTurnPaused(true);
    if (isHost && hotMicSpeakerSlot) {
      const idx =
        hotMicSpeakerSlot === 'A'
          ? 0
          : hotMicSpeakerSlot === 'B'
            ? 1
            : hotMicSpeakerSlot === 'C'
              ? 2
              : 3;
      const panel = challengerRemoteSlots[idx];
      const sid = panel?.sessionId;
      const uid = panel?.arenaUserId ?? null;
      if (sid && uid) {
        hardMuteParticipant(sid, true);
        arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(uid, true);
      }
    }
    arenaOutboundRef.current.broadcastSpeakingTurn?.({ action: 'pause' });
  }, [
    speakingTurnActive,
    isHost,
    hotMicSpeakerSlot,
    challengerRemoteSlots,
    hardMuteParticipant,
  ]);

  const resumeSpeakingTurn = useCallback(() => {
    if (!speakingTurnActive) return;
    setSpeakingTurnPaused(false);
    if (isHost && hotMicSpeakerSlot) {
      const idx =
        hotMicSpeakerSlot === 'A'
          ? 0
          : hotMicSpeakerSlot === 'B'
            ? 1
            : hotMicSpeakerSlot === 'C'
              ? 2
              : 3;
      const panel = challengerRemoteSlots[idx];
      const sid = panel?.sessionId;
      const uid = panel?.arenaUserId ?? null;
      if (sid && uid) {
        hardMuteParticipant(sid, false);
        arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(uid, false);
      }
    }
    arenaOutboundRef.current.broadcastSpeakingTurn?.({ action: 'resume' });
  }, [
    speakingTurnActive,
    isHost,
    hotMicSpeakerSlot,
    challengerRemoteSlots,
    hardMuteParticipant,
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
      if (!floorHotMic) {
        setLocalAudioEnabled(false); // Coupe forcée si ce n'est pas son tour
      }
      return; // Si c'est son tour, on quitte l'effet pour le laisser libre de son bouton
    }
    if (!structuredDebateEnabled) {
      return; // En débat libre, on quitte l'effet. L'utilisateur gère son propre mute.
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
      if (row) {
        arenaOutboundRef.current.broadcastMediatorMuteChallenger?.(debaterId, row.isMuted);
      }
      return next;
    });
  };



  // removeDebater, inviteDebater, handleInviteFromModal — now in useDebaterInvites hook

  // openProfile, toggleFollowProfileTarget — now in useArenaProfile hook

  const clearAnnouncementBanner = useCallback(() => {
    if (announcementClearTimerRef.current) {
      clearTimeout(announcementClearTimerRef.current);
      announcementClearTimerRef.current = null;
    }
    setAnnouncementTicker('');
    if (isHost) {
      arenaOutboundRef.current.broadcastAnnouncementBanner?.('', 0);
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
      const d = Math.max(40, Math.min(600, Math.floor(durationSec) || 40));
      setAnnouncementTicker(trimmed);
      announcementClearTimerRef.current = setTimeout(() => {
        setAnnouncementTicker('');
        announcementClearTimerRef.current = null;
      }, d * 1000);
      if (isHost) {
        arenaOutboundRef.current.broadcastAnnouncementBanner?.(trimmed, d);
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





  // Join: enregistre le flux pré-acquis puis lance join() via l’effet ci-dessus
  const handleJoin = (preAcquired: MediaStream | null, opts?: { camEnabled: boolean }) => {
    setPreJoinMediaStream(preAcquired);
    setPreJoinCamEnabled(opts?.camEnabled ?? true);
    setHasJoined(true);
    setShowPreJoin(false);
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem(`arena_joined_${roomId}_${userId}`, 'true');
      } catch {
        /* ignore */
      }
    }
  };

  const [isLeaving, setIsLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Leave: for mediators, triggers endBeef. For others, just leave.
  const handleLeave = useCallback(async () => {
    stopAllMediaTracks();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(`arena_joined_${roomId}_${userId}`);
      } catch {
        /* ignore */
      }
    }
    if (beefEndedRef.current) {
      await leaveRef.current();
      router.replace('/feed');
      return;
    }
    if (isHost) {
      setShowLeaveConfirm(true);
      return;
    }
    setIsLeaving(true);
    if (isHost) {
      await endBeef('Le Ref a mis fin au beef');
    } else {
      await leave();
      router.replace('/feed');
    }
  }, [leave, router, isHost, endBeef, roomId, userId, stopAllMediaTracks]);

  const confirmHostLeave = useCallback(async () => {
    setShowLeaveConfirm(false);
    setIsLeaving(true);
    await endBeef('Le Ref a mis fin au beef');
  }, [endBeef]);

  const arenaHasAnnouncement = announcementTicker.trim() !== '';

  const getMediatorDynamicColor = (val: number) => {
    const progress = Math.min(1, val / 200);
    const r = Math.round(255 - (255 - 212) * progress);
    const g = Math.round(255 - (255 - 175) * progress);
    const b = Math.round(255 - (255 - 55) * progress);
    const a = Math.min(1, 0.4 + progress * 0.6);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  };

  const isWaitingForMediator =
    !isHost &&
    !mediatorWasConnectedRef.current &&
    isJoined &&
    !beefEnded &&
    !remoteParticipants.some((p) => remoteMatchesMediator(p, host.id, host.name));

  const handleVsComplete = useCallback(() => {
    setShowVsScreen(false);
    if (isViewer) setShowPreJoin(false);
  }, [isViewer]);

  const leftChallengerAbsent =
    isJoined &&
    !beefEnded &&
    challengersEverJoinedRef.current &&
    !leftPanel &&
    expectedChallengers.length >= 1;

  const rightChallengerAbsent =
    isJoined &&
    !beefEnded &&
    challengersEverJoinedRef.current &&
    !rightPanel &&
    expectedChallengers.length >= 2;

  const arenaRealtimeCallbacks = {
    getAuraBoost: () => 15,
    onReactionReceived: (emoji: string, supportSlot?: ArenaSupportSlotId, _source?: 'broadcast' | 'poll') => {
      addRemoteReaction(emoji, supportSlot ?? undefined);
    },
    onReactionAurasFromBroadcast: (summary) => {
      const gh = summary.globalHeatDelta ?? 0;
      setAuras((prev) => addAuraBatchToRecord(prev, summary));
      if (summary.M) setAuraMed((v) => Math.min(AURA_DISPLAY_CAP, v + summary.M));
      if (gh) setGlobalHeat((v) => Math.min(100, v + gh));
    },
    onAuraBatchDeltas: (d) => {
      setAuras((prev) => addAuraBatchToRecord(prev, d));
      if (d.M) setAuraMed((v) => Math.min(AURA_DISPLAY_CAP, v + d.M));
    },
    onAuraMasterSync: (snap) => {
      setAuras(snapshotToChallengerAuras(snap));
      setAuraMed(snap.M);
    },
    onMessageReceived: (uname, content, initialLetter, messageId, source, type, gSender, gRecipient, gTemplate) => {
      addRemoteMessage(uname, content, initialLetter, messageId, type, gSender, gRecipient, gTemplate);
    },
    onMessageDeleted: (messageId) => {
      deleteMessage(messageId);
    },
    onArenaBigGift: (payload) => {
      useArenaVolatileStore.getState().enqueueBigGift(payload as ArenaBigGiftPayload);
    },
    onPulseVoice: (dA, dB) => {
      if (dA > 0) addPulseVoices('A', dA);
      if (dB > 0) addPulseVoices('B', dB);
      setGlobalHeat((v) => Math.min(100, v + 2));
    },
    onAnnouncementBanner: ({ text, durationSec }) => {
      if (announcementClearTimerRef.current) {
        clearTimeout(announcementClearTimerRef.current);
        announcementClearTimerRef.current = null;
      }
      const raw = typeof text === 'string' ? sanitizeTicker(text.trim()) : '';
      if (!raw) {
        setAnnouncementTicker('');
        return;
      }
      const d =
        typeof durationSec === 'number' && Number.isFinite(durationSec)
          ? Math.max(40, Math.min(600, Math.floor(durationSec)))
          : 40;
      setAnnouncementTicker(raw);
      announcementClearTimerRef.current = setTimeout(() => {
        setAnnouncementTicker('');
        announcementClearTimerRef.current = null;
      }, d * 1000);
    },
    onGlobalTimerSync: (payload) => {
      const endsAtMs =
        payload.endsAtMs != null && Number.isFinite(Number(payload.endsAtMs))
          ? Number(payload.endsAtMs)
          : null;
      const active = !!payload.active;
      const paused = !!payload.paused;
      const rem = Math.max(0, Math.floor(Number(payload.remainingSec) || 0));
      setTimerActive(active);
      timerActiveRef.current = active;
      setTimerPaused(paused);
      timerPausedRef.current = paused;
      setBeefTimeRemaining(rem);
      beefTimeRemainingRef.current = rem;
      beefEndsAtMsRef.current = endsAtMs;
    },
    onSpeakingTurn: (payload) => {
      if (payload.action === 'start') {
        const dur = typeof payload.duration === 'number' && payload.duration > 0 ? payload.duration : 60;
        const debaterId = payload.debaterId;
        setSpeakingTurnDuration(dur);
        setSpeakingTurnRemaining(dur);
        setSpeakingTurnTarget(debaterId);
        setSpeakingTurnActive(true);
        setSpeakingTurnPaused(false);
        const slot = payload.slot;
        const name = typeof payload.speakerName === 'string' ? payload.speakerName : 'Intervenant';
        if (slot === 'A' || slot === 'B' || slot === 'C' || slot === 'D') {
          setFloorAnnouncement({ name, slot });
        } else {
          setFloorAnnouncement(null);
        }
        return;
      }
      if (payload.action === 'pause') {
        setSpeakingTurnPaused(true);
        return;
      }
      if (payload.action === 'resume') {
        setSpeakingTurnPaused(false);
        return;
      }
      if (payload.action === 'stop') {
        setSpeakingTurnPaused(false);
        setFloorAnnouncement(null);
        setSpeakingTurnActive(false);
        setSpeakingTurnTarget(null);
        if (speakingTurnIntervalRef.current) {
          clearInterval(speakingTurnIntervalRef.current);
          speakingTurnIntervalRef.current = null;
        }
      }
    },
    onMediatorFloor: (active: boolean) => setMediatorHoldingFloor(active),
    onMediationToss: (firstName: string) => {
      toast(`${firstName} parle en premier (tirage au sort décidé par le Ref).`, 'success');
    },
    onStructuredDebate: (p: StructuredDebateBroadcastPayload) => {
      if (p.enabled) {
        setStructuredDebateEnabled(true);
        if (typeof p.budgetSeconds === 'number' && Number.isFinite(p.budgetSeconds)) {
          const sec = Math.max(60, Math.floor(p.budgetSeconds));
          setChallengerBudgetRemaining(sec);
          setDebateBudgetMinutes(Math.max(1, Math.round(sec / 60)));
        }
      } else {
        setStructuredDebateEnabled(false);
      }
    },
    onMediatorMuteChallenger: ({ muted }: { targetUserId: string; muted: boolean }) =>
      setMicMutedByMediator(muted),
    onBeefVerdict: ({ verdict }) => {
      useArenaVerdictStore.getState().setVerdict(verdict, roomId);
      if (verdict === 'resolved') {
        setVerdictConfetti(true);
        window.setTimeout(() => setVerdictConfetti(false), 2200);
      }
      if (verdict === 'rematch') {
        playRematchThunderSfx();
        setRematchSequence(true);
      }
    },
    onBeefEnded: (payload) => {
      if (beefEndedRef.current) return;
      beefEndedRef.current = true;
      const summaryRaw = payload?.summary;
      if (summaryRaw && typeof summaryRaw === 'object' && !Array.isArray(summaryRaw)) {
        const o = summaryRaw as Record<string, unknown>;
        setEndSummary({
          duration: String(o.duration ?? ''),
          viewers: Number(o.viewers) || 0,
          resonanceA: Number(o.resonanceA) || 0,
          resonanceB: Number(o.resonanceB) || 0,
          resonanceC: Number(o.resonanceC) || 0,
          resonanceD: Number(o.resonanceD) || 0,
          resonanceE: Number(o.resonanceE) || 0,
          resonanceF: Number(o.resonanceF) || 0,
          resonanceM: Number(o.resonanceM) || 0,
          messages: Number(o.messages) || 0,
          endReason: String(o.endReason ?? 'Séance levée'),
        });
      } else {
        setEndSummary(null);
      }
      setBeefEnded(true);
      if (endSummaryTimerRef.current) {
        clearTimeout(endSummaryTimerRef.current);
        endSummaryTimerRef.current = null;
      }
      void leaveRef.current().then(() => {
        endSummaryTimerRef.current = setTimeout(() => {
          router.replace('/feed');
        }, 12000);
      });
    },
    onLiveBroadcastSubscribed: () => {
      const b = auraBufferRef.current;
      if (!hasAnyAuraBatchDelta(b)) return;
      arenaOutboundRef.current.broadcastAuraBatch?.({ ...b });
      auraBufferRef.current = createZeroAuraBatch();
    },
    onSpectatorSelfInviteAccepted: () => setAcceptedInviteAlert(true),
    onSpectatorReceivedRefInvite: () => setRefInviteAlert(true),
    onBeefParticipantsTableChanged: () => {
      if (isHost) void fetchPendingInvites();
      void loadParticipants();
    },
  } satisfies ArenaRealtimeCallbacks;

  const arenaRealtime = useArenaRealtime(
    { roomId, userId, userName, userRole, isHost },
    arenaRealtimeCallbacks,
  );

  Object.assign(arenaOutboundRef.current, {
    broadcastPulseVoice: arenaRealtime.broadcastPulseVoice,
    broadcastBeefEnded: arenaRealtime.broadcastBeefEnded,
    broadcastBeefVerdict: arenaRealtime.broadcastBeefVerdict,
    broadcastMediatorMuteChallenger: arenaRealtime.broadcastMediatorMuteChallenger,
    broadcastReaction: arenaRealtime.broadcastReaction,
    broadcastSfx: arenaRealtime.broadcastSfx,
    broadcastMessage: arenaRealtime.broadcastMessage,
    broadcastDeleteMessage: arenaRealtime.broadcastDeleteMessage,
    broadcastArenaBigGift: arenaRealtime.broadcastArenaBigGift,
    broadcastAnnouncementBanner: arenaRealtime.broadcastAnnouncementBanner,
    broadcastBeefGlobalTimer: arenaRealtime.broadcastBeefGlobalTimer,
    broadcastSpeakingTurn: arenaRealtime.broadcastSpeakingTurn,
    broadcastMediatorFloor: arenaRealtime.broadcastMediatorFloor,
    broadcastMediationToss: arenaRealtime.broadcastMediationToss,
    broadcastStructuredDebate: arenaRealtime.broadcastStructuredDebate,
    broadcastAuraBatch: arenaRealtime.broadcastAuraBatch,
    broadcastAuraMasterSync: arenaRealtime.broadcastAuraMasterSync,
  });

  beefGlobalTimerFlushRef.current = () => {
    if (!isHostRef.current) return;
    arenaRealtime.broadcastBeefGlobalTimer({
      active: timerActiveRef.current,
      paused: timerPausedRef.current,
      remainingSec: beefTimeRemainingRef.current,
      endsAtMs: beefEndsAtMsRef.current,
    });
  };

  const { liveConnected, presenceState } = arenaRealtime;

  const presenceSpectators = useMemo(() => {
    return Object.values(presenceState || {}).filter((p) => p.is_viewer);
  }, [presenceState]);

  const actualViewerCount = presenceSpectators.length;

  const spectatorModalEntries = useMemo(() => {
    return presenceSpectators.map((p) => ({
      userId: p.user_id,
      userName: p.user_name || 'Spectateur',
    }));
  }, [presenceSpectators]);

  const prevViewerCountRef = useRef(actualViewerCount);
  useEffect(() => {
    if (actualViewerCount > prevViewerCountRef.current) {
      const delta = actualViewerCount - prevViewerCountRef.current;
      setGlobalHeat((v) => Math.min(100, v + Math.min(12, delta * 3)));
    }
    prevViewerCountRef.current = actualViewerCount;
  }, [actualViewerCount]);

  useEffect(() => {
    statsRef.current = {
      ...statsRef.current,
      liveViewerCount: actualViewerCount,
    };
  }, [actualViewerCount]);

  useEffect(() => {
    if (!liveConnected || !isHost || beefEnded || !roomId) return;
    queueMicrotask(() => beefGlobalTimerFlushRef.current?.());
    const id = window.setInterval(() => beefGlobalTimerFlushRef.current?.(), 10_000);
    return () => window.clearInterval(id);
  }, [liveConnected, isHost, beefEnded, roomId]);

  useEffect(() => {
    if (beefEnded || !liveConnected) return;
    const id = window.setInterval(() => {
      const b = auraBufferRef.current;
      if (!hasAnyAuraBatchDelta(b)) return;
      arenaOutboundRef.current.broadcastAuraBatch?.({ ...b });
      auraBufferRef.current = createZeroAuraBatch();
    }, 1500);
    return () => window.clearInterval(id);
  }, [beefEnded, liveConnected]);

  useEffect(() => {
    if (!isHost || beefEnded || !liveConnected) return;
    const id = window.setInterval(() => {
      const snap = auraSnapshotRef.current;
      arenaOutboundRef.current.broadcastAuraMasterSync?.({ ...snap });
    }, 3000);
    return () => window.clearInterval(id);
  }, [isHost, beefEnded, liveConnected]);

  const unlockArenaPlayback = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('audio, video').forEach((el) => {
      const media = el as HTMLMediaElement;
      if (media.paused) void media.play().catch(() => {});
    });
  }, []);

  const pendingDeckCount = handsRaised.length + refInvites.length;

  return (
    <div
      onPointerDown={() => {
        unlockArenaPlayback();
      }}
      onClick={(e) => {
        unlockArenaPlayback();
        if (!isCinematicMode) return;
        if ((e.target as Element).closest?.('[data-cinema-stay]')) return;
        setIsCinematicMode(false);
      }}
      onDoubleClick={(e) => {
        if (isCinematicMode) return;
        const target = e.target as HTMLElement;
        if (target.closest('button, input, textarea, a, aside, [id^="dock-"], [data-cinema-stay]')) return;
        setIsCinematicMode(true);
      }}
      className="fixed inset-0 z-10 flex flex-col overflow-hidden bg-transparent lg:flex-row"
    >
      {/* --- COUCHE 1 : ÉCRAN VS (Priorité 1) --- */}
      <AnimatePresence>
        {showVsScreen && (
          <div className="absolute inset-0 z-[9999] bg-black/40 backdrop-blur-sm">
            {rolesLoaded ? (
              <VsTransition
                challengers={expectedUids
                  .filter((uid) => participantRoles[uid]?.isMain)
                  .map((uid) => participantRoles[uid]?.name)
                  .filter(Boolean) as string[]}
                debateTitle={debateTitle}
                onComplete={handleVsComplete}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </AnimatePresence>

      {/* --- COUCHE 2 : PRE-JOIN (Priorité 2) --- */}
      {!showVsScreen && !hasJoined && showPreJoin && (
        <div className="absolute inset-0 z-[8000] bg-black/40 backdrop-blur-sm">
          <PreJoinScreen
            userName={userName}
            onJoin={handleJoin}
            viewerMode={isViewer}
            mediatorName={mediatorName}
          />
          {!effectiveDailyRoomUrl && (
            <div className="absolute bottom-10 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-slate-900/65 px-4 py-2 text-xs font-semibold text-cyan-400 backdrop-blur-md">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
              Préparation de la room vidéo...
            </div>
          )}
        </div>
      )}

      {!isCinematicMode && arenaHasAnnouncement && (
        <div
          className="pointer-events-none fixed left-0 right-0 top-0 z-[500] hidden h-6 min-h-6 flex-col justify-center overflow-hidden border-b border-white/10 bg-slate-950/50 backdrop-blur-md lg:flex lg:flex-col"
          role="status"
          aria-live="polite"
        >
          <div className="flex w-max min-w-[200vw] animate-marquee-continuous whitespace-nowrap">
            <span className="mx-4 min-w-[100vw] text-[10px] font-black uppercase tracking-widest text-white/90">
              {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
            </span>
            <span className="mx-4 min-w-[100vw] text-[10px] font-black uppercase tracking-widest text-white/90">
              {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
            </span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isCinematicMode && (
          <motion.button
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            onClick={(e) => {
              e.stopPropagation();
              setIsCinematicMode(false);
            }}
            type="button"
            className="absolute top-[max(3rem,env(safe-area-inset-top))] right-4 z-[9999] flex items-center gap-2 rounded-full border border-white/20 bg-slate-950/55 px-4 py-2.5 text-sm font-bold text-white shadow-xl backdrop-blur-md pointer-events-auto"
          >
            <X className="h-4 w-4" aria-hidden /> Quitter Ciné
          </motion.button>
        )}
      </AnimatePresence>

      {/* Instant black overlay when leaving — hides camera before tracks stop */}
      {isLeaving && !beefEnded && (
          <div className="absolute inset-0 z-[999] flex items-center justify-center bg-black/40 backdrop-blur-sm">
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
      {beefEnded && endSummary && (
        <ArenaBeefEndSummary roomId={roomId} endSummary={endSummary} endSummaryTimerRef={endSummaryTimerRef} />
      )}

      {/* ── NETWORK RECONNECTION OVERLAY ── */}
      {isOffline && !beefEnded && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 z-[90] bg-black/40 backdrop-blur-sm flex flex-col items-center justify-center"
        >
          <div className="w-12 h-12 border-3 border-cyan-400 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-white font-semibold text-lg">Reconnexion en cours...</p>
          <p className="text-gray-400 text-sm mt-1">Vérifie ta connexion internet</p>
        </motion.div>
      )}

      {/* === ASIDE CHAT (DESKTOP SEULEMENT) === */}
      {!isCinematicMode && (
        <aside className="hidden lg:flex relative min-h-0 w-[350px] min-w-[350px] shrink-0 h-full flex-col bg-black/20 backdrop-blur-[2px] border-r border-white/10 shadow-2xl z-[100]">
        <header className="relative z-30 shrink-0 flex items-center gap-3 border-b border-white/10 pl-2 pr-4 py-3" data-cinema-stay>
          <button type="button" onClick={() => setShowArenaMenu(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"><Menu className="h-5 w-5" strokeWidth={1.5} /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className={`flex items-center rounded-full px-2 py-0.5 ${liveBadgeHot ? 'animate-pulse bg-rose-600 shadow-[0_0_15px_rgba(225,29,72,0.5)]' : 'bg-white/10'}`}>
              <div className={`mr-1 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'bg-white' : 'bg-amber-300'}`} />
              <span className="font-mono text-[10px] font-bold uppercase text-white">LIVE</span>
            </div>
            <span className="min-w-0 truncate text-xs font-semibold text-white/80">Chat</span>
          </div>
          <button type="button" onClick={() => setShowViewerList(true)} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-white/80 hover:bg-white/10">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.2} />
            <span className="font-mono text-[11px] font-medium">{actualViewerCount > 0 ? actualViewerCount : '—'}</span>
          </button>
          <ArenaMenuPanel open={showArenaMenu} onClose={() => setShowArenaMenu(false)} walletBalance={walletBalance} goBuyPoints={goBuyPoints} onCinematicMode={() => setIsCinematicMode(true)} openDrawer={openDrawer} onShare={onShare} onLeave={() => void handleLeave()} unreadDMsCount={unreadDMsCount} />
        </header>
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <ArenaChatMessages isMobile={false} />

          <div id="dock-desktop" className="mt-auto flex w-full shrink-0 items-center gap-2 pl-2 pr-3 py-3 bg-slate-900/40 backdrop-blur-sm border-t border-white/10 shadow-lg">
            {isViewer && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void handleRaiseHand();
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-lg transition-transform hover:bg-white/20 active:scale-95"
                title="Demander à monter sur scène"
              >
                ✋
              </button>
            )}
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full border border-white/[0.05] bg-black/40 px-4 py-2.5 text-[13px] text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/70 focus:border-transparent" />
            <button onClick={() => { setShowGiftPicker(false); setShowAllReactions(!showAllReactions); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform active:scale-95 disabled:opacity-30">😀</button>
            <button
              type="button"
              onClick={() => {
                if (requireAuth('Offre un cadeau', 'Crée un compte gratuit pour envoyer des cadeaux épiques et faire briller ton nom !')) return;
                setShowAllReactions(false);
                setShowGiftPicker(!showGiftPicker);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-pink-500/80 to-orange-400/80 shadow-[0_4px_16px_rgba(249,115,22,0.4),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-transform active:scale-95"
            >
              <Gift className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => void handleSendMessage()} disabled={!chatInput.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform active:scale-95 disabled:opacity-30"><Send className="h-4 w-4 text-white" /></button>
          </div>
        </div>
      </aside>
      )}

      {/* === ZONE 2 : LA VIDÉO (AVEC OVERLAY CHAT MOBILE) === */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-transparent z-10">

        {/* TICKER MOBILE */}
        {!isCinematicMode && arenaHasAnnouncement && (
          <div className="pointer-events-none fixed inset-x-0 top-0 z-[500] flex h-7 items-center overflow-hidden border-b border-white/10 bg-slate-950/55 backdrop-blur-md lg:hidden">
            <div className="flex w-max min-w-[200vw] animate-marquee-continuous-fast whitespace-nowrap">
              <span className="mx-4 min-w-[100vw] text-[9px] font-bold uppercase tracking-widest text-white/90">
                {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
              </span>
              <span className="mx-4 min-w-[100vw] text-[9px] font-bold uppercase tracking-widest text-white/90">
                {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
              </span>
            </div>
          </div>
        )}

        {/* INDICATEURS SYSTÈME DISCRETS (Haut Droite) */}
        {!isCinematicMode && (
          <div className={`pointer-events-none absolute right-2 sm:right-4 z-[500] flex items-center gap-1.5 sm:gap-2 transition-all duration-300 ${arenaHasAnnouncement ? 'top-[max(2.5rem,calc(env(safe-area-inset-top)+1.75rem))]' : 'top-[max(0.5rem,env(safe-area-inset-top))]'}`}>

            <div className="flex items-center rounded-full border border-white/10 bg-slate-900/40 px-2 py-1 sm:px-3 sm:py-1.5 shadow-lg backdrop-blur-sm">
              <div className={`mr-1.5 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'animate-pulse bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.8)]' : 'bg-amber-400'}`} />
              <span className="font-mono text-[9px] sm:text-[10px] font-black uppercase tracking-widest text-white/90">Live</span>
            </div>

            <button
              type="button"
              onClick={() => setShowViewerList(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/40 px-2 py-1 sm:px-3 sm:py-1.5 shadow-lg backdrop-blur-sm transition-all hover:bg-slate-900/60"
            >
              <Eye className="h-3 w-3 text-white" />
              <span className="font-mono text-[9px] sm:text-[10px] font-bold text-white">{actualViewerCount > 0 ? actualViewerCount : '—'}</span>
            </button>

            {!beefEnded && !isLeaving && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArenaMenu(true);
                }}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900/60 lg:hidden"
              >
                <Menu className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {!showVsScreen && (
          <ArenaLayoutManager
            expectedUids={expectedUids}
            challengerRemoteSlots={displayPanelsFixed}
            reconciledPeers={reconciledPeers}
            participantRoles={participantRoles}
            auras={auras}
            localUserId={userId}
            localSessionId={localParticipant?.sessionId}
            isViewer={isViewer}
          isHost={isHost}
          speakingTurnActive={speakingTurnActive}
          effectiveHotMicSpeakerSlot={effectiveHotMicSpeakerSlot}
          structuredDebateEnabled={structuredDebateEnabled}
          micMutedByMediator={micMutedByMediator}
          mediatorHoldingFloor={mediatorHoldingFloor}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          onTapSupport={emitTapSupport}
          onPreferSide={preferSide}
          onOpenProfile={openProfile}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
          onToast={toast}
          onFlipCamera={!isViewer ? () => void flipCamera() : undefined}
          webrtcNetworkQuality={networkQuality}
          activeSpeakerPeerId={activeSpeakerPeerId}
          mediatorParticipant={mediatorParticipant}
          mediatorIsLocal={mediatorIsLocal}
          mediatorName={mediatorName}
          auraMed={auraMed}
          isWaitingForMediator={isWaitingForMediator}
          isCameraInterrupted={isCameraInterrupted}
          onRecoverMediaDevices={recoverMediaDevices}
          mediatorGraceActive={mediatorGraceActive}
          mediatorGraceSeconds={mediatorGraceSeconds}
          mediatorHostId={host.id}
          isJoined={isJoined}
          timerActive={timerActive}
          timerPaused={timerPaused}
          beefTimeRemaining={beefTimeRemaining}
          formatBeefTime={formatBeefTime}
          onToggleMediatorSidebar={() => setMediatorSidebarOpen((o) => !o)}
          getMediatorDynamicColor={getMediatorDynamicColor}
          pendingCount={pendingDeckCount}
          localCamEnabled={preJoinCamEnabled}
          />
        )}

        {/* OVERLAY CHAT MOBILE (Intégré à la vidéo, invisible sur PC) */}
        {!isCinematicMode && (
          <div
            data-cinema-stay
            className="absolute inset-x-0 bottom-0 z-[160] lg:hidden flex flex-col justify-end h-auto max-h-[31dvh] pb-[max(3.5rem,env(safe-area-inset-bottom))] pointer-events-none"
          >
          <ArenaChatMessages isMobile />
          <div id="dock-mobile" className="pointer-events-auto mt-auto flex w-full shrink-0 items-center gap-2 px-3 pb-2">
            {isViewer && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void handleRaiseHand();
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-lg transition-transform hover:bg-white/20 active:scale-95"
                title="Demander à monter sur scène"
              >
                ✋
              </button>
            )}
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full border border-white/[0.05] bg-black/40 px-4 py-2.5 text-[13px] text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder-white/30 focus:bg-black/60 focus:outline-none focus:ring-2 focus:ring-white/70 focus:border-transparent" />
            <button onClick={() => { setShowGiftPicker(false); setShowAllReactions(!showAllReactions); }} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform active:scale-95 disabled:opacity-30">😀</button>
            <button
              type="button"
              onClick={() => {
                if (requireAuth('Offre un cadeau', 'Crée un compte gratuit pour envoyer des cadeaux épiques et faire briller ton nom !')) return;
                setShowAllReactions(false);
                setShowGiftPicker(!showGiftPicker);
              }}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-pink-500/80 to-orange-400/80 shadow-[0_4px_16px_rgba(249,115,22,0.4),inset_0_1px_1px_rgba(255,255,255,0.4)] transition-transform active:scale-95"
            >
              <Gift className="h-4 w-4 text-white" />
            </button>
            <button onClick={() => void handleSendMessage()} disabled={!chatInput.trim()} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-[0_4px_16px_rgba(0,0,0,0.2),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-transform active:scale-95 disabled:opacity-30"><Send className="h-4 w-4 text-white" /></button>
          </div>
        </div>
        )}

        {/* REACTIONS VOLANTES */}
        <div className="pointer-events-none absolute inset-0 z-[160]">
          <ArenaFlyingReactions />
        </div>
      </div>

      {isHost && (
        <MediatorSidebar
          open={mediatorSidebarOpen}
          onClose={() => setMediatorSidebarOpen(false)}
          timerActive={timerActive}
          beefTimerPaused={timerPaused}
          onPauseBeefTimer={pauseBeefTimer}
          onResumeBeefTimer={resumeBeefTimer}
          onResetBeefTimer={resetBeefTimerToFull}
          startingBeef={startingBeef}
          onStartBeef={handleStartBeef}
          onMuteAll={handleMuteAll}
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
            if (ok) {
              const target = remoteParticipants.find((p) => p.sessionId === sid);
              if (target?.arenaUserId) {
                await runBeefManage({
                  action: 'REMOVE_PARTICIPANT',
                  removeKind: 'kick',
                  beefId: roomId,
                  participantId: target.arenaUserId,
                });
                setDebaters((prev) => prev.filter((d) => d.id !== target.arenaUserId));
                void loadParticipants();
              }
              recentKickRef.current = true;
              setTimeout(() => { recentKickRef.current = false; }, 3000);
              toast('Participant renvoyé parmi les citoyens', 'success');
              void fetchPendingInvites();
            } else {
              toast('Retrait impossible.', 'error');
            }
          }}
          mediatorMicEnabled={micEnabled}
          mediatorCamEnabled={camEnabled}
          onMediatorToggleMic={() => void toggleMic()}
          onMediatorToggleCam={() => void toggleCam()}
          beefRemainingSec={beefTimeRemaining}
          maxBeefDurationSec={MAX_BEEF_DURATION}
          parolePresetSec={parolePresetSec}
          onParolePresetSecChange={setParolePresetSec}
          announcementText={announcementTicker}
          onPublishAnnouncement={publishAnnouncementBanner}
          onClearAnnouncement={clearAnnouncementBanner}
          pendingInvites={handsRaised}
          onAcceptPendingInvite={handleAcceptPendingInvite}
          onRejectPendingInvite={handleRejectPendingInvite}
          onInviteParticipant={handleInviteFromModal}
          inviteExcludeParticipantIds={inviteExcludeParticipantIds}
          inviteCurrentUserId={userId}
        />
      )}

      <ArenaDockPickersPortal
        mounted={dockPickersMounted}
        showReactions={showAllReactions}
        showGifts={showGiftPicker}
        pos={dockPickerPos}
        onCloseReactions={() => setShowAllReactions(false)}
        onCloseGifts={() => setShowGiftPicker(false)}
        onReaction={handleReaction}
        giftRecipients={giftRecipients}
        giftTarget={giftTarget}
        setGiftTarget={setGiftTarget}
        hostId={host.id}
        sendGift={sendGift}
      />

      {/* User Profile Modal */}
      <AnimatePresence>
        {showProfile && selectedProfile && (
          <ArenaProfileModal
            profile={selectedProfile}
            currentUserId={userId}
            profileFollowsTarget={profileFollowsTarget}
            onClose={() => setShowProfile(false)}
            onToggleFollow={() => void toggleFollowProfileTarget()}
            onOpenDM={openDrawer}
            onReport={(u) => { setReportTargetUser(u); setShowReportModal(true); }}
          />
        )}
      </AnimatePresence>

      <AcceptedInviteAlert
          isOpen={acceptedInviteAlert}
          beefEnded={beefEnded}
          onDismiss={() => setAcceptedInviteAlert(false)}
        />

      <RefInviteAlert
          isOpen={refInviteAlert}
          beefEnded={beefEnded}
          roomId={roomId}
          userId={userId}
          supabaseClient={supabase}
          toast={toast}
          onDismiss={() => setRefInviteAlert(false)}
        />

      {/* Viewer List Modal */}
      {showViewerList && (
        <ViewerListModal
          viewers={spectatorModalEntries}
          viewerCount={actualViewerCount}
          onClose={() => setShowViewerList(false)}
          onSelectViewer={(name, id) => {
            setShowViewerList(false);
            void openProfile(name, id);
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


      {/* === HOOK DE CONVERSION PREMIUM === */}
      <AnimatePresence>
        {authHook && (
          <ArenaAuthHookModal authHook={authHook} onClose={() => setAuthHook(null)} />
        )}
      </AnimatePresence>

      {/* CSS migré vers globals.css + tailwind.config.ts */}
      <MeetingAudioOutlet peers={physicalPeers} localSessionId={localParticipant?.sessionId ?? null} />

      {typeof document !== 'undefined' &&
        createPortal(
          <FullscreenGiftAnimation />,
          document.body
        )}

      <ConfirmModal
        isOpen={showLeaveConfirm}
        onCancel={() => setShowLeaveConfirm(false)}
        onConfirm={() => void confirmHostLeave()}
        title="Mettre fin au beef"
        description="Mettre fin au beef pour tous les participants ? Cette action est définitive."
        confirmLabel="Terminer"
      />
    </div>
  );
}

// --- COMPOSANTS VOLATILS ZUSTAND ---

export function ArenaFlyingReactions() {
  const reactions = useArenaVolatileStore((s) => s.reactions);
  const removeReaction = useArenaVolatileStore((s) => s.removeReaction);

  const layerReactions = useMemo<FlyingReactionEntry[]>(
    () =>
      reactions.map((r) => ({
        id: String(r.id),
        emoji: r.emoji,
        x: r.x,
        orbitStartAngle: (r.id * 2.399963) % (Math.PI * 2),
        orbitDir: r.id % 2 === 0 ? 1 : -1,
        opacityMul: r.opacityMul,
        scaleMul: r.scaleMul,
      })),
    [reactions],
  );

  return (
    <FlyingReactionsLayer
      reactions={layerReactions}
      onRemove={(id) => removeReaction(Number(id))}
    />
  );
}
