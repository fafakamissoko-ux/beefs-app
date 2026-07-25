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
import { ChatPanel } from './ChatPanel';
import { PreJoinScreen } from './PreJoinScreen';
import { ArenaChatMessages } from './ArenaChatMessages';
import { ArenaLayoutManager } from '@/components/Arena/ArenaLayoutManager';
import { PremiumNotificationBadge } from '@/components/shared/PremiumNotificationBadge';
import { FeatureGuide } from './FeatureGuide';
import { ViewerListModal } from './ViewerListModal';
import { ProfileUserLink } from '@/components/ProfileUserLink';
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
import { ArenaProfileModal } from '@/components/Arena/ArenaProfileModal';
import { AcceptedInviteAlert, RefInviteAlert } from '@/components/Arena/ArenaInviteAlerts';
import { ArenaAuthHookModal } from '@/components/Arena/ArenaAuthHookModal';
import { IngotIcon } from '@/components/shared/IngotIcon';
import { escapeForIlikeExact } from '@/lib/ilike-exact';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { ARENA_QUICK_REACTIONS } from '@/lib/arena-quick-reactions';
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
import { MediatorSupportHalo } from './MediatorSupportHalo';
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
import { GIFT_CATALOG } from '@/lib/constants/gifts';

/** Durée par défaut au lancement « Lancer le beef » (régie : +/- au-delà). */
const DEFAULT_BEEF_DURATION = 60 * 60; // 60 min
/** Plafond ajustable depuis la régie (prolongations). */
const MAX_BEEF_DURATION = 4 * 60 * 60; // 4 h

// IngotIcon — extracted to components/shared/IngotIcon.tsx


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

// 🔥 TOP 10 RÉACTIONS (affichées par défaut)
const TOP_10_REACTIONS = [
  '👍', '😂', '🔥', '💯', '👏', '😮', '💀', '❤️', '🎉', '🚀'
];

// 🔥 TOUTES LES RÉACTIONS POPULAIRES (80)
const POPULAR_REACTIONS = [
  '👍', '👎', '😂', '🔥', '💯', '👏', '🤔', '😮', '💀', '🎯',
  '⚡', '💪', '🧠', '👀', '🤯', '😡', '❤️', '🎉', '🙌', '💎',
  '🌟', '✨', '🚀', '💥', '🤡', '👽', '👻', '🥶', '🥵', '😎',
  '🤓', '🥳', '🤬', '🤮', '🤢', '🤧', '😇', '🤫', '🤭', '🥱',
  '🤌', '🫶', '🤝', '🤘', '🤙', '🖐️', '👊', '🙏', '🏆', '🥇',
  '🗣️', '🎙️', '🎤', '🎧', '📻', '🎸', '🥁', '🎭', '🎨', '🎬',
  '🍿', '🍔', '🍕', '🍻', '🥂', '🍾', '🧊', '🧂', '🌶️', '🥩',
  '🛑', '🚧', '🚨', '🧯', '🥊', '🥋', '🤺', '🏋️', '🤸', '✅'
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


// Debater — now exported from hooks/useDebaterInvites.ts

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
  const [giftTarget, setGiftTarget] = useState<string>('');
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

  // ── END-OF-BEEF STATE ──
  const [beefEnded, setBeefEnded] = useState(false);
  const [endSummary, setEndSummary] = useState<{
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
  /** Supprime le toast « challengers partis » juste après un kick volontaire */
  const recentKickRef = useRef(false);
  const walletBalance = useWalletStore((s) => s.balance);
  const walletInit = useWalletStore((s) => s.initialize);
  const optimisticDebit = useWalletStore((s) => s.optimisticDebit);
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
  /** Rempli après `useDailyCall` — `endBeef` vit au-dessus du hook et ne peut pas fermer sur `leave` en closure directe. */
  const leaveRef = useRef<() => Promise<void>>(async () => {});
  const stopAllMediaTracksRef = useRef<() => void>(() => {});

  /** API broadcast issue du hook (remplie à chaque rendu après `useArenaRealtime`). */
  const arenaOutboundRef = useRef<Partial<UseArenaRealtimeResult>>({});
  const beefGlobalTimerFlushRef = useRef<(() => void) | null>(null);
  const scheduleBeefGlobalTimerBroadcast = useCallback(() => {
    queueMicrotask(() => beefGlobalTimerFlushRef.current?.());
  }, []);

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
  const [verdictConfetti, setVerdictConfetti] = useState(false);
  const [rematchSequence, setRematchSequence] = useState(false);
  const rematchVerdictTimerRef = useRef<number | null>(null);
  const rematchExitTimerRef = useRef<number | null>(null);

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

  const endBeef = useCallback(async (reason: string = 'Terminé par le Ref') => {
    if (beefEndedRef.current) return;
    stopAllMediaTracksRef.current();
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.removeItem(`arena_joined_${roomId}_${userId}`);
      } catch {
        /* ignore */
      }
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
    const summary = {
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

    // Broadcast end to all viewers (with stats so they see accurate summary)
    arenaOutboundRef.current.broadcastBeefEnded?.({
      reason,
      summary,
    });

    // Stop camera/mic
    await leaveRef.current();

    // Auto-redirect after 12 seconds
    endSummaryTimerRef.current = setTimeout(() => {
      router.replace('/feed');
    }, 12000);
  }, [roomId, router, runBeefManage, userId]);

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
    [isHost, roomId, endBeef, runBeefManage],
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

  /** Aura prestige-gold — cadre sponsor : les gains remontent au Host quand un soutien financier est détecté.
   *  TODO: brancher sur l'événement gift broadcast ; pour l'instant, activé par l'aura A ou B > 60. */
  const sponsorAuraActive = CHALLENGER_SLOT_IDS.some((id) => auras[id] > 60);
  const sponsorGlow = sponsorAuraActive
    ? 'shadow-[0_0_52px_rgba(212,175,55,0.45),0_0_96px_rgba(255,220,140,0.22),inset_0_0_26px_rgba(212,175,55,0.14)]'
    : '';

  const globalHeatGlow = useMemo(() => {
    if (globalHeat <= 0) return 'none';
    const a1 = Math.min(0.55, 0.14 + globalHeat / 180);
    const a2 = Math.min(0.35, 0.06 + globalHeat / 220);
    const r1 = 26 + globalHeat * 0.95;
    const r2 = 56 + globalHeat * 0.75;
    return `0 0 ${r1}px rgba(255,200,50,${a1}), 0 0 ${r2}px rgba(255,165,40,${a2}), inset 0 0 ${18 + globalHeat * 0.35}px rgba(255,210,100,${Math.min(0.2, 0.04 + globalHeat / 400)})`;
  }, [globalHeat]);

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
    error: callError,
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

  /** Pas de bulles « onboarding » quand la salle est déjà active ou pendant la connexion Daily */
  const featureGuideSuppress =
    isJoining ||
    (isJoined && (remoteParticipants.length > 0 || timerActive));

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

  const leftSlot = 'A';
  const rightSlot = 'B';

  const leftAura = auraA;
  const rightAura = auraB;
  const leftColor = '225,29,72';
  const rightColor = '16,185,129';

  const expectedChallengers = useMemo(
    () =>
      Object.values(participantRoles)
        .filter((r) => r.role !== 'mediator' && r.role !== 'host')
        .map((r) => r.name),
    [participantRoles],
  );

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

  const giftRecipients = useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; label: string }[] = [];

    const push = (id: string | undefined | null, label: string) => {
      if (!id || seen.has(id) || userIdsEqual(id, userId)) return;
      seen.add(id);
      out.push({ id, label: label.trim() || 'Participant' });
    };

    push(host.id, mediatorName || host.name || 'Ref');

    challengerRemoteSlots.forEach((p, idx) => {
      if (!p?.arenaUserId) return;
      const name = p.userName?.trim();
      const label =
        name && !name.startsWith('En attente') ? name : `Combattant ${idx + 1}`;
      push(p.arenaUserId, label);
    });

    return out;
  }, [host.id, host.name, mediatorName, challengerRemoteSlots, userId]);

  useEffect(() => {
    if (giftRecipients.length === 0) return;
    if (!giftTarget || !giftRecipients.some((r) => r.id === giftTarget)) {
      setGiftTarget(giftRecipients[0].id);
    }
  }, [giftRecipients, giftTarget]);

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
        <div
          className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm p-6"
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
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-600 to-cobalt-600 shadow-[0_0_15px_rgba(59,130,246,0.5)]" aria-hidden>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 id="beef-end-summary-title" className="text-2xl font-bold text-white">Séance levée</h2>
              <p className="text-sm text-gray-400">{endSummary.endReason}</p>
            </div>

            {/* Stats (pas de compteur de votes : le soutien se lit sur l’aura en direct) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-2xl font-bold text-cyan-400">{endSummary.duration}</div>
                <div className="mt-1 text-xs text-gray-500">Durée</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-2xl font-bold text-cobalt-400">{endSummary.viewers}</div>
                <div className="mt-1 text-xs text-gray-500">Spectateurs</div>
              </div>
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-2xl font-bold text-ember-400">{endSummary.messages}</div>
                <div className="mt-1 text-xs text-gray-500">Messages</div>
              </div>
            </div>

            <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
              <div className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-gray-400">Résonance Générée</div>
              <div className="flex flex-wrap justify-center gap-2">
                {endSummary.resonanceA > 0 && (
                  <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-2">
                    <span className="text-lg font-black tabular-nums text-cyan-400">{endSummary.resonanceA}</span>
                    <span className="mt-1 font-mono text-[9px] uppercase text-cyan-200/60">Slot A</span>
                  </div>
                )}
                <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-prestige-gold/20 bg-prestige-gold/10 p-2">
                  <span className="text-lg font-black tabular-nums text-prestige-gold">{endSummary.resonanceM}</span>
                  <span className="mt-1 font-mono text-[9px] uppercase text-prestige-gold/60">Ref</span>
                </div>
                {endSummary.resonanceB > 0 && (
                  <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-white/20 bg-white/10 p-2">
                    <span className="text-lg font-black tabular-nums text-white/90">{endSummary.resonanceB}</span>
                    <span className="mt-1 font-mono text-[9px] uppercase text-white/60">Slot B</span>
                  </div>
                )}
                {endSummary.resonanceC > 0 && (
                  <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-2">
                    <span className="text-lg font-black tabular-nums text-yellow-400">{endSummary.resonanceC}</span>
                    <span className="mt-1 font-mono text-[9px] uppercase text-yellow-200/60">Slot C</span>
                  </div>
                )}
                {endSummary.resonanceD > 0 && (
                  <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-2">
                    <span className="text-lg font-black tabular-nums text-cyan-400">{endSummary.resonanceD}</span>
                    <span className="mt-1 font-mono text-[9px] uppercase text-cyan-200/60">Slot D</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <p className="text-xs text-gray-500 leading-relaxed px-1">
                Il n’y a pas de fil de commentaires sur cet écran : les spectateurs peuvent{' '}
                <span className="text-gray-400">noter le Ref</span> (étoiles + commentaire) depuis le résumé du
                beef.
              </p>
              <motion.button
                type="button"
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
                  router.push(`/beef/${roomId}/summary`);
                }}
                className="w-full rounded-full border border-white/10 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
              >
                Résumé & avis Ref
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
                  router.replace('/feed');
                }}
                className="w-full rounded-full border border-white/20 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
              >
                Retour au feed
              </motion.button>
              <p className="text-xs text-gray-600">Redirection automatique dans quelques secondes...</p>
            </div>
          </motion.div>
        </div>
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
          {showArenaMenu && (
            <div className="absolute left-4 top-full z-[200] mt-2 flex w-64 flex-col rounded-2xl border border-white/10 bg-slate-950/75 py-2 backdrop-blur-md shadow-2xl" data-cinema-stay onClick={(e) => e.stopPropagation()}>
              {/* En-tête Monétisation */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mon Solde</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <IngotIcon className="h-4 w-4 drop-shadow-md" />
                    <span className="font-black text-white">{walletBalance} Lingots</span>
                  </div>
                </div>
                <button type="button" onClick={() => { setShowArenaMenu(false); goBuyPoints(); }} className="flex items-center gap-1.5 rounded-full bg-prestige-gold px-3 py-1.5 text-xs font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-colors hover:bg-yellow-500">
                  Recharger
                </button>
              </div>

              {/* Grille d'actions (Standard) */}
              <div className="grid grid-cols-2 gap-1 p-2">
                <button type="button" onClick={() => { setShowArenaMenu(false); setIsCinematicMode(true); }} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
                  <Maximize className="h-5 w-5 text-gray-300" />
                  <span className="text-xs font-medium">Cinématique</span>
                </button>
                <button type="button" onClick={() => { setShowArenaMenu(false); openDrawer(); }} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
                  <MessageCircle className="h-5 w-5 text-gray-300" />
                  <span className="text-xs font-medium">Messages</span>
                </button>
                <button type="button" onClick={() => { setShowArenaMenu(false); onShare(); }} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
                  <Share2 className="h-5 w-5 text-cyan-400" />
                  <span className="text-xs font-medium">Partager</span>
                </button>
                <button type="button" onClick={() => { setShowArenaMenu(false); window.open('/profile', '_blank'); }} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
                  <User className="h-5 w-5 text-gray-300" />
                  <span className="text-xs font-medium">Profil</span>
                </button>
              </div>

              {/* Actions secondaires */}
              <div className="border-t border-white/10 p-2">
                <button type="button" onClick={() => { setShowArenaMenu(false); router.push('/feed'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
                  <Home className="h-4 w-4" /> Retour au Feed
                </button>
                <button type="button" onClick={() => { setShowArenaMenu(false); window.open('/settings', '_blank'); }} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
                  <SettingsIcon className="h-4 w-4" /> Paramètres
                </button>
              </div>

              {/* Quitter */}
              <div className="border-t border-white/10 p-2">
                <button type="button" onClick={() => { setShowArenaMenu(false); void handleLeave(); }} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-black uppercase tracking-widest text-rose-500 transition-colors hover:bg-rose-500/20">
                  Quitter le Direct
                </button>
              </div>
            </div>
          )}
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

      {dockPickersMounted && (showAllReactions || showGiftPicker) && dockPickerPos && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed z-[10000]"
          style={{ bottom: dockPickerPos.bottom, right: dockPickerPos.right }}
        >
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
                className="pointer-events-auto max-h-[min(50dvh,280px)] w-[min(calc(100vw-1rem),18rem)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[2.5rem] border border-white/10 bg-slate-900/40 p-2 pt-1.5 backdrop-blur-sm shadow-lg"
              >
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
                  <span className="pl-0.5 text-[11px] font-semibold text-white/75">Réactions</span>
                  <button
                    type="button"
                    onClick={() => setShowAllReactions(false)}
                    aria-label="Fermer le panneau de réactions"
                    className="flex h-9 min-h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
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
                      className="flex h-9 min-h-9 w-9 min-w-9 touch-manipulation items-center justify-center rounded-2xl text-lg hover:bg-white/10 active:scale-95"
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
                className="pointer-events-auto max-h-[min(60dvh,380px)] w-[min(calc(100vw-1rem),340px)] overflow-y-auto overscroll-contain rounded-[2.5rem] border border-white/10 bg-slate-900/40 p-3 pt-2 backdrop-blur-sm shadow-lg hide-scrollbar"
              >
                <div className="mb-3">
                  <div className="mb-2 flex justify-between items-center">
                    <span className="text-[11px] font-semibold text-white/75">Soutenir un participant :</span>
                    <button
                      type="button"
                      onClick={() => setShowGiftPicker(false)}
                      className="text-white/70 hover:text-white"
                      aria-label="Fermer les cadeaux"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex w-full items-center gap-1 rounded-xl bg-slate-950/50 p-1">
                    {giftRecipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        type="button"
                        onClick={() => setGiftTarget(recipient.id)}
                        className={`flex-1 truncate rounded-lg px-1 py-1.5 text-[9px] font-bold transition-colors ${
                          (giftTarget || giftRecipients[0]?.id) === recipient.id
                            ? userIdsEqual(recipient.id, host.id)
                              ? 'bg-prestige-gold text-black'
                              : 'border border-white/20 bg-white/10 text-white'
                            : 'text-white/50 hover:bg-white/10'
                        }`}
                      >
                        @{recipient.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {GIFT_CATALOG.map((gift) => (
                    <button
                      key={gift.id}
                      type="button"
                      onClick={async () => {
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

                          const targetName =
                            giftRecipients.find((r) => r.id === targetUserId)?.label ?? host.name;

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

                          const giftKey =
                            data.giftId != null ? String(data.giftId) : `gift_${Date.now()}`;

                          // Injection dynamique de la punchline
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
                      }}
                      className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 p-2 hover:bg-white/12 active:scale-95"
                    >
                      <img
                        src={`/gifts/${gift.id}.webp`}
                        alt={gift.label}
                        className="h-10 w-10 object-contain drop-shadow-md"
                      />
                      <span className="text-[10px] font-bold text-white">{gift.label}</span>
                      <span className="text-[9px] font-semibold text-ember-400">{gift.cost} Lingots</span>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>,
        document.body
      )}

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

      <AnimatePresence>
        {showArenaMenu && (
          <motion.div
            key="arena-menu-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Menu Agora"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[400] flex lg:hidden"
          >
            <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Fermer le menu" onClick={() => setShowArenaMenu(false)} />

            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 360 }}
              className="absolute bottom-0 left-0 right-0 z-10 max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-slate-950/75 backdrop-blur-md border-t border-white/10 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              data-cinema-stay
            >
              <div className="mx-auto mt-3 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" aria-hidden />

              <div className="flex flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">

                {/* Monétisation */}
                <div className="mb-5 flex items-center justify-between rounded-2xl bg-white/5 border border-white/5 p-4 shadow-inner">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mon Solde</p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <IngotIcon className="h-5 w-5 drop-shadow-md" />
                      <span className="text-xl font-black text-white">{walletBalance} <span className="text-sm font-bold text-gray-400">Lingots</span></span>
                    </div>
                  </div>
                  <button type="button" onClick={() => { setShowArenaMenu(false); goBuyPoints(); }} className="flex items-center gap-1.5 rounded-full bg-prestige-gold px-4 py-2 text-xs font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-colors hover:bg-yellow-500">
                    Recharger
                  </button>
                </div>

                {/* Grille d'actions (TikTok Style) */}
                <div className="mb-5 grid grid-cols-4 gap-3">
                  <button type="button" onClick={() => { setShowArenaMenu(false); setIsCinematicMode(true); }} className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                      <Maximize className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80">Ciné</span>
                  </button>
                  <button type="button" onClick={() => { setShowArenaMenu(false); openDrawer(); }} className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90 relative">
                      <MessageCircle className="h-6 w-6 text-white" />
                      <PremiumNotificationBadge count={unreadDMsCount} variant="cyan" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80">Messages</span>
                  </button>
                  <button type="button" onClick={() => { setShowArenaMenu(false); onShare(); }} className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                      <Share2 className="h-6 w-6 text-cyan-400" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80">Partager</span>
                  </button>
                  <button type="button" onClick={() => { setShowArenaMenu(false); window.open('/profile', '_blank'); }} className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                      <User className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80">Profil</span>
                  </button>
                </div>

                {/* Actions secondaires */}
                <div className="mb-5 flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
                  <button type="button" onClick={() => { setShowArenaMenu(false); router.push('/feed'); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10">
                    <Home className="h-5 w-5 text-gray-400" /> Retour au Feed
                  </button>
                  <button type="button" onClick={() => { setShowArenaMenu(false); window.open('/settings', '_blank'); }} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10">
                    <SettingsIcon className="h-5 w-5 text-gray-400" /> Paramètres
                  </button>
                </div>

                {/* Quitter */}
                <button type="button" onClick={() => { setShowArenaMenu(false); void handleLeave(); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm font-black uppercase tracking-widest text-rose-500 transition-colors hover:bg-rose-500/20 active:scale-95">
                  Quitter le Direct
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
