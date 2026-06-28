'use client';

import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  Gift,
  X,
  PanelRight,
  Send,
  Award,
  Share2,
  Calendar,
  Flame,
  Menu,
  Music,
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
import { ArenaLayoutManager } from '@/components/Arena/ArenaLayoutManager';
import { FeatureGuide } from './FeatureGuide';
import { ViewerListModal } from './ViewerListModal';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { physicalPeerToCallParticipant, useDailyCall, type CallParticipant } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { userIdsEqual } from '@/lib/user-id-equal';
import { useToast } from '@/components/Toast';
import { useMediaSession } from '@/hooks/useMediaSession';
import { sanitizeMessage } from '@/lib/security';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';
import { postBeefManage, type BeefManageAction } from '@/lib/beef-manage-client';
import { escapeForIlikeExact } from '@/lib/ilike-exact';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { ARENA_QUICK_REACTIONS } from '@/lib/arena-quick-reactions';
import {
  buildParticipantAliasSet,
  isValidArenaUserId,
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
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';
import { MediatorSupportHalo } from './MediatorSupportHalo';
import { useArenaPulseVoicesStore } from '@/lib/stores/arenaPulseVoicesStore';
import { useArenaVerdictStore } from '@/lib/stores/arenaVerdictStore';
import { VerdictConfettiBurst, RematchVerdictOverlay } from './VerdictEffects';
import { playRematchThunderSfx } from '@/lib/playVerdictSfx';
import { MediatorSidebar, type MediatorRemoteRow } from './MediatorSidebar';
import { FullscreenGiftAnimation, type ArenaBigGiftPayload } from './Arena/FullscreenGiftAnimation';
import { MeetingAudioOutlet } from '@/components/MeetingAudioOutlet';
import {
  useArenaRealtime,
  type UseArenaRealtimeResult,
  type ArenaRealtimeCallbacks,
  type StructuredDebateBroadcastPayload,
} from '@/hooks/useArenaRealtime';

const SFX_MAP: Record<string, string> = {
  horn: '/sounds/horn.mp3',
  laugh: '/sounds/laugh.mp3',
  slap: '/sounds/slap.mp3',
  drumroll: '/sounds/drumroll.mp3',
  crickets: '/sounds/crickets.mp3',
  bell: '/sounds/bell.mp3',
};

const playSfx = (id: string) => {
  const src = SFX_MAP[id];
  if (!src) return;
  const audio = new Audio(src);
  audio.volume = 0.8;
  audio.play().catch(() => console.warn('[Audio] Interaction requise'));
};

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

const getUsernameColor = (username: string) => {
  const colors = [
    'text-cyan-400',
    'text-emerald-400',
    'text-amber-400',
    'text-cyan-400',
    'text-rose-400',
    'text-sky-400',
  ];
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

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

  // ── AUTH HOOK (Conversion des anonymes + mur freemium mandatory) ──
  const [authHook, setAuthHook] = useState<{
    title: string;
    subtitle: string;
    mandatory?: boolean;
  } | null>(null);
  const requireAuth = useCallback((title: string, subtitle: string) => {
    if (!userId) {
      setAuthHook({ title, subtitle, mandatory: false });
      return true;
    }
    return false;
  }, [userId]);

  const [hasJoined, setHasJoined] = useState(false);
  const [showPreJoin, setShowPreJoin] = useState(true);
  const [rolesLoaded, setRolesLoaded] = useState(false);

  useEffect(() => {
    console.log("=== 🩺 HEALTH CHECK SUPABASE REALTIME ===");
    const testCh = supabase.channel('test_health_check');
    testCh.subscribe((status, err) => {
      console.log("=> STATUT WEBSOCKET BRUT :", status);
      if (err) console.error("=> ERREUR WEBSOCKET :", err);
    });
    return () => { void supabase.removeChannel(testCh); };
  }, []);

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

  const [chatInput, setChatInput] = useState('');
  /** Chat en overlay bas-gauche (pas de sidebar) */
  const [mediatorSidebarOpen, setMediatorSidebarOpen] = useState(false);
  const [showGiftPicker, setShowGiftPicker] = useState(false);
  const [giftTarget, setGiftTarget] = useState<string>('');
  const [showViewerList, setShowViewerList] = useState(false);
  const [showArenaMenu, setShowArenaMenu] = useState(false);
  const { openDrawer } = useMessagesDrawer();
  const [isCinematicMode, setIsCinematicMode] = useState(false);
  const [showVsScreen, setShowVsScreen] = useState(true);
  const [soundboardExpanded, setSoundboardExpanded] = useState(false);
  /** Spectateur promu co-hôte : le médiateur a accepté l’invitation (beef_participants). */
  const [acceptedInviteAlert, setAcceptedInviteAlert] = useState(false);

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
  const [contextMenuMsg, setContextMenuMsg] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'message')
        .or('is_read.is.null,is_read.eq.false');
      if (count !== null) setUnreadDMsCount(count);
    };
    void fetchUnread();

    const channel = supabase
      .channel(`arena_dms_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && payload.new.type === 'message') {
            setUnreadDMsCount(c => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && payload.new.type === 'message' && payload.new.is_read) {
            setUnreadDMsCount(c => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);
  const [showAllReactions, setShowAllReactions] = useState(false); // NEW: Toggle pour afficher toutes les réactions
  /** Portail body : cadeaux / panneau réactions au-dessus de la vidéo (z-50) */
  const [dockPickersMounted, setDockPickersMounted] = useState(false);
  const [dockPickerPos, setDockPickerPos] = useState<{ bottom: number; right: number } | null>(null);
  /** Colonne emoji / cadeaux / partage — fermeture au tap extérieur */
  const reactionDockRef = useRef<HTMLDivElement | null>(null);
  const chatMessagesScrollRef = useRef<HTMLDivElement>(null);
  const chatMessagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessagesMobileScrollRef = useRef<HTMLDivElement>(null);
  const chatMessagesMobileEndRef = useRef<HTMLDivElement>(null);
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

  // Auto-fermeture : 3s soundboard, 3s menu PC (pickers : fermeture au tap extérieur uniquement)
  useEffect(() => {
    if (!soundboardExpanded) return;
    const t = setTimeout(() => setSoundboardExpanded(false), 3000);
    return () => clearTimeout(t);
  }, [soundboardExpanded]);

  useEffect(() => {
    if (!showArenaMenu) return;
    const t = setTimeout(() => setShowArenaMenu(false), 3000);
    return () => clearTimeout(t);
  }, [showArenaMenu]);

  /** Clic extérieur → fermer la régie (le backdrop gère déjà le tap sur le voile) */
  useEffect(() => {
    if (!mediatorSidebarOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target;
      if (!(t instanceof Node)) return;
      if (document.querySelector('[data-mediator-regie-sheet]')?.contains(t)) return;
      if (document.querySelector('[data-mediator-sidebar-toggle]')?.contains(t)) return;
      if (t instanceof Element && t.closest('[data-soundboard-dock]')) return;
      setMediatorSidebarOpen(false);
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [mediatorSidebarOpen]);

  // Soundboard : clic extérieur du dock → repli
  useEffect(() => {
    if (!soundboardExpanded) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target;
      if (el instanceof Element && el.closest('[data-soundboard-dock]')) return;
      setSoundboardExpanded(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [soundboardExpanded]);

  const scrollChatToEnd = useCallback(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        // Desktop
        const elDesktop = chatMessagesScrollRef.current;
        if (elDesktop) {
          elDesktop.scrollTop = elDesktop.scrollHeight;
        }
        chatMessagesEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });

        // Mobile
        const elMobile = chatMessagesMobileScrollRef.current;
        if (elMobile) {
          elMobile.scrollTop = elMobile.scrollHeight;
        }
        chatMessagesMobileEndRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
      });
    });
  }, []);

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

  // Moderator controls — même logique normalisée que les pages arène / live (UUID casse / espaces).
  const isHost = userIdsEqual(userId, host.id);

  const fetchPendingInvites = useCallback(async () => {
    if (!isHost) return;
    const { data, error } = await supabase
      .from('beef_participants')
      .select('user_id')
      .eq('beef_id', roomId)
      .eq('invite_status', 'pending');
    if (error || !data) {
      console.warn('[Live] Invités en attente : chargement impossible');
      return;
    }
    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    const ids = data.map((r) => r.user_id);
    const pubMap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name');

    setPendingInvites(
      data.map((r) => {
        const u = pubMap.get(r.user_id);
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

  /** Chat temps réel : dédup + insert (réutilisé par `useArenaRealtime`, avant Daily). */
  const seenMsgKeys = useRef(new Set<string>());

  const addRemoteMessage = useCallback((msgUserName: string, content: string, initial?: string, dbId?: string) => {
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
    });
    setGlobalHeat((v) => Math.min(100, v + 4));
  }, [addMessage]);

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
    const popup = window.open('/buy-points', 'StripeCheckout', `width=${width},height=${height},top=${top},left=${left}`);
    
    const initialPoints = userPoints;
    const pollTimer = setInterval(async () => {
      if (popup?.closed) {
        clearInterval(pollTimer);
      }
      const { data } = await supabase.from('users').select('points').eq('id', userId).single();
      if (data && data.points > initialPoints) {
        setUserPoints(data.points);
        toast('Lingots crédités !', 'success');
        clearInterval(pollTimer);
        if (popup && !popup.closed) popup.close();
      }
    }, 3000);
  }, [userId, userPoints, toast]);

  // Participant roles from DB — maps Daily.co userNames to beef roles
  const [participantRoles, setParticipantRoles] = useState<Record<string, BeefParticipantRowMeta>>({});
  // Ordre canonique (accepted first → is_main → created_at) pour coller au feed
  const [participantUidOrder, setParticipantUidOrder] = useState<string[]>([]);

  useEffect(() => {
    if (Object.keys(participantRoles).length > 0) setRolesLoaded(true);
  }, [participantRoles]);

  const loadParticipants = useCallback(async () => {
    const { data } = await supabase
      .from('beef_participants')
      .select('user_id, role, is_main, invite_status, created_at')
      .eq('beef_id', roomId);

    // --- DÉTECTEUR D'EXPULSION (LIMBO FIX) ---
    if (!isViewer && !isHost && data) {
      const amIStillHere = data.some((p: { user_id: string }) => p.user_id === userId);
      if (!amIStillHere) {
        toast('Vous avez été renvoyé dans les gradins par la régie.', 'error');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
    }
    // -----------------------------------------

    if (!data?.length) {
      setParticipantRoles({});
      setParticipantUidOrder([]);
      return;
    }

    type ParticipantRow = {
      user_id: string;
      role: string;
      is_main: boolean | null;
      invite_status?: string | null;
      created_at?: string | null;
    };

    // Seuls les "accepted" obtiennent un halo dans la grille géométrique
    const validData = (data as ParticipantRow[]).filter(
      (p) =>
        p.role !== 'witness' &&
        p.invite_status === 'accepted',
    );

    // Même ordre que le feed : accepted → is_main → created_at
    const sorted = [...validData].sort((a, b) => {
      const statusA = a.invite_status === 'accepted' ? 0 : 1;
      const statusB = b.invite_status === 'accepted' ? 0 : 1;
      if (statusA !== statusB) return statusA - statusB;
      const mainA = a.is_main ? 0 : 1;
      const mainB = b.is_main ? 0 : 1;
      if (mainA !== mainB) return mainA - mainB;
      return new Date(a.created_at ?? 0).getTime() - new Date(b.created_at ?? 0).getTime();
    });

    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    const ids = sorted.map((p) => p.user_id).filter(Boolean);
    const pubMap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name, avatar_url');
    const roles: Record<string, BeefParticipantRowMeta> = {};
    sorted.forEach((p) => {
      const u = pubMap.get(p.user_id);
      const dn = (u?.display_name ?? '').trim();
      const un = (u?.username ?? '').trim();
      const name = dn || un || 'Participant';
      roles[p.user_id] = {
        role: p.role,
        name,
        matchAliases: buildParticipantAliasSet(u?.display_name, u?.username, name),
        avatarUrl: u?.avatar_url?.trim() || null,
      };
    });
    setParticipantRoles(roles);
    setParticipantUidOrder(sorted.map((p) => p.user_id));
  }, [roomId, userId, isViewer, isHost, toast]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);

  const expectedUids = useMemo(() => {
    // Priorité à l'ordre canonique DB (accepted first → is_main → created_at)
    // On filtre l'host Ref qui n'occupe pas un slot challenger
    const mid = host.id?.trim().toLowerCase() ?? '';
    const ordered = participantUidOrder.filter((uid) => uid !== mid && participantRoles[uid]);
    if (ordered.length > 0) return ordered;
    // Fallback si l'état n'est pas encore peuplé
    return Object.keys(participantRoles).filter((uid) => uid !== mid);
  }, [participantRoles, participantUidOrder, host.id]);

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
  const stopAllMediaTracksRef = useRef<() => void>(() => {});

  /** API broadcast issue du hook (remplie à chaque rendu après `useArenaRealtime`). */
  const arenaOutboundRef = useRef<Partial<UseArenaRealtimeResult>>({});
  const beefGlobalTimerFlushRef = useRef<(() => void) | null>(null);
  const scheduleBeefGlobalTimerBroadcast = useCallback(() => {
    queueMicrotask(() => beefGlobalTimerFlushRef.current?.());
  }, []);

  /** Sérialise les INSERT chat pour éviter les rafales concurrentes côté RLS. */
  const messageSendChainRef = useRef(Promise.resolve());

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
        window.setTimeout(() => void endBeef('Verdict : résolu'), 1600);
        return;
      }
      if (kind === 'closed') {
        void endBeef('Clos par le Ref');
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
      messagesCount: useArenaVolatileStore.getState().messages.length,
    };
  }, [beefTimeRemaining, liveViewerCount]);

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

  // Load user points
  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase.from('users').select('points').eq('id', userId).single();
      if (data) setUserPoints(data.points || 0);
    })();
  }, [userId]);

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

  const joinAttemptedRef = useRef(false);
  // Auto-join quand « Rejoindre » + URL Daily + jeton (fournis par la page parente).
  useEffect(() => {
    if (!hasJoined || !effectiveDailyRoomUrl || !meetingTokenForDaily || isJoined || isJoining || joinAttemptedRef.current) return;
    joinAttemptedRef.current = true;
    void join(preJoinMediaStream, { camEnabled: preJoinCamEnabled });
  }, [hasJoined, effectiveDailyRoomUrl, meetingTokenForDaily, isJoined, isJoining, join, preJoinMediaStream, preJoinCamEnabled]);

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

  // Spectateurs uniquement (pas médiateur ni challengers)
  useEffect(() => {
    if (!isJoined || !isViewer) return;

    supabase.rpc('increment_viewer_count', { beef_id: roomId }).then(() => {});
    setLiveViewerCount((prev) => prev + 1);

    return () => {
      supabase.rpc('decrement_viewer_count', { beef_id: roomId }).then(() => {});
    };
  }, [isJoined, roomId, isViewer]);

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

  const leftPanelRef = useRef(leftPanel);
  const rightPanelRef = useRef(rightPanel);
  leftPanelRef.current = leftPanel;
  rightPanelRef.current = rightPanel;

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

  /** Chat : uniquement les messages du live (pas d'historique DB au join). */
  useEffect(() => {
    if (!roomId) return;
    seenMsgKeys.current.clear();
    clearMessages();
    clearReactions();
  }, [roomId, clearMessages, clearReactions]);

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
    if (requireAuth('Abonne-toi', 'Crée un compte pour suivre ce profil.')) return;
    if (!selectedProfile || selectedProfile.id === userId) return;
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

  const handleSendMessage = () => {
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
        deleteMessage(pendingId);
        addMessage({
          id: inserted.id,
          user_name: userName,
          content: cleanContent,
          initial: senderInitial,
        });
        queueMicrotask(() => {
          scrollChatToEnd();
          window.setTimeout(() => scrollChatToEnd(), 50);
          window.setTimeout(() => scrollChatToEnd(), 200);
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
    deleteMessage(messageId);
    arenaOutboundRef.current.broadcastDeleteMessage?.(messageId);
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
      const ok = window.confirm(
        'Mettre fin au beef pour tous les participants ? Cette action est définitive.',
      );
      if (!ok) return;
    }
    setIsLeaving(true);
    if (isHost) {
      await endBeef('Le Ref a mis fin au beef');
    } else {
      await leave();
      router.replace('/feed');
    }
  }, [leave, router, isHost, endBeef, roomId, userId, stopAllMediaTracks]);

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
    onSfxPlayed: (id: string) => {
      playSfx(id);
    },
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
    onMessageReceived: (uname, content, initialLetter, messageId) => {
      addRemoteMessage(uname, content, initialLetter, messageId);
    },
    onMessageDeleted: (messageId) => {
      deleteMessage(messageId);
    },
    onArenaBigGift: (payload) => {
      setLocalArenaBigGift(payload as ArenaBigGiftPayload);
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
      const raw = typeof text === 'string' ? text.trim() : '';
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
        setCurrentSpeaker(debaterId);
        setTimerRunning(true);
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
        setTimerRunning(false);
        setCurrentSpeaker(null);
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
          endReason: String(o.endReason ?? 'Fin du beef'),
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

  const { liveConnected } = arenaRealtime;

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
                challengers={
                  [
                    participantRoles[expectedUids[0]]?.name,
                    participantRoles[expectedUids[1]]?.name,
                    expectedUids[2] ? participantRoles[expectedUids[2]]?.name : null,
                    expectedUids[3] ? participantRoles[expectedUids[3]]?.name : null,
                  ].filter(Boolean) as string[]
                }
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
          <div className="flex w-max min-w-full animate-marquee-continuous whitespace-nowrap">
            <span className="mx-4 text-[10px] font-black uppercase tracking-widest text-white/90">
              {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
            </span>
            <span className="mx-4 text-[10px] font-black uppercase tracking-widest text-white/90">
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
              <h2 id="beef-end-summary-title" className="text-2xl font-bold text-white">Beef terminé</h2>
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
            <span className="font-mono text-[11px] font-medium">{liveViewerCount > 0 ? liveViewerCount : '—'}</span>
          </button>
          {showArenaMenu && (
            <div className="absolute left-4 top-full z-[200] mt-2 flex w-64 flex-col rounded-2xl border border-white/10 bg-slate-950/75 py-2 backdrop-blur-md shadow-2xl" data-cinema-stay onClick={(e) => e.stopPropagation()}>
              {/* En-tête Monétisation */}
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mon Solde</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Flame className="h-4 w-4 text-cyan-400 drop-shadow-md" />
                    <span className="font-black text-white">{userPoints} Lingots</span>
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
          <ArenaChatMessages endRef={chatMessagesEndRef} isMobile={false} scrollRef={chatMessagesScrollRef} />

          <div id="dock-desktop" className="mt-auto flex w-full shrink-0 items-center gap-2 pl-2 pr-3 py-3 bg-slate-900/40 backdrop-blur-sm border-t border-white/10 shadow-lg">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full border border-white/[0.05] bg-black/40 px-4 py-2.5 text-[13px] text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder-white/30 focus:bg-black/60 focus:outline-none" />
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
          <div className="pointer-events-none absolute inset-x-0 top-0 z-[190] flex h-7 items-center overflow-hidden border-b border-white/10 bg-slate-950/55 backdrop-blur-md lg:hidden">
            <div className="flex w-max min-w-full animate-marquee-continuous-fast whitespace-nowrap">
              <span className="mx-4 text-[9px] font-bold uppercase tracking-widest text-white/90">
                {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
              </span>
              <span className="mx-4 text-[9px] font-bold uppercase tracking-widest text-white/90">
                {announcementTicker} • {announcementTicker} • {announcementTicker} • {announcementTicker}
              </span>
            </div>
          </div>
        )}

        {/* INDICATEURS SYSTÈME DISCRETS (Haut Droite) */}
        {!isCinematicMode && (
          <div className="pointer-events-none absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[500] flex items-center gap-2 sm:right-4 sm:top-4">
                <div className="flex items-center rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 shadow-lg backdrop-blur-sm">
              <div className={`mr-2 h-1.5 w-1.5 rounded-full ${liveBadgeHot ? 'animate-pulse bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.8)]' : 'bg-amber-400'}`} />
              <span className="font-mono text-[10px] font-black uppercase tracking-widest text-white/90">Live</span>
            </div>
            <button
              type="button"
              onClick={() => setShowViewerList(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/40 px-3 py-1.5 shadow-lg backdrop-blur-sm transition-all hover:bg-slate-900/60"
            >
              <Eye className="h-3 w-3 text-white" />
              <span className="font-mono text-[10px] font-bold text-white">{liveViewerCount > 0 ? liveViewerCount : '—'}</span>
            </button>
            <button
              type="button"
              onClick={() => openDrawer()}
              className="pointer-events-auto relative flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900/60"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {unreadDMsCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-rose-500 text-[8px] font-black text-white shadow-[0_0_10px_rgba(225,29,72,0.8)]">
                  {unreadDMsCount > 9 ? '9+' : unreadDMsCount}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={onShare}
              className="pointer-events-auto hidden h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900/60 sm:flex"
            >
              <Share2 className="h-3.5 w-3.5" />
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
          localCamEnabled={preJoinCamEnabled}
          />
        )}

        {/* OVERLAY CHAT MOBILE (Intégré à la vidéo, invisible sur PC) */}
        {!isCinematicMode && (
          <div
            data-cinema-stay
            className="absolute inset-x-0 bottom-0 z-[160] lg:hidden flex flex-col justify-end pt-32 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none"
          >
          <ArenaChatMessages endRef={chatMessagesMobileEndRef} isMobile scrollRef={chatMessagesMobileScrollRef} />
          <div id="dock-mobile" className="pointer-events-auto mt-auto flex w-full shrink-0 items-center gap-2 px-3 pb-2">
            <input type="text" value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void handleSendMessage(); }} placeholder="Message..." className="flex-1 min-w-0 rounded-full border border-white/[0.05] bg-black/40 px-4 py-2.5 text-[13px] text-white shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] placeholder-white/30 focus:bg-black/60 focus:outline-none" />
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

      {/* SOUNDBOARD (HOST) — icône Music, pilule horizontale au clic */}
      {isHost && !isCinematicMode && (
        <div
          data-cinema-stay
          data-soundboard-dock
          className="absolute right-2 top-1/2 z-[250] flex -translate-y-1/2 flex-row items-center gap-1.5 sm:right-5"
        >
          <AnimatePresence>
            {soundboardExpanded && (
              <motion.div
                key="arena-sfx-pill"
                initial={{ opacity: 0, x: 16, filter: 'blur(4px)' }}
                animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, x: 12, filter: 'blur(4px)' }}
                transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                className="flex flex-row items-center gap-1.5 overflow-hidden rounded-full border border-white/10 bg-slate-900/40 px-2 py-1.5 shadow-lg backdrop-blur-sm"
              >
                {(
                  [
                    { id: 'horn', emoji: '📢', label: 'Airhorn' },
                    { id: 'laugh', emoji: '😂', label: 'Rires' },
                    { id: 'slap', emoji: '🥊', label: 'Punch' },
                    { id: 'drumroll', emoji: '🥁', label: 'Tension' },
                    { id: 'crickets', emoji: '🦗', label: 'Malaise' },
                    { id: 'bell', emoji: '🔔', label: 'Ding' },
                  ] as const
                ).map((sfx) => (
                  <button
                    key={sfx.id}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      playSfx(sfx.id);
                      arenaOutboundRef.current.broadcastSfx?.(sfx.id);
                      setSoundboardExpanded(false);
                    }}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/5 bg-black/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition-all hover:bg-white/10 active:scale-90"
                    title={sfx.label}
                  >
                    <span className="text-lg drop-shadow-md sm:text-xl">{sfx.emoji}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSoundboardExpanded((v) => !v);
            }}
            aria-label="Effets sonores"
            aria-expanded={soundboardExpanded}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm transition-all hover:bg-slate-900/60 active:scale-95"
          >
            <Music className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </div>
      )}

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
              }
              toast('Participant expulsé', 'success');
            } else {
              toast('Expulsion impossible.', 'error');
            }
          }}
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
                          toast(`Lingots insuffisants — il te manque ${gift.cost - userPoints} Lingots (solde ${userPoints})`, 'error', {
                            action: { label: 'Recharger', onClick: () => goBuyPoints() },
                          });
                          return;
                        }
                        try {
                          const targetUserId = giftTarget || giftRecipients[0]?.id || '';
                          if (!targetUserId) {
                            toast('Participant non connecté', 'error');
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
                          setUserPoints(data.newBalance);
                          const medBoost = Math.min(25, 4 + Math.floor(gift.cost / 40));
                          setAuraMed((v) => Math.min(300, v + medBoost));
                          if (gift.cost >= 50) {
                            setGiftPrestigeFlash((k) => k + 1);
                          }
                          const giftKey =
                            data.giftId != null ? String(data.giftId) : `gift_${Date.now()}`;
                          const msgContent = `a offert ${gift.emoji} ${gift.label} (${gift.cost} Lingots) à ${targetName}`;
                          const initial = userName?.[0]?.toUpperCase() || '?';
                          addRemoteMessage(userName, msgContent, initial, giftKey);
                          arenaOutboundRef.current.broadcastMessage?.({
                            user_name: userName,
                            content: msgContent,
                            initial,
                            id: giftKey,
                          });
                          if (gift.cost >= 500) {
                            const bigPayload: ArenaBigGiftPayload = {
                              cost: gift.cost,
                              label: gift.label,
                              emoji: gift.emoji,
                              giftTypeId: gift.id,
                              senderName: userName,
                            };
                            setLocalArenaBigGift(bigPayload);
                            arenaOutboundRef.current.broadcastArenaBigGift?.(bigPayload);
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[125] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 shadow-2xl"
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

              <div className="relative h-28 bg-gradient-to-r from-cyan-500/20 via-white/10 to-cyan-600/20">
                <div className="absolute inset-0 bg-white/5" />
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
                  {userId && selectedProfile.id === userId && (
                    <div className="flex items-center justify-center gap-2">
                      <Flame className="h-5 w-5 shrink-0 text-cyan-400" />
                      <span className="text-2xl font-black text-white">{selectedProfile.stats.points}</span>
                      <span className="text-sm text-gray-400">Lingots</span>
                    </div>
                  )}
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
                            : 'bg-white text-black font-black uppercase tracking-widest hover:bg-gray-200'
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
                          openDrawer(selectedProfile.id);
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
            className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mediation-invite-title"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-black/30 p-6 text-center shadow-[0_0_80px_rgba(0,240,255,0.12)] backdrop-blur-md"
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
                Le Ref souhaite t&apos;entendre. Installe-toi à la table des échanges en préparant ta caméra et
                ton micro.
              </p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full rounded-full bg-white py-3.5 font-mono text-sm font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform hover:bg-gray-200 active:scale-95"
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
                      <Flame className="h-5 w-5 text-cyan-400 drop-shadow-md" />
                      <span className="text-xl font-black text-white">{userPoints} <span className="text-sm font-bold text-gray-400">Lingots</span></span>
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
          <motion.div
            key="arena-vip-hook"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => {
              if (!authHook?.mandatory) setAuthHook(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, y: 30, rotateX: 15 }}
              animate={{ scale: 1, y: 0, rotateX: 0 }}
              exit={{ scale: 0.9, y: 30, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-black/30 p-8 text-center shadow-[0_0_100px_rgba(0,240,255,0.15)] ring-1 ring-white/20 backdrop-blur-md"
            >
              <h2 className="mb-3 font-sans text-2xl font-black uppercase italic tracking-tighter text-white drop-shadow-md">
                {authHook.title}
              </h2>

              <p className="mb-8 text-sm font-medium leading-relaxed text-gray-400">{authHook.subtitle}</p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => router.push(`/signup?next=${encodeURIComponent(window.location.pathname)}`)}
                  className="w-full rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:scale-[1.02] hover:bg-gray-200"
                >
                  Créer mon profil
                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10"
                >
                  Déjà inscrit ?
                </button>
              </div>

              {!authHook.mandatory && (
                <button
                  type="button"
                  onClick={() => setAuthHook(null)}
                  className="mt-6 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60"
                >
                  Rester en mode spectateur
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes marquee-continuous {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .animate-marquee-continuous {
          animation: marquee-continuous 20s linear infinite;
        }
        .animate-marquee-continuous-fast {
          animation: marquee-continuous 8s linear infinite;
        }
      `}</style>
      <MeetingAudioOutlet peers={physicalPeers} localSessionId={localParticipant?.sessionId ?? null} />

      {typeof document !== 'undefined' &&
        createPortal(
          <FullscreenGiftAnimation roomId={roomId} localBigGift={localArenaBigGift} />,
          document.body
        )}
    </div>
  );
}

// --- COMPOSANTS VOLATILS ZUSTAND ---

export function ArenaChatMessages({
  isMobile,
  scrollRef,
  endRef,
}: {
  isMobile?: boolean;
  scrollRef: React.RefObject<HTMLDivElement>;
  endRef: React.RefObject<HTMLDivElement>;
}) {
  const messages = useArenaVolatileStore((s) => s.messages);

  useLayoutEffect(() => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
        endRef.current?.scrollIntoView({ block: 'end', behavior: 'auto' });
      });
    });
  }, [messages, scrollRef, endRef]);

  return (
    <div
      ref={scrollRef}
      className={
        isMobile
          ? 'pointer-events-none w-fit max-w-[85%] min-w-[50%] max-h-[30vh] overflow-y-auto overscroll-contain touch-pan-y px-3 mb-2 flex flex-col hide-scrollbar'
          : 'flex-1 overflow-y-auto pl-2 pr-4 py-2 hide-scrollbar'
      }
    >
      <div className="mt-auto flex flex-col justify-end">
        {messages.map((msg) =>
          isMobile ? (
            <div key={msg.id} className="mb-2 pointer-events-auto w-fit max-w-[70%] leading-tight">
              <span
                className={`text-[11px] font-bold mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${getUsernameColor(msg.user_name)}`}
              >
                {msg.user_name}
              </span>
              <span className="text-[13px] text-white font-medium break-all drop-shadow-md [text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]">
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={msg.id} className="mb-3">
              <span
                className={`block mb-1 ml-2 text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}
              >
                {msg.user_name}
              </span>
              <div className="inline-block rounded-2xl rounded-tl-sm border border-white/10 bg-white/10 px-3 py-2 text-[13px] leading-snug text-white/90 shadow-md">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="h-px w-full" />
      </div>
    </div>
  );
}

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
