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
  Menu,
} from 'lucide-react';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { VsTransition } from './VsTransition';
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
import { postBeefManage, type BeefManageAction } from '@/lib/beef-manage-client';
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
import { FullscreenGiftAnimation, type ArenaBigGiftPayload } from './Arena/FullscreenGiftAnimation';

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
  dailyMeetingToken,
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

  const runBeefManage = useCallback(
    async (body: BeefManageAction) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast('Session expirée', 'error');
        return { ok: false as const, error: 'Session' };
      }
      const r = await postBeefManage(session.access_token, body);
      if (!r.ok) toast(r.error, 'error');
      return r;
    },
    [toast],
  );

  const isViewer = userRole === 'viewer' || userRole === 'spectator';
  const [hasJoined, setHasJoined] = useState(false);
  /** MediaStream du pré-joint (médiateur / challenger) — réutilisé par Daily pour éviter un 2ᵉ getUserMedia bloqué sur mobile. */
  const [preJoinMediaStream, setPreJoinMediaStream] = useState<MediaStream | null>(null);
  const [chatInput, setChatInput] = useState('');
  /** Chat en overlay bas-gauche (pas de sidebar) */
  const [mediatorSidebarOpen, setMediatorSidebarOpen] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [showViewerList, setShowViewerList] = useState(false);
  const [showArenaMenu, setShowArenaMenu] = useState(false);
  const [isCinematicMode, setIsCinematicMode] = useState(false);
  const [showVsScreen, setShowVsScreen] = useState(true);
  /** Spectateur promu co-hôte : le médiateur a accepté l’invitation (beef_participants). */
  const [acceptedInviteAlert, setAcceptedInviteAlert] = useState(false);

  // ── AURA "FERVEUR SOCIALE" ──
  const [auraA, setAuraA] = useState(0);
  const [auraB, setAuraB] = useState(0);
  const [auraMed, setAuraMed] = useState(0);
  const [auraFeverMed, setAuraFeverMed] = useState(false);
  /** Heat Index global : activité de la salle (chat, spectateurs, réactions) — lueur chaude sur le bandeau vidéo. */
  const [globalHeat, setGlobalHeat] = useState(0);
  const [pendingInvites, setPendingInvites] = useState<Array<{ userId: string; label: string }>>([]);
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
  const reactionDockRef = useRef<HTMLDivElement | null>(null);
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
      console.warn('[Live] Invités en attente : chargement impossible');
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

  /** Refus : UPDATE → declined (pas de DELETE RLS médiateur sur beef_participants). */
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

  /** Spectateurs : détecte l’acceptation médiateur sur leur ligne beef_participants. */
  useEffect(() => {
    if (!isViewer || !roomId || !userId) return;

    const ch = supabase
      .channel(`spectator_invite_sync_${roomId}_${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'beef_participants',
          filter: `beef_id=eq.${roomId}`,
        },
        (payload: { new: Record<string, unknown>; old?: Record<string, unknown> }) => {
          const newRow = payload.new;
          const oldRow = payload.old;
          const rawUid = newRow.user_id;
          const rowUserStr =
            typeof rawUid === 'string' ? rawUid : rawUid != null ? String(rawUid) : '';
          const myId = String(userId);
          if (rowUserStr === myId) {
            if (newRow.invite_status === 'accepted') {
              if (oldRow?.invite_status === 'accepted') {
                return;
              }
              setAcceptedInviteAlert(true);
            }
          }
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.warn('[Live] spectator_invite_sync canal indisponible');
        }
      });

    return () => {
      void supabase.removeChannel(ch);
    };
  }, [isViewer, roomId, userId]);

  const goBuyPoints = useCallback(() => {
    openBuyPointsPage(router);
  }, [router]);

  // Participant roles from DB — maps Daily.co userNames to beef roles
  const [participantRoles, setParticipantRoles] = useState<Record<string, BeefParticipantRowMeta>>({});
  const [liveViewerCount, setLiveViewerCount] = useState(viewerCount);
  const liveViewerCountRef = useRef(liveViewerCount);
  useEffect(() => {
    liveViewerCountRef.current = liveViewerCount;
  }, [liveViewerCount]);

  const prevLiveViewerCountRef = useRef(viewerCount);
  useEffect(() => {
    if (liveViewerCount > prevLiveViewerCountRef.current) {
      const delta = liveViewerCount - prevLiveViewerCountRef.current;
      setGlobalHeat((v) => Math.min(100, v + Math.min(12, delta * 3)));
    }
    prevLiveViewerCountRef.current = liveViewerCount;
  }, [liveViewerCount]);

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
  const resetPulseVoices = useArenaPulseVoicesStore((s) => s.reset);
  const resetArenaVerdict = useArenaVerdictStore((s) => s.reset);
  const addPulseVoices = useArenaPulseVoicesStore((s) => s.addPulse);
  const pulseBroadcastPending = useRef({ A: 0, B: 0 });

  const pulseBroadcastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [myVote, setMyVote] = useState<'A' | 'B' | null>(null);
  const lastPulseSideRef = useRef<'A' | 'B' | null>(null);
  const [supportBurst, setSupportBurst] = useState({ A: 0, B: 0, M: 0 });
  const supportBurstRef = useRef(supportBurst);
  useEffect(() => {
    supportBurstRef.current = supportBurst;
  }, [supportBurst]);
  const [giftPrestigeFlash, setGiftPrestigeFlash] = useState(0);
  const [localArenaBigGift, setLocalArenaBigGift] = useState<ArenaBigGiftPayload | null>(null);
  useEffect(() => {
    if (!localArenaBigGift) return;
    const t = window.setTimeout(() => setLocalArenaBigGift(null), 6000);
    return () => window.clearTimeout(t);
  }, [localArenaBigGift]);
  const [verdictConfetti, setVerdictConfetti] = useState(false);
  const [rematchSequence, setRematchSequence] = useState(false);
  const rematchVerdictTimerRef = useRef<number | null>(null);
  const rematchExitTimerRef = useRef<number | null>(null);

  /** Mémorise le panneau « préféré » pour les réactions intégrées (pas de compteur de vote). */
  const preferSide = useCallback((side: 'A' | 'B') => {
    setMyVote(side);
    lastPulseSideRef.current = side;
  }, []);

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
    statsRef.current.votesA = 0;
    statsRef.current.votesB = 0;
    setSupportBurst({ A: 0, B: 0, M: 0 });
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
    const r = await runBeefManage({
      action: 'TOGGLE_STATUS',
      beefId: roomId,
      toggle: 'START_LIVE_SESSION',
    });
    if (!r.ok) return;

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
    queueMicrotask(() => broadcastBeefGlobalTimer());
  }, [roomId, toast, broadcastBeefGlobalTimer, runBeefManage]);

  // Use refs for stats so endBeef captures the latest values without stale closures
  const statsRef = useRef({
    beefTimeRemaining: DEFAULT_BEEF_DURATION,
    liveViewerCount: 0,
    messagesCount: 0,
    /** Résonance « distante » (réactions reçues en broadcast), cumulée côté client. */
    votesA: 0,
    votesB: 0,
  });

  const endBeef = useCallback(async (reason: string = 'Terminé par le médiateur') => {
    if (beefEndedRef.current) return;

    const r = await runBeefManage({
      action: 'TOGGLE_STATUS',
      beefId: roomId,
      toggle: 'END_BEEF',
      endReason: reason,
    });
    if (!r.ok) return;

    beefEndedRef.current = true;

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

    const sb = supportBurstRef.current;
    const summary = {
      duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
      viewers: s.liveViewerCount,
      resonanceA: s.votesA + sb.A,
      resonanceB: s.votesB + sb.B,
      resonanceM: sb.M,
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
    await leaveRef.current();

    // Auto-redirect after 12 seconds
    endSummaryTimerRef.current = setTimeout(() => {
      router.replace('/feed');
    }, 12000);
  }, [roomId, router, runBeefManage]);

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
      await runBeefManage({
        action: 'TOGGLE_STATUS',
        beefId: roomId,
        toggle: 'REMATCH_MEDIATION_SUMMARY',
      });
      if (rematchVerdictTimerRef.current) clearTimeout(rematchVerdictTimerRef.current);
      rematchVerdictTimerRef.current = window.setTimeout(() => {
        rematchVerdictTimerRef.current = null;
        void endBeef('Rematch demandé');
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
      liveViewerCount,
      messagesCount: visibleMessages.length,
    };
  }, [beefTimeRemaining, liveViewerCount, visibleMessages.length]);

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
  const sponsorAuraActive = auraA > 60 || auraB > 60;
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
    autoLiveSyncedRef.current = false;
  }, [roomId]);

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
    dailyRoomUrl?: string | null;
    dailyToken?: string | null;
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
    const id = setInterval(fetchViewerAccess, 30_000);
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

  const effectiveDailyRoomUrl =
    isViewer && viewerAccessReady && serverAccess?.dailyRoomUrl
      ? serverAccess.dailyRoomUrl
      : (dailyRoomUrl ?? null);

  const meetingTokenForDaily: string | null | undefined = isViewer
    ? viewerAccessReady && serverAccess !== null
      ? (serverAccess.dailyToken !== undefined ? serverAccess.dailyToken : dailyMeetingToken)
      : undefined
    : dailyMeetingToken;

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
  } = useDailyCall(effectiveDailyRoomUrl, userName, isViewer, userId, roomId, meetingTokenForDaily);

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

  // Auto-join quand « Rejoindre » + URL Daily ; spectateur : attendre GET access (jeton).
  useEffect(() => {
    if (!hasJoined || !effectiveDailyRoomUrl || isJoined || isJoining) return;
    if (isViewer && !viewerAccessReady) return;
    if (
      isViewer &&
      viewerAccessReady &&
      serverAccess &&
      serverAccess.dailyToken === null &&
      (serverAccess.viewerAccess === 'locked' || serverAccess.viewerAccess === 'not_live')
    ) {
      return;
    }
    void join(preJoinMediaStream);
  }, [
    hasJoined,
    effectiveDailyRoomUrl,
    isJoined,
    isJoining,
    join,
    preJoinMediaStream,
    isViewer,
    viewerAccessReady,
    serverAccess,
  ]);

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
      toast('Demande envoyée ! Le médiateur va te répondre.', 'success');
    } catch (error) {
      console.error('Erreur lors de la demande');
      const msg = error instanceof Error ? error.message : 'Impossible d’envoyer la demande.';
      toast(msg, 'error');
    }
  }, [userId, roomId, toast]);

  // Spectateurs uniquement (pas médiateur ni challengers)
  useEffect(() => {
    if (!isJoined || !isViewer) return;

    supabase.rpc('increment_viewer_count', { beef_id: roomId }).then(() => {});
    setLiveViewerCount((prev) => prev + 1);

    return () => {
      supabase.rpc('decrement_viewer_count', { beef_id: roomId }).then(() => {});
    };
  }, [isJoined, roomId, isViewer]);

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
  }, [isHost, effectiveDailyRoomUrl, leftPanel, rightPanel, leftPanelName, rightPanelName]);

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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const r = await postBeefManage(session.access_token, {
        action: 'TOGGLE_STATUS',
        beefId: roomId,
        toggle: 'SYNC_LIVE',
      });
      if (r.ok) autoLiveSyncedRef.current = true;
    })();
    return () => {
      cancelled = true;
    };
  }, [isHost, isJoined, liveConnected, beefEnded, roomId, remoteParticipants.length, postBeefManage]);

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
    setGlobalHeat((v) => Math.min(100, v + 4));
  }, []);

  const addRemoteReaction = useCallback((emoji: string, supportSlot?: 'A' | 'B' | 'M' | null) => {
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && (supportSlot === 'A' || supportSlot === 'B')) {
      if (supportSlot === 'A') statsRef.current.votesA += 1;
      else statsRef.current.votesB += 1;
      return;
    }
    if (INTEGRATED_SUPPORT_REACTIONS.has(emoji) && supportSlot === 'M') {
      setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
      return;
    }
    const entry = createFlyingReactionEntry(emoji);
    setFlyingReactions((prev) => pushFlyingReaction(prev, entry));
  }, []);

  /** Boost par tap / réaction soutenue : assez fort pour contrebalancer le decay aura (−1 / 500 ms). */
  const getAuraBoost = () => (liveViewerCountRef.current > 50 ? 2 : 5);

  const emitTapSupport = useCallback((target: 'A' | 'B' | 'M') => {
    const boost = getAuraBoost();
    setGlobalHeat((v) => Math.min(100, v + 2));
    if (target === 'M') {
      setSupportBurst((p) => ({ ...p, M: p.M + 1 }));
      setAuraMed((v) => Math.min(100, v + boost));
    } else {
      setSupportBurst((p) => ({ ...p, [target]: p[target] + 1 }));
      if (target === 'A') setAuraA((v) => Math.min(100, v + boost));
      else setAuraB((v) => Math.min(100, v + boost));
    }
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
        const boost = liveViewerCountRef.current > 50 ? 2 : 5;
        const slot = payload?.supportSlot as 'A' | 'B' | 'M' | undefined;
        if (slot === 'A') setAuraA((v) => Math.min(100, v + boost));
        if (slot === 'B') setAuraB((v) => Math.min(100, v + boost));
        if (slot === 'M') setAuraMed((v) => Math.min(100, v + boost));
        setGlobalHeat((v) => Math.min(100, v + 3));
      })
      .on('broadcast', { event: 'message' }, ({ payload }: any) => {
        addRemoteMessage(payload.user_name, payload.content, payload.initial, payload.id);
      })
      .on('broadcast', { event: 'pulse_voice' }, ({ payload }: any) => {
        const dA = Math.max(0, Math.floor(Number(payload?.dA) || 0));
        const dB = Math.max(0, Math.floor(Number(payload?.dB) || 0));
        if (dA) addPulseVoices('A', dA);
        if (dB) addPulseVoices('B', dB);
        if (dA || dB) setGlobalHeat((v) => Math.min(100, v + 2));
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
        const d = Math.max(40, Math.min(600, Math.floor(Number(payload?.durationSec) || 40)));
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
          const raw = payload.summary as Record<string, unknown>;
          const legacyA = typeof raw.votesA === 'number' ? raw.votesA : 0;
          const legacyB = typeof raw.votesB === 'number' ? raw.votesB : 0;
          setEndSummary({
            duration: String(raw.duration ?? ''),
            viewers: Math.max(0, Math.floor(Number(raw.viewers) || 0)),
            resonanceA: typeof raw.resonanceA === 'number' ? raw.resonanceA : legacyA,
            resonanceB: typeof raw.resonanceB === 'number' ? raw.resonanceB : legacyB,
            resonanceM: typeof raw.resonanceM === 'number' ? raw.resonanceM : 0,
            messages: Math.max(0, Math.floor(Number(raw.messages) || 0)),
            endReason: String(raw.endReason ?? payload?.reason ?? 'Beef terminé'),
          });
        } else {
          const s = statsRef.current;
          const wall = beefWallClockStartedAtRef.current;
          const elapsed =
            wall != null
              ? Math.max(0, Math.floor((Date.now() - wall) / 1000))
              : Math.max(0, DEFAULT_BEEF_DURATION - s.beefTimeRemaining);
          const mins = Math.floor(elapsed / 60);
          const secs = elapsed % 60;
          const sb = supportBurstRef.current;
          setEndSummary({
            duration: `${mins}m ${secs.toString().padStart(2, '0')}s`,
            viewers: s.liveViewerCount,
            resonanceA: s.votesA + sb.A,
            resonanceB: s.votesB + sb.B,
            resonanceM: sb.M,
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
      const boost = getAuraBoost();
      if (heartTarget === 'M') {
        setSupportBurst((prev) => ({ ...prev, M: prev.M + 1 }));
        setAuraMed((v) => Math.min(100, v + boost));
      } else {
        setSupportBurst((prev) => ({ ...prev, [heartTarget]: prev[heartTarget] + 1 }));
        if (heartTarget === 'A') setAuraA((v) => Math.min(100, v + boost));
        else setAuraB((v) => Math.min(100, v + boost));
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

    const inv = await runBeefManage({
      action: 'INVITE_PARTICIPANT',
      beefId: roomId,
      participantId: foundUser.id,
    });
    if (!inv.ok) return;

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
    const inv = await runBeefManage({
      action: 'INVITE_PARTICIPANT',
      beefId: roomId,
      participantId: invitedUserId,
    });
    if (!inv.ok) return;

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
      const d = Math.max(40, Math.min(600, Math.floor(durationSec) || 40));
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
      console.error('[Live] Message insert failed');
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
      .catch(() => console.error('[Live] Message send chain'));
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
        {!effectiveDailyRoomUrl && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-sm text-brand-400 text-xs font-semibold px-4 py-2 rounded-full flex items-center gap-2">
            <div className="w-3 h-3 border-2 border-brand-400 border-t-transparent rounded-full animate-spin" />
            Préparation de la room vidéo...
          </div>
        )}
      </div>
    );
  }

  // Waiting for join to complete (dailyRoomUrl just became available)
  if (hasJoined && effectiveDailyRoomUrl && !isJoined && isJoining) {
    // We're in the process of joining — show arena but with a connecting overlay
  }

  const arenaHasAnnouncement = announcementTicker.trim() !== '';

  return (
    <div
      onDoubleClick={(e) => {
        const target = e.target as HTMLElement;
        // Ignore le double-clic s'il a lieu sur un élément interactif ou le chat
        if (target.closest('button, input, textarea, a, aside, [id^="dock-"]')) return;
        setIsCinematicMode(!isCinematicMode);
      }}
      className="fixed inset-0 z-10 flex h-dvh w-screen flex-col overflow-hidden bg-black lg:flex-row"
    >
      <AnimatePresence>
        {showVsScreen && (
          <VsTransition
            challengerA={leftPanelName.trim().startsWith('En attente') ? 'Challenger 1' : leftPanelName}
            challengerB={rightPanelName.trim().startsWith('En attente') ? 'Challenger 2' : rightPanelName}
            debateTitle={debateTitle}
            onComplete={() => setShowVsScreen(false)}
          />
        )}
      </AnimatePresence>

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
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500/20">
              <Lock className="w-8 h-8 text-brand-400" strokeWidth={1} aria-hidden />
            </div>
            <h2 id="paywall-preview-title" className="text-xl font-black text-white">Fin de la prévisualisation gratuite</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Les {freePreviewMinutes} premières minutes sont offertes. Pour la suite du direct, utilise tes points.
            </p>
            <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left space-y-3">
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
                  className="w-full rounded-full py-3.5 font-bold text-sm text-black brand-gradient disabled:opacity-50"
                >
                  {continuationLoading ? 'Traitement…' : `Débloquer · ${liveContinuationPrice} pts`}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => goBuyPoints()}
                    className="w-full rounded-full py-3.5 font-bold text-sm text-black brand-gradient"
                  >
                    Recharger des points
                  </button>
                  <button
                    type="button"
                    onClick={handlePayContinuation}
                    disabled={continuationLoading}
                    className="w-full rounded-full bg-white/10 py-2.5 text-xs font-semibold text-gray-400 disabled:opacity-50"
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
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-600 to-cobalt-600 shadow-glow" aria-hidden>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 id="beef-end-summary-title" className="text-2xl font-bold text-white">Beef terminé</h2>
              <p className="text-sm text-gray-400">{endSummary.endReason}</p>
            </div>

            {/* Stats (pas de compteur de votes : le soutien se lit sur l’aura en direct) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
                <div className="text-2xl font-bold text-brand-400">{endSummary.duration}</div>
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
              <div className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-gray-400">
                Résonance Générée
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex flex-col items-center rounded-2xl border border-cobalt-500/20 bg-cobalt-500/10 p-2">
                  <span className="text-lg font-black text-cobalt-400 tabular-nums">{endSummary.resonanceA}</span>
                  <span className="mt-1 font-mono text-[9px] uppercase text-cobalt-200/60">Slot A</span>
                </div>
                <div className="flex flex-col items-center rounded-2xl border border-prestige-gold/20 bg-prestige-gold/10 p-2">
                  <span className="text-lg font-black text-prestige-gold tabular-nums">{endSummary.resonanceM}</span>
                  <span className="mt-1 font-mono text-[9px] uppercase text-prestige-gold/60">Médiateur</span>
                </div>
                <div className="flex flex-col items-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-2">
                  <span className="text-lg font-black text-emerald-400 tabular-nums">{endSummary.resonanceB}</span>
                  <span className="mt-1 font-mono text-[9px] uppercase text-emerald-200/60">Slot B</span>
                </div>
              </div>
            </div>

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
                className="w-full rounded-full border border-white/10 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
              >
                Résumé & avis médiateur
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
                  router.replace('/feed');
                }}
                className="w-full rounded-full bg-brand-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
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
          className="absolute left-1/2 top-28 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full bg-prestige-gold/90 px-4 py-2 text-black shadow-prestige-ring backdrop-blur-sm"
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
          className="absolute left-1/2 top-28 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-white/10 px-5 py-3 text-white shadow-glow-cyan backdrop-blur-sm"
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

      {/* === ASIDE CHAT (DESKTOP SEULEMENT) === */}
      {!isCinematicMode && (
        <aside className="hidden lg:flex relative min-h-0 w-[350px] min-w-[350px] shrink-0 h-full flex-col border-r border-white/10 bg-[#0c0c0f] z-[100]">
        <header className="relative z-30 shrink-0 flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <button type="button" onClick={() => setShowArenaMenu(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"><Menu className="h-5 w-5" strokeWidth={1.5} /></button>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <div className={`flex items-center rounded-full px-2 py-0.5 ${liveBadgeHot ? 'animate-pulse bg-red-600 shadow-glow' : 'bg-white/10'}`}>
              <div className={`mr-1 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'bg-white' : 'bg-amber-300'}`} />
              <span className="font-mono text-[10px] font-bold uppercase text-white">LIVE</span>
            </div>
            <span className="min-w-0 truncate text-xs font-semibold text-white/80">Chat</span>
          </div>
          <button type="button" onClick={() => setShowViewerList(true)} className="flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-white/80 hover:bg-white/10">
            <Eye className="h-3.5 w-3.5" strokeWidth={1.2} />
            <span className="font-mono text-[11px] font-medium">{liveViewerCount > 0 ? liveViewerCount : '—'}</span>
          </button>
          {showArenaMenu && (
            <div className="absolute left-4 top-full z-[200] mt-2 flex w-48 flex-col rounded-xl border border-white/10 bg-[#121215] py-2 shadow-2xl" onClick={() => setShowArenaMenu(false)}>
              <button type="button" onClick={() => router.push('/feed')} className="px-4 py-2 text-left text-sm text-white hover:bg-white/10">🏠 Retour au Feed</button>
              <button type="button" onClick={() => router.push('/messages')} className="px-4 py-2 text-left text-sm text-white hover:bg-white/10">💬 Messages</button>
              <div className="my-1 h-px w-full bg-white/10" />
              <button type="button" onClick={handleLeave} className="px-4 py-2 text-left text-sm text-red-400 hover:bg-white/10">🚪 Quitter</button>
            </div>
          )}
        </header>
        <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
          <div ref={chatMessagesScrollRef} className="flex-1 overflow-y-auto px-4 py-2 hide-scrollbar">
            {visibleMessages.map((msg) => (
              <div key={msg.id} className="mb-3">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50 mr-2">{msg.user_name}</span>
                <div className="inline-block rounded-2xl rounded-tl-sm border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/90">{msg.content}</div>
              </div>
            ))}
            <div ref={chatMessagesEndRef} className="h-px w-full" />
          </div>

          <div id="dock-desktop" className="mt-auto flex w-full shrink-0 items-center gap-2 p-3 border-t border-white/10 bg-black/40">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full bg-white/10 px-4 py-2 text-[13px] text-white focus:outline-none" />
            <button onClick={() => { setShowGiftPicker(false); setShowAllReactions(!showAllReactions); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">😀</button>
            <button onClick={() => { setShowAllReactions(false); setShowGiftPicker(!showGiftPicker); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400"><Gift className="h-4 w-4 text-white" /></button>
            <button onClick={() => void handleSendMessage()} disabled={!chatInput.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 disabled:opacity-35"><Send className="h-4 w-4 text-white" /></button>
          </div>
        </div>
      </aside>
      )}

      {/* === ZONE 2 : LA VIDÉO (AVEC OVERLAY CHAT MOBILE) === */}
      <div className="relative flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-black z-10">

        {/* HEADER GLOBAL FLOTTANT */}
        {!isCinematicMode && (
          <div className="absolute top-0 inset-x-0 z-[200] p-4 flex justify-between items-start pointer-events-none">
          {!beefEnded && !isLeaving && (
            <button onClick={handleLeave} className="lg:hidden pointer-events-auto flex h-8 items-center gap-1 rounded-full bg-black/40 px-3 text-xs font-semibold text-white backdrop-blur-sm shrink-0">← <span className="hidden sm:inline">Quitter</span></button>
          )}
          
          <AnimatePresence>
            {arenaHasAnnouncement && (
              <motion.div
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -50, opacity: 0 }}
                className="flex-1 mx-2 sm:mx-4 overflow-hidden pointer-events-none flex items-center h-8"
              >
                <div className="w-full bg-amber-500/95 backdrop-blur-md rounded-full shadow-lg border border-white/20 overflow-hidden flex items-center h-full">
                  <div
                    className="whitespace-nowrap flex items-center h-full pl-[100%]"
                    style={{
                      animation: `marquee ${Math.max(25, announcementTicker.length * 0.35)}s linear infinite`,
                    }}
                  >
                    <p className="text-black font-black text-[10px] sm:text-[11px] uppercase tracking-wider inline-block">
                      {announcementTicker} <span className="mx-8 opacity-50">•</span> {announcementTicker} <span className="mx-8 opacity-50">•</span> {announcementTicker}
                    </p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex flex-col items-end gap-2 pointer-events-auto ml-auto shrink-0">
            <div className="flex items-center gap-2">
              <div className={`flex items-center rounded-full bg-black/40 backdrop-blur-sm px-2 py-1`}>
                <div className={`mr-1.5 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'bg-red-500 animate-pulse' : 'bg-amber-400'}`} />
                <span className="font-mono text-[10px] font-bold text-white">LIVE</span>
              </div>
              <button onClick={() => setShowViewerList(true)} className="flex items-center gap-1 rounded-full bg-black/40 px-2 py-1"><Eye className="h-3.5 w-3.5 text-white" /><span className="text-[10px] text-white">{liveViewerCount > 0 ? liveViewerCount : '—'}</span></button>
              <button onClick={onShare} className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40"><Share2 className="h-3.5 w-3.5 text-white" /></button>
              {isHost && <button onClick={(e) => { e.stopPropagation(); setMediatorSidebarOpen(o => !o); }} className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-amber-300 hover:bg-black/60 shadow-lg"><Sliders className="h-4 w-4" /></button>}
            </div>
            {isJoined && timerActive && (
              <div className="flex items-center gap-1 text-xs text-white bg-black/40 px-2 py-1 rounded-full">{timerPaused ? <Pause className="h-3 w-3 text-amber-200" /> : <Timer className="h-3 w-3" />}{formatBeefTime(beefTimeRemaining)}</div>
            )}
          </div>
        </div>
        )}

        {/* SPLIT SCREEN - Version Liquid Cards */}
        <div className="absolute inset-0 flex flex-row items-stretch z-0 p-2 sm:p-5 gap-2 sm:gap-5">

          {/* DALLE GAUCHE */}
          <div
            className="relative flex-1 min-w-0 h-full overflow-hidden bg-[#08080a] rounded-[1.5rem] sm:rounded-[3.5rem] shadow-2xl border border-white/5 transition-all duration-700"
            style={{
              opacity: speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' ? 0.3 : 1,
              transform: speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' ? 'scale(1.02)' : 'scale(1)',
              filter: speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' ? 'grayscale(0.6) blur(3px)' : 'none',
            }}
          >
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10" animate={{ boxShadow: auraA > 0 ? `inset 0 0 ${40 + auraA}px rgba(59,130,246,${Math.min(0.8, 0.4 + auraA / 100)})` : 'none' }} transition={{ type: 'tween', duration: 0.35 }} />
            <AnimatePresence mode="wait">
              <motion.div key={leftPanel?.sessionId || 'empty'} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {leftPanel?.videoTrack ? <ParticipantVideo videoTrack={leftPanel.videoTrack} muted={leftPanelIsLocal} className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl opacity-30">👤</span></div>}
              </motion.div>
            </AnimatePresence>
            {!leftPanelIsLocal && <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => { emitTapSupport('A'); preferSide('A'); }} className="absolute inset-0 z-[28] touch-manipulation w-full h-full" aria-label="Soutenir A" />}
            <div className="absolute inset-x-4 max-lg:top-[4.5rem] max-lg:bottom-auto bottom-6 z-[140] flex flex-row items-center justify-between gap-3 pointer-events-auto">
              <div className="flex flex-col items-start min-w-0 flex-1">
                <button onClick={(e) => { e.stopPropagation(); void openProfile(leftPanelName, leftPanel?.arenaUserId ?? null); }} className="text-white text-sm font-black tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] hover:underline text-left leading-tight w-full truncate">
                  @{leftPanelName.trim().startsWith('En attente') ? 'Challenger 1' : leftPanelName}
                </button>
                {speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' && (
                  <div className="rounded-full bg-red-600/90 px-2.5 py-1 text-[11px] font-black text-white shadow-lg animate-pulse border border-white/20 mt-1">
                    {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
              {leftPanelIsLocal && !isViewer && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toggleMic(); }} className={`flex h-9 w-9 rounded-full items-center justify-center backdrop-blur-md transition-colors ${micEnabled ? 'bg-black/50 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-lg'}`}><Mic className="h-4 w-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); toggleCam(); }} className={`flex h-9 w-9 rounded-full items-center justify-center backdrop-blur-md transition-colors ${camEnabled ? 'bg-black/50 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-lg'}`}><Video className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>

          {/* DALLE DROITE */}
          <div
            className="relative flex-1 min-w-0 h-full bg-[#08080a] overflow-hidden rounded-[1.5rem] sm:rounded-[3.5rem] shadow-2xl border border-white/5 transition-all duration-700"
            style={{
              opacity: speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' ? 0.3 : 1,
              transform: speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' ? 'scale(1.02)' : 'scale(1)',
              filter: speakingTurnActive && effectiveHotMicSpeakerSlot === 'A' ? 'grayscale(0.6) blur(3px)' : 'none',
            }}
          >
            <motion.div aria-hidden className="pointer-events-none absolute inset-0 z-10" animate={{ boxShadow: auraB > 0 ? `inset 0 0 ${40 + auraB}px rgba(16,185,129,${Math.min(0.8, 0.4 + auraB / 100)})` : 'none' }} transition={{ type: 'tween', duration: 0.35 }} />
            <AnimatePresence mode="wait">
              <motion.div key={rightPanel?.sessionId || 'empty'} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                {rightPanel?.videoTrack ? <ParticipantVideo videoTrack={rightPanel.videoTrack} muted={rightPanelIsLocal} className="absolute inset-0 w-full h-full object-cover" /> : <div className="absolute inset-0 flex items-center justify-center"><span className="text-5xl opacity-30">👤</span></div>}
              </motion.div>
            </AnimatePresence>
            {!rightPanelIsLocal && <motion.button type="button" whileTap={{ scale: 0.96 }} onClick={() => { emitTapSupport('B'); preferSide('B'); }} className="absolute inset-0 z-[28] touch-manipulation w-full h-full" aria-label="Soutenir B" />}
            <div className="absolute inset-x-4 max-lg:top-[4.5rem] max-lg:bottom-auto bottom-6 z-[140] flex flex-row items-center justify-between gap-3 pointer-events-auto">
              <div className="flex flex-col items-start min-w-0 flex-1">
                <button onClick={(e) => { e.stopPropagation(); void openProfile(rightPanelName, rightPanel?.arenaUserId ?? null); }} className="text-white text-sm font-black tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] hover:underline text-left leading-tight w-full truncate">
                  @{rightPanelName.trim().startsWith('En attente') ? 'Challenger 2' : rightPanelName}
                </button>
                {speakingTurnActive && effectiveHotMicSpeakerSlot === 'B' && (
                  <div className="rounded-full bg-emerald-500/90 px-2.5 py-1 text-[11px] font-black text-white shadow-lg animate-pulse border border-white/20 mt-1">
                    {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                  </div>
                )}
              </div>
              {rightPanelIsLocal && !isViewer && (
                <div className="flex shrink-0 gap-2">
                  <button onClick={(e) => { e.stopPropagation(); toggleMic(); }} className={`flex h-9 w-9 rounded-full items-center justify-center backdrop-blur-md transition-colors ${micEnabled ? 'bg-black/50 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-lg'}`}><Mic className="h-4 w-4" /></button>
                  <button onClick={(e) => { e.stopPropagation(); toggleCam(); }} className={`flex h-9 w-9 rounded-full items-center justify-center backdrop-blur-md transition-colors ${camEnabled ? 'bg-black/50 text-white hover:bg-white/20' : 'bg-red-500 text-white shadow-lg'}`}><Video className="h-4 w-4" /></button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* MÉDIATEUR AU CENTRE */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[150] flex flex-col items-center gap-1 pointer-events-none">
          <motion.div animate={{ boxShadow: auraMed > 0 ? `0 0 ${40 + auraMed * 2}px rgba(251,191,36,${Math.min(1, 0.4 + auraMed / 100)})` : 'none' }} className="rounded-full pointer-events-auto">
            <button type="button" onClick={() => { emitTapSupport('M'); preferSide('M' as any); }} className="flex h-28 w-28 lg:h-[190px] lg:w-[190px] rounded-full border-[3px] border-amber-400 bg-black overflow-hidden active:scale-95">
              {mediatorParticipant?.videoTrack ? <ParticipantVideo videoTrack={mediatorParticipant.videoTrack} muted={mediatorIsLocal} className="w-full h-full object-cover" /> : <span className="text-5xl text-white/30 m-auto">👤</span>}
            </button>
          </motion.div>
          <button type="button" onClick={() => openProfile(mediatorName, host.id)} className="pointer-events-auto rounded-full bg-black/80 px-3 py-1 mt-1 hover:bg-black border border-white/10 shadow-lg"><span className="text-[11px] font-bold text-white">@{mediatorName}</span></button>
        </div>

        {/* OVERLAY CHAT MOBILE (Intégré à la vidéo, invisible sur PC) */}
        {!isCinematicMode && (
          <div className="absolute inset-x-0 bottom-0 z-[160] lg:hidden flex flex-col justify-end bg-gradient-to-t from-black via-black/80 to-transparent pt-32 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none">
          <div className="pointer-events-auto w-[85%] max-h-[30vh] overflow-y-auto px-3 mb-2 flex flex-col justify-end hide-scrollbar">
            {visibleMessages.map((msg) => (
              <div key={msg.id} className="mb-2">
                <span className="text-[11px] font-bold text-white/60 mr-2">{msg.user_name}</span>
                <span className="text-[13px] text-white drop-shadow-md">{msg.content}</span>
              </div>
            ))}
            <div ref={chatMessagesScrollRef} />
          </div>
          <div id="dock-mobile" className="pointer-events-auto flex w-full items-center gap-2 px-3 pb-2 mt-auto shrink-0">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} className="flex-1 min-w-0 rounded-full bg-white/15 px-4 py-2 text-[13px] text-white focus:outline-none" placeholder="Message..." />
            <button onClick={() => { setShowGiftPicker(false); setShowAllReactions(!showAllReactions); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg">😀</button>
            <button onClick={() => { setShowAllReactions(false); setShowGiftPicker(!showGiftPicker); }} className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-orange-400"><Gift className="h-4 w-4 text-white" /></button>
            <button onClick={() => void handleSendMessage()} disabled={!chatInput.trim()} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 disabled:opacity-50"><Send className="h-4 w-4 text-white" /></button>
          </div>
        </div>
        )}

        {/* REACTIONS VOLANTES */}
        <div className="pointer-events-none absolute inset-0 z-[160]">
          <FlyingReactionsLayer reactions={flyingReactions} onRemove={(id) => setFlyingReactions((p) => p.filter(r => r.id !== id))} />
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
          onStartBeef={async () => { setStartingBeef(true); try { await startBeefTimer(); } finally { setStartingBeef(false); } }}
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
          onEjectParticipant={async (sid) => { const ok = await ejectRemoteParticipant(sid); if (ok) toast('Participant expulsé', 'success'); else toast('Expulsion impossible.', 'error'); }}
          onAdjustTime={adjustBeefTime}
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
          pendingInvites={pendingInvites}
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
                className="pointer-events-auto max-h-[min(50dvh,280px)] w-[min(calc(100vw-1rem),18rem)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-2xl border border-white/[0.1] bg-[#121215] p-2 pt-1.5 shadow-2xl backdrop-blur-xl"
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
                className="pointer-events-auto max-h-[min(60dvh,380px)] w-[min(calc(100vw-1rem),340px)] overflow-y-auto overscroll-contain rounded-2xl border border-white/12 bg-[#121215] p-3 pt-2 shadow-2xl backdrop-blur-xl hide-scrollbar"
              >
                <div className="mb-2 flex items-start justify-between gap-2 border-b border-white/[0.08] pb-2">
                  <p className="min-w-0 flex-1 pl-0.5 text-[11px] font-semibold leading-snug text-white/75">
                    Envoyer au médiateur
                  </p>
                  <button
                    type="button"
                    onClick={() => setShowGiftPicker(false)}
                    aria-label="Fermer les cadeaux"
                    className="flex h-9 min-h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { emoji: '🧂', label: 'Sel', id: 'salt', cost: 1 },
                    { emoji: '🎤', label: 'Mic Drop', id: 'mic_drop', cost: 5 },
                    { emoji: '🌶️', label: 'Spicy', id: 'spicy', cost: 10 },
                    { emoji: '🧠', label: 'Big Brain', id: 'big_brain', cost: 25 },
                    { emoji: '⚡', label: 'Foudre', id: 'lightning', cost: 50 },
                    { emoji: '🥊', label: 'K.O.', id: 'ko', cost: 99 },
                    { emoji: '💣', label: 'Banger', id: 'banger', cost: 199 },
                    { emoji: '🐺', label: 'Loup', id: 'wolf', cost: 500 },
                    { emoji: '☄️', label: 'Météore', id: 'meteor', cost: 1000 },
                    { emoji: '🌋', label: 'Éruption', id: 'volcano', cost: 2500 },
                    { emoji: '🏆', label: 'Champion', id: 'champion', cost: 5000 },
                    { emoji: '🐐', label: 'G.O.A.T', id: 'goat', cost: 10000 },
                  ].map((gift) => (
                    <button
                      key={gift.label}
                      type="button"
                      onClick={async () => {
                        if (userPoints < gift.cost) {
                          toast(`Points insuffisants — il te manque ${gift.cost - userPoints} pts (solde ${userPoints})`, 'error', {
                            action: { label: 'Recharger', onClick: () => goBuyPoints() },
                          });
                          return;
                        }
                        try {
                          const { data: { session } } = await supabase.auth.getSession();
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
                          const medBoost = Math.min(25, 4 + Math.floor(gift.cost / 40));
                          setAuraMed((v) => Math.min(100, v + medBoost));
                          if (gift.cost >= 50) {
                            setGiftPrestigeFlash((k) => k + 1);
                          }
                          const giftKey =
                            data.giftId != null ? String(data.giftId) : `gift_${Date.now()}`;
                          const msgContent = `a offert ${gift.emoji} ${gift.label} (${gift.cost} pts) au médiateur`;
                          const initial = userName?.[0]?.toUpperCase() || '?';
                          addRemoteMessage(userName, msgContent, initial, giftKey);
                          void channelRef.current
                            ?.send({
                              type: 'broadcast',
                              event: 'message',
                              payload: {
                                user_name: userName,
                                content: msgContent,
                                initial,
                                id: giftKey,
                              },
                            })
                            .catch(() => {});
                          if (gift.cost >= 500) {
                            const bigPayload: ArenaBigGiftPayload = {
                              cost: gift.cost,
                              label: gift.label,
                              emoji: gift.emoji,
                              giftTypeId: gift.id,
                              senderName: userName,
                            };
                            setLocalArenaBigGift(bigPayload);
                            void channelRef.current
                              ?.send({
                                type: 'broadcast',
                                event: 'arena_big_gift',
                                payload: bigPayload,
                              })
                              .catch(() => {});
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
                      className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 p-2 hover:bg-white/12 active:scale-95"
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
        </div>,
        document.body
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
                        className={`flex-1 rounded-full py-2.5 font-bold transition-colors ${
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
                        className="flex-1 rounded-full border border-white/10 bg-white/5 py-2.5 font-bold text-white transition-colors hover:bg-white/10"
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
                      className="w-full rounded-full border border-white/15 bg-transparent py-2 text-[13px] font-semibold text-white/55 transition-colors hover:border-ember-500/40 hover:text-ember-300/95"
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

      <AnimatePresence>
        {acceptedInviteAlert && !beefEnded && (
          <motion.div
            key="mediation-table-invite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/90 px-4 backdrop-blur-md"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mediation-invite-title"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl border border-cobalt-500/30 bg-gradient-to-b from-[#0c0c0f] to-black p-6 text-center shadow-[0_0_80px_rgba(59,130,246,0.15)]"
            >
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-cobalt-500/20">
                <span className="text-4xl" aria-hidden>
                  ⚖️
                </span>
              </div>
              <h2
                id="mediation-invite-title"
                className="mb-2 font-mono text-xl font-black uppercase tracking-tight text-white"
              >
                Invitation à la médiation
              </h2>
              <p className="mb-6 text-sm text-white/60">
                Le médiateur souhaite t&apos;entendre. Installe-toi à la table des échanges en préparant ta caméra et
                ton micro.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full rounded-full bg-cobalt-500 py-3.5 font-mono text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(59,130,246,0.3)] transition-transform hover:bg-cobalt-400 active:scale-95"
              >
                Prendre place
              </button>
              <button
                type="button"
                onClick={() => setAcceptedInviteAlert(false)}
                className="mt-3 text-xs font-semibold text-white/40 hover:text-white/80"
              >
                Annuler et rester spectateur
              </button>
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
        @keyframes marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-100%); }
        }
      `}</style>
      {typeof document !== 'undefined' &&
        createPortal(
          <FullscreenGiftAnimation roomId={roomId} localBigGift={localArenaBigGift} />,
          document.body
        )}
    </div>
  );
}
