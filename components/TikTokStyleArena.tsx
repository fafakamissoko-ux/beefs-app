'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Gift, Share2, Heart, X, MoreVertical, Lock } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PreJoinScreen } from './PreJoinScreen';
import { ParticipantVideo } from './ParticipantVideo';
import { FeatureGuide } from './FeatureGuide';
import { ViewerListModal } from './ViewerListModal';
import { useDailyCall } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { MultiParticipantGrid } from './MultiParticipantGrid';
import { InviteParticipantModal } from './InviteParticipantModal';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';
import { DEFAULT_FREE_PREVIEW_MINUTES, viewerNeedsContinuationPay } from '@/lib/beef-preview';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';
import {
  buildParticipantAliasSet,
  isValidArenaUserId,
  matchRemoteToExpectedBeefParticipant,
  remoteMatchesMediator,
  type BeefParticipantRowMeta,
} from '@/lib/participant-identity';

const MAX_BEEF_DURATION = 60 * 60; // 60 minutes in seconds

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
  const [followingHost, setFollowingHost] = useState(false);
  const [profileFollowsTarget, setProfileFollowsTarget] = useState(false);

  // Speaking turn state
  const [speakingTurnActive, setSpeakingTurnActive] = useState(false);
  const [speakingTurnTarget, setSpeakingTurnTarget] = useState<string | null>(null);
  const [speakingTurnRemaining, setSpeakingTurnRemaining] = useState(0);
  const [speakingTurnDuration, setSpeakingTurnDuration] = useState(60);
  const speakingTurnIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { join, leave, toggleMic, toggleCam, isJoined, isJoining, micEnabled, camEnabled,
    localParticipant, remoteParticipants, error: callError } = useDailyCall(dailyRoomUrl ?? null, userName, isViewer, userId, roomId);

  // Auto-join when user clicked "Rejoindre" AND dailyRoomUrl becomes available
  useEffect(() => {
    if (hasJoined && dailyRoomUrl && !isJoined && !isJoining) {
      void join(preJoinMediaStream);
    }
  }, [hasJoined, dailyRoomUrl, isJoined, isJoining, join, preJoinMediaStream]);
  const [flyingReactions, setFlyingReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const [showMenu, setShowMenu] = useState(false);
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
  
  // Moderator controls — check if current user is the beef creator
  const isHost = userId === host.id;
  const [showModeratorPanel, setShowModeratorPanel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // Participant roles from DB — maps Daily.co userNames to beef roles
  const [participantRoles, setParticipantRoles] = useState<Record<string, BeefParticipantRowMeta>>({});
  const [liveViewerCount, setLiveViewerCount] = useState(viewerCount);

  // Beef duration limit (60 min countdown)
  const [beefTimeRemaining, setBeefTimeRemaining] = useState(MAX_BEEF_DURATION);
  const beefWarning5Shown = useRef(false);
  const beefWarning1Shown = useRef(false);

  // Timer state — controlled by mediator
  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Stable ref to endBeef so the timer can call it without circular deps
  const endBeefRef = useRef<(reason: string) => Promise<void>>();

  // Timer countdown — only runs when timerActive && !timerPaused
  useEffect(() => {
    if (!timerActive || timerPaused) {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      return;
    }

    timerIntervalRef.current = setInterval(() => {
      setBeefTimeRemaining((prev) => {
        const next = prev - 1;
        if (next <= 5 * 60 && next > 60 && !beefWarning5Shown.current) {
          beefWarning5Shown.current = true;
          toast('5 minutes restantes', 'info');
        }
        if (next <= 60 && next > 0 && !beefWarning1Shown.current) {
          beefWarning1Shown.current = true;
          toast('1 minute restante !', 'error');
        }
        if (next <= 0) {
          setTimerActive(false);
          endBeefRef.current?.('Temps écoulé (60 min)');
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerActive, timerPaused, toast]);

  // ── VOTE SYSTEM — TikTok-style duel gauge ──
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [votesA, setVotesA] = useState(0);
  const [votesB, setVotesB] = useState(0);
  const [myVote, setMyVote] = useState<'A' | 'B' | null>(null);
  const [voteAnimation, setVoteAnimation] = useState<'A' | 'B' | null>(null);

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

  const totalVotes = votesA + votesB;

  // Auto-pause timer when mediator's mic is active (they're speaking)
  useEffect(() => {
    if (!timerActive) return;
    if (!micEnabled && isHost) {
      // Mediator mic is off, timer runs
    } else if (micEnabled && isHost) {
      // Mediator is speaking, pause timer
      setTimerPaused(true);
    }
  }, [micEnabled, isHost, timerActive]);

  // Auto-pause when both challengers have no audio
  useEffect(() => {
    if (!timerActive) return;
    const hasAnyRemoteAudio = remoteParticipants.some(p => p.audioTrack);
    if (!hasAnyRemoteAudio && remoteParticipants.length > 0) {
      setTimerPaused(true);
    } else if (!micEnabled || !isHost) {
      setTimerPaused(false);
    }
  }, [remoteParticipants, timerActive, micEnabled, isHost]);

  const startBeefTimer = async () => {
    setBeefTimeRemaining(MAX_BEEF_DURATION);
    beefWarning5Shown.current = false;
    beefWarning1Shown.current = false;
    setTimerActive(true);
    setTimerPaused(false);
    toast('Chronomètre démarré !', 'success');
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
  };

  const pauseBeefTimer = () => {
    setTimerPaused(true);
    toast('Chronomètre en pause', 'info');
  };

  const resumeBeefTimer = () => {
    setTimerPaused(false);
    toast('Chronomètre repris', 'info');
  };

  const stopBeefTimer = async () => {
    setTimerActive(false);
    setTimerPaused(false);
    toast('Chronomètre arrêté', 'info');
  };

  // Use refs for stats so endBeef captures the latest values without stale closures
  const statsRef = useRef({ beefTimeRemaining: MAX_BEEF_DURATION, liveViewerCount: 0, votesA: 0, votesB: 0, messagesCount: 0 });

  const endBeef = useCallback(async (reason: string = 'Terminé par le médiateur') => {
    if (beefEndedRef.current) return;
    beefEndedRef.current = true;

    const resolutionMap: Record<string, 'resolved' | 'unresolved' | 'abandoned'> = {
      'Terminé par le médiateur': 'resolved',
      'Le médiateur a mis fin au beef': 'resolved',
      'Temps écoulé': 'resolved',
      'Temps écoulé (60 min)': 'resolved',
      'Tous les challengers ont quitté': 'unresolved',
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

    // Calculate duration from ref
    const s = statsRef.current;
    const elapsed = MAX_BEEF_DURATION - s.beefTimeRemaining;
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
      // Mediator left AFTER having been connected — start 90s grace period
      if (!mediatorGraceRef.current && !mediatorGraceActive) {
        setMediatorGraceActive(true);
        setMediatorGraceSeconds(90);

        const countdown = setInterval(() => {
          setMediatorGraceSeconds(prev => {
            if (prev <= 1) {
              clearInterval(countdown);
              mediatorGraceRef.current = null;
              endBeefRef.current?.('Le médiateur a quitté');
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

  // Listen for beef_ended broadcast from mediator (for viewers/challengers)
  const beefEndedHandlerRef = useRef(false);
  useEffect(() => {
    if (!channelRef.current || beefEndedHandlerRef.current) return;
    beefEndedHandlerRef.current = true;

    const handler = ({ payload }: any) => {
      if (!beefEndedRef.current) {
        beefEndedRef.current = true;

        // Use summary from broadcast if available, otherwise use local stats
        if (payload?.summary) {
          setEndSummary(payload.summary);
        } else {
          const s = statsRef.current;
          const elapsed = MAX_BEEF_DURATION - s.beefTimeRemaining;
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
        setBeefEnded(true);
        leave();
        endSummaryTimerRef.current = setTimeout(() => router.replace('/feed'), 12000);
      }
    };

    channelRef.current.on('broadcast', { event: 'beef_ended' }, handler);

    return () => {
      if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
      if (mediatorGraceRef.current) clearInterval(mediatorGraceRef.current);
    };
  }, [leave, router]);

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

  useEffect(() => {
    if (!userId || userId === host.id) {
      setFollowingHost(false);
      return;
    }
    supabase
      .from('followers')
      .select('id')
      .eq('follower_id', userId)
      .eq('following_id', host.id)
      .maybeSingle()
      .then(({ data }) => setFollowingHost(!!data));
  }, [userId, host.id]);

  const toggleFollowHost = async () => {
    if (!userId || userId === host.id) return;
    try {
      if (followingHost) {
        await supabase.from('followers').delete().eq('follower_id', userId).eq('following_id', host.id);
        setFollowingHost(false);
        toast('Tu ne suis plus ce médiateur', 'info');
      } else {
        await supabase.from('followers').insert({ follower_id: userId, following_id: host.id });
        setFollowingHost(true);
        toast('Tu suis ce médiateur', 'success');
      }
    } catch {
      toast('Action impossible pour le moment', 'error');
    }
  };

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
            onClick: () => openBuyPointsPage(router),
          },
        });
      } else {
        toast(msg, 'error');
      }
    } finally {
      setContinuationLoading(false);
    }
  };

  // Track viewer count — increment on join, decrement on leave
  useEffect(() => {
    if (!isJoined) return;

    // Increment viewer count
    supabase.rpc('increment_viewer_count', { beef_id: roomId }).then(() => {});
    setLiveViewerCount(prev => prev + 1);

    return () => {
      supabase.rpc('decrement_viewer_count', { beef_id: roomId }).then(() => {});
    };
  }, [isJoined, roomId]);

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

  const mediatorParticipant = isHost ? localParticipant : hostRemoteParticipant;
  const mediatorIsLocal = isHost;
  const mediatorName = isHost ? userName : host.name;

  // Multi-participant system
  const [ringParticipants, setRingParticipants] = useState<RingParticipant[]>([]);
  const [participationRequests, setParticipationRequests] = useState<ParticipationRequest[]>([]);
  const [debaters, setDebaters] = useState<Debater[]>([]);
  const [currentSpeaker, setCurrentSpeaker] = useState<string | null>(null);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timeLimit, setTimeLimit] = useState(60); // seconds
  const [timeRemaining, setTimeRemaining] = useState(60);
  const [inviteInput, setInviteInput] = useState('');
  const [showDebateTitle, setShowDebateTitle] = useState(true);
  
  // User profiles
  const [showProfile, setShowProfile] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<UserProfile | null>(null);
  
  const profileCache = useRef<Record<string, UserProfile>>({});

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

  const addRemoteReaction = useCallback((emoji: string) => {
    const id = `r_${Date.now()}_${Math.random()}`;
    const x = Math.random() * 55 + 10;
    setFlyingReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFlyingReactions(prev => prev.filter(r => r.id !== id)), 3000);
  }, []);

  // 1) Broadcast channel — instant P2P delivery
  useEffect(() => {
    const channel = supabase.channel(`live_${roomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      .on('broadcast', { event: 'reaction' }, ({ payload }: any) => {
        addRemoteReaction(payload.emoji);
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
      channelRef.current = null;
      setLiveConnected(false);
      supabase.removeChannel(channel);
    };
  }, [roomId, addRemoteMessage, addRemoteReaction]);

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

    const id = Date.now().toString();
    const x = Math.random() * 55 + 10;
    setFlyingReactions(prev => [...prev, { id, emoji, x }]);
    setTimeout(() => setFlyingReactions(prev => prev.filter(r => r.id !== id)), 3500);

    if (channelRef.current) {
      channelRef.current.send({ type: 'broadcast', event: 'reaction', payload: { emoji } })
        .catch(() => console.warn('[Live] Reaction broadcast failed'));
    }
    supabase.from('beef_reactions').insert({ beef_id: roomId, user_id: userId, emoji }).then(() => {});
  };

  // Timer effect
  useEffect(() => {
    if (timerRunning && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            setTimerRunning(false);
            // Auto-mute speaker when time is up
            if (currentSpeaker) {
              setDebaters(debaters.map(d => 
                d.id === currentSpeaker ? { ...d, isMuted: true } : d
              ));
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timerRunning, timeRemaining, currentSpeaker, debaters]);

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

  const startTimer = (debaterId: string) => {
    setCurrentSpeaker(debaterId);
    setTimeRemaining(speakingTurnDuration);
    setTimerRunning(true);
    setSpeakingTurnActive(true);
    setSpeakingTurnTarget(debaterId);
    setSpeakingTurnRemaining(speakingTurnDuration);

    // Deduct from beef time
    setDebaters(debaters.map(d => 
      d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true }
    ));

    // Broadcast speaking turn
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'speaking_turn',
        payload: { debaterId, duration: speakingTurnDuration, action: 'start' },
      }).catch(() => {});
    }
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setCurrentSpeaker(null);
    setSpeakingTurnActive(false);
    setSpeakingTurnTarget(null);
    if (speakingTurnIntervalRef.current) {
      clearInterval(speakingTurnIntervalRef.current);
      speakingTurnIntervalRef.current = null;
    }

    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'speaking_turn',
        payload: { action: 'stop' },
      }).catch(() => {});
    }
  };

  // Speaking turn countdown (separate from beef timer)
  useEffect(() => {
    if (!speakingTurnActive || !speakingTurnTarget) return;

    speakingTurnIntervalRef.current = setInterval(() => {
      setSpeakingTurnRemaining(prev => {
        if (prev <= 1) {
          stopTimer();
          toast('Temps de parole écoulé !', 'info');
          return 0;
        }
        return prev - 1;
      });

      // Also deduct from beef time
      setBeefTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      if (speakingTurnIntervalRef.current) clearInterval(speakingTurnIntervalRef.current);
    };
  }, [speakingTurnActive, speakingTurnTarget, toast]);

  // Listen for speaking turn broadcasts (for non-hosts)
  useEffect(() => {
    if (!channelRef.current || isHost) return;
    const handler = ({ payload }: any) => {
      if (payload?.action === 'start') {
        setSpeakingTurnActive(true);
        setSpeakingTurnTarget(payload.debaterId);
        setSpeakingTurnRemaining(payload.duration);
      } else if (payload?.action === 'stop') {
        setSpeakingTurnActive(false);
        setSpeakingTurnTarget(null);
      }
    };
    channelRef.current.on('broadcast', { event: 'speaking_turn' }, handler);
  }, [isHost]);

  const toggleMute = (debaterId: string) => {
    setDebaters(debaters.map(d => 
      d.id === debaterId ? { ...d, isMuted: !d.isMuted } : d
    ));
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
      if (selectedProfile.id === host.id) setFollowingHost(!profileFollowsTarget);
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
    <div className="relative w-full h-full bg-black overflow-hidden">
      {/* Instant black overlay when leaving — hides camera before tracks stop */}
      {isLeaving && !beefEnded && (
        <div className="absolute inset-0 bg-black z-[999] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Déconnexion...</span>
          </div>
        </div>
      )}

      {isViewer && previewPaywall && liveContinuationPrice > 0 && (
        <div
          className="absolute inset-0 z-[2500] flex items-center justify-center bg-black/95 backdrop-blur-xl p-6"
          role="dialog"
          aria-modal="true"
          aria-labelledby="paywall-preview-title"
        >
          <div className="max-w-md w-full text-center space-y-5">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-500/20 flex items-center justify-center">
              <Lock className="w-8 h-8 text-brand-400" aria-hidden />
            </div>
            <h2 id="paywall-preview-title" className="text-xl font-black text-white">Fin de la prévisualisation gratuite</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              Les {freePreviewMinutes} premières minutes sont offertes. Pour la suite du direct, utilise tes points.
            </p>
            <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-white/[0.02] p-5 text-left space-y-3">
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
                    onClick={() => openBuyPointsPage(router)}
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
              <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-brand-500 to-orange-500 flex items-center justify-center" aria-hidden>
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
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
                <div className="text-2xl font-bold text-purple-400">{endSummary.votesA + endSummary.votesB}</div>
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
          <div className="text-sm font-semibold">
            Médiateur déconnecté — {mediatorGraceSeconds}s avant la fin
          </div>
        </motion.div>
      )}
      {/* ── SPEAKING TURN INDICATOR ── */}
      {speakingTurnActive && speakingTurnTarget && !beefEnded && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-52 sm:bottom-60 left-1/2 -translate-x-1/2 z-[80] flex items-center gap-2 px-4 py-2 rounded-full shadow-lg"
          style={{ background: 'rgba(34,197,94,0.9)', backdropFilter: 'blur(8px)' }}
        >
          <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
          <span className="text-white text-xs font-bold">
            🎤 {debaters.find(d => d.id === speakingTurnTarget)?.name || 'Challenger'} — {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
          </span>
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

      {/* Video Background — real participant panels (callObject) OR placeholder avatars */}
      <div className="absolute inset-0 bottom-48 sm:bottom-56">
        {dailyRoomUrl ? (
          <>
            {/* 3-Panel layout: real video for each participant */}
            <div className="absolute inset-0 flex">

              {/* LEFT — Participant A (first challenger, or local user if challenger) */}
              <div className="flex-1 relative bg-gradient-to-br from-blue-900/30 to-indigo-900/20 overflow-hidden">
                {leftPanel?.videoTrack ? (
                  <ParticipantVideo
                    videoTrack={leftPanel.videoTrack}
                    audioTrack={leftPanelIsLocal ? undefined : leftPanel.audioTrack}
                    muted={leftPanelIsLocal}
                    mirror={leftPanelIsLocal}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center gap-3 pt-16 sm:pt-20">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-blue-500/30 border-2 border-blue-400/40 flex items-center justify-center text-4xl sm:text-5xl font-black text-white">
                      {leftPanel ? leftPanelName[0].toUpperCase() : 'A'}
                    </div>
                    {!leftPanel && (
                      <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-white/70 text-[11px] font-medium">En attente...</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Vote tap overlay — viewers tap to vote for this challenger */}
                {!isHost && !leftPanelIsLocal && (
                  <button
                    type="button"
                    onClick={() => castVote('A')}
                    className="absolute inset-0 z-[5] touch-manipulation"
                    aria-label={`Voter pour ${leftPanelName}`}
                  />
                )}
                {/* Vote guide — first time only */}
                {!isHost && !leftPanelIsLocal && (
                  <div className="absolute top-14 left-1/2 -translate-x-1/2 z-[8] pointer-events-auto">
                    <FeatureGuide
                      id="arena-vote"
                      title="Voter pour un challenger"
                      description="Tape sur l'écran d'un challenger pour voter ! Tu peux changer d'avis à tout moment."
                      position="bottom"
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
                {/* Name tag — profil challenger (sans déclencher le vote) */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openProfile(leftPanelName, leftPanel?.arenaUserId ?? null);
                  }}
                  className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 z-20 pointer-events-auto hover:bg-black/80 transition-colors"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  <span className="text-white text-[10px] font-bold drop-shadow-md underline-offset-2 hover:underline">
                    {leftPanelName}
                  </span>
                </button>
                {/* Vote bubble — bottom-right (opposite to pseudo) */}
                <motion.div
                  className="absolute bottom-1 right-1 z-10"
                  animate={voteAnimation === 'A' ? { scale: [1, 1.4, 1] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <div className={`min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1 ${
                    myVote === 'A'
                      ? 'bg-blue-500 ring-1 ring-white/40'
                      : 'bg-blue-500/60 backdrop-blur-sm'
                  }`}>
                    <span className="text-white text-[9px] font-black">{votesA}</span>
                  </div>
                </motion.div>
                {/* Mic/Cam controls when this panel shows local video (challengers only) */}
                {leftPanelIsLocal && !isViewer && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                    <button
                      type="button"
                      onClick={toggleMic}
                      aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${micEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                    >
                      {micEnabled ? '🎤' : '🔇'}
                    </button>
                    <button
                      type="button"
                      onClick={toggleCam}
                      aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${camEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                    >
                      {camEnabled ? '📹' : '🚫'}
                    </button>
                  </div>
                )}
                {currentSpeaker === '1' && (
                  <div className="absolute bottom-7 left-2 flex gap-0.5 z-10">
                    {[...Array(4)].map((_, i) => (
                      <motion.div key={i} animate={{ height: [3, 10, 3] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
                        className="w-1 bg-green-400 rounded-full" style={{ minHeight: 3 }} />
                    ))}
                  </div>
                )}
              </div>

              {/* CENTER — Mediator bubble — slightly below center */}
              <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 pointer-events-auto">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-1.5">
                  {/* Circle with mediator VIDEO */}
                  <div className="relative">
                    <div className="w-28 h-28 sm:w-36 sm:h-36 rounded-full overflow-hidden
                      bg-gradient-to-br from-brand-400 to-brand-600 p-[3px] shadow-2xl shadow-brand-500/60"
                      style={{ filter: 'drop-shadow(0 0 16px rgba(255,107,44,0.4))' }}>
                      <div className="w-full h-full rounded-full overflow-hidden bg-gray-900">
                        {mediatorParticipant?.videoTrack ? (
                          <ParticipantVideo
                            videoTrack={mediatorParticipant.videoTrack}
                            audioTrack={mediatorIsLocal ? undefined : mediatorParticipant.audioTrack}
                            muted={mediatorIsLocal}
                            mirror={mediatorIsLocal}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-white font-black text-3xl sm:text-4xl">
                              {mediatorName?.[0]?.toUpperCase() || 'M'}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    {/* LIVE badge */}
                    <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-red-500 rounded-full px-2.5 py-0.5 shadow-lg">
                      <span className="text-white text-[10px] font-black tracking-widest">LIVE</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void openProfile(mediatorName, host.id)}
                    className="brand-gradient px-3 py-1 rounded-full shadow-lg shadow-brand-500/40 hover:opacity-95 transition-opacity"
                  >
                    <span className="text-white text-[11px] font-black">⚖️ {mediatorName}</span>
                  </button>
                  {/* Mic/Cam + Controls — only for host (mediator) */}
                  {isHost && (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={toggleMic}
                        aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all shadow ${micEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                      >
                        {micEnabled ? '🎤' : '🔇'}
                      </button>
                      <button
                        type="button"
                        onClick={toggleCam}
                        aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all shadow ${camEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                      >
                        {camEnabled ? '📹' : '🚫'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowModeratorPanel(true)}
                        className="w-8 h-8 rounded-full bg-black/70 backdrop-blur-sm border border-white/20
                          flex items-center justify-center hover:bg-white/10 transition-all text-white shadow"
                        title="Contrôles du médiateur"
                        aria-label="Ouvrir les contrôles du médiateur"
                      >
                        <span className="text-sm" aria-hidden>🔧</span>
                      </button>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* RIGHT — Participant B (second challenger) */}
              <div className="flex-1 relative bg-gradient-to-br from-red-900/30 to-brand-900/20 overflow-hidden">
                {rightPanel?.videoTrack ? (
                  <ParticipantVideo
                    videoTrack={rightPanel.videoTrack}
                    audioTrack={rightPanel.audioTrack}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center gap-3 pt-16 sm:pt-20">
                    <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-red-500/30 border-2 border-red-400/40 flex items-center justify-center text-4xl sm:text-5xl font-black text-white">
                      {rightPanel ? rightPanelName[0].toUpperCase() : 'B'}
                    </div>
                    {!rightPanel && (
                      <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-white/70 text-[11px] font-medium">En attente...</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Vote tap overlay — viewers tap to vote for this challenger */}
                {!isHost && (
                  <button
                    type="button"
                    onClick={() => castVote('B')}
                    className="absolute inset-0 z-[5] touch-manipulation"
                    aria-label={`Voter pour ${rightPanelName}`}
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
                {/* Vote bubble — bottom-left (opposite to pseudo) */}
                <motion.div
                  className="absolute bottom-1 left-1 z-10"
                  animate={voteAnimation === 'B' ? { scale: [1, 1.4, 1] } : {}}
                  transition={{ duration: 0.4 }}
                >
                  <div className={`min-w-[22px] h-[22px] rounded-full flex items-center justify-center px-1 ${
                    myVote === 'B'
                      ? 'bg-red-500 ring-1 ring-white/40'
                      : 'bg-red-500/60 backdrop-blur-sm'
                  }`}>
                    <span className="text-white text-[9px] font-black">{votesB}</span>
                  </div>
                </motion.div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void openProfile(rightPanelName, rightPanel?.arenaUserId ?? null);
                  }}
                  className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full flex items-center gap-1 z-20 pointer-events-auto hover:bg-black/80 transition-colors"
                >
                  <span className="text-white text-[10px] font-bold drop-shadow-md underline-offset-2 hover:underline">
                    {rightPanelName}
                  </span>
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                </button>
                {currentSpeaker === '2' && (
                  <div className="absolute bottom-7 right-2 flex gap-0.5 z-10">
                    {[...Array(4)].map((_, i) => (
                      <motion.div key={i} animate={{ height: [3, 10, 3] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
                        className="w-1 bg-green-400 rounded-full" style={{ minHeight: 3 }} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Joining indicator */}
            {isJoining && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-30">
                <div className="bg-black/90 rounded-2xl px-6 py-4 flex items-center gap-3">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  <span className="text-white font-semibold">Connexion en cours...</span>
                </div>
              </div>
            )}
            {callError && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-900/90 border border-red-500 rounded-xl px-4 py-2 z-30">
                <span className="text-red-300 text-sm">⚠️ {callError}</span>
              </div>
            )}
          </>
        ) : (
        /* Placeholder avatars (fallback) */
        <div className="w-full h-full flex">
          {/* Challenger 1 Side */}
          {debaters[0] ? (
            <div className="flex-1 relative bg-gradient-to-br from-blue-900/20 to-purple-900/20">
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="text-center"
                >
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    animate={currentSpeaker === '1' ? { 
                      boxShadow: [
                        '0 0 20px rgba(59, 130, 246, 0.5)',
                        '0 0 40px rgba(59, 130, 246, 0.8)',
                        '0 0 20px rgba(59, 130, 246, 0.5)',
                      ]
                    } : {}}
                    transition={{ duration: 1.5, repeat: currentSpeaker === '1' ? Infinity : 0 }}
                    className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-blue-500/40 to-purple-500/40 backdrop-blur-md flex items-center justify-center text-4xl sm:text-6xl mb-2 sm:mb-3 shadow-xl ${
                      currentSpeaker === '1' ? 'border-4 border-green-400' : 'border-2 border-blue-400/30'
                    }`}
                  >
                    👤
                  </motion.div>
                  <button
                    type="button"
                    onClick={() => void openProfile(debaters[0].name, debaters[0].id)}
                    className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-xl px-3 sm:px-5 py-1.5 rounded-full border border-white/10 shadow-lg hover:border-brand-400/40 transition-colors"
                  >
                    <p className="text-white font-black text-sm sm:text-base drop-shadow-lg underline-offset-2 hover:underline">{debaters[0].name}</p>
                  </button>
                </motion.div>
              </div>
              
              {/* Timer for Challenger 1 */}
              <AnimatePresence>
                {currentSpeaker === '1' && timerRunning && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute top-16 right-4 bg-black/95 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl z-20"
                    style={{
                      borderWidth: '3px',
                      borderStyle: 'solid',
                      borderColor: timeRemaining <= 10 ? '#ef4444' : timeRemaining <= 30 ? '#fb923c' : '#4ade80'
                    }}
                  >
                    <div className={`text-4xl font-black tabular-nums ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : timeRemaining <= 30 ? 'text-brand-400' : 'text-green-400'}`}>
                      {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex-1 relative bg-gradient-to-br from-gray-900/20 to-gray-800/20">
              <div className="absolute inset-0 flex flex-col items-center gap-2 pt-16 sm:pt-20">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="text-center text-white/50"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl sm:text-3xl mb-2 border border-white/20"
                  >
                    👥
                  </motion.div>
                  <p className="text-[11px] sm:text-xs font-medium">En attente...</p>
                </motion.div>
              </div>
            </div>
          )}

          {/* Moderator in Center (Host) — slightly below center */}
          <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 z-20">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 200, damping: 15, delay: 0.3 }}
              className="relative flex flex-col items-center"
            >
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-400 via-brand-400 to-pink-500 p-1 shadow-2xl">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-3xl sm:text-4xl">
                  👤
                </div>
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => void openProfile(mediatorName, host.id)}
                  className="brand-gradient px-3 py-1 rounded-full shadow-lg shadow-brand-500/40 whitespace-nowrap hover:opacity-95 transition-opacity"
                >
                  <span className="text-white text-[11px] font-black">⚖️ {mediatorName}</span>
                </button>
                {isHost && (
                  <button
                    onClick={() => setShowModeratorPanel(!showModeratorPanel)}
                    className="w-8 h-8 rounded-full bg-black/70 backdrop-blur-sm border border-white/20
                      flex items-center justify-center hover:bg-white/10 transition-all text-white shadow"
                    title="Contrôles du médiateur"
                  >
                    <span className="text-sm">🔧</span>
                  </button>
                )}
              </div>
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
                        className="bg-gradient-to-r from-purple-500/95 via-pink-500/95 to-red-500/95 backdrop-blur-xl px-4 py-1.5 rounded-full shadow-2xl border-2 border-white/30"
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

          {/* Challenger 2 Side (or waiting) */}
          {debaters[1] ? (
            <div className="flex-1 relative bg-gradient-to-br from-red-900/20 to-brand-900/20">
              <div className="absolute inset-0 flex items-center justify-center">
                <motion.div 
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20, delay: 0.1 }}
                  className="text-center"
                >
                  <motion.div 
                    whileHover={{ scale: 1.05 }}
                    animate={currentSpeaker === '2' ? { 
                      boxShadow: [
                        '0 0 20px rgba(239, 68, 68, 0.5)',
                        '0 0 40px rgba(239, 68, 68, 0.8)',
                        '0 0 20px rgba(239, 68, 68, 0.5)',
                      ]
                    } : {}}
                    transition={{ duration: 1.5, repeat: currentSpeaker === '2' ? Infinity : 0 }}
                    className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-red-500/40 to-brand-400/40 backdrop-blur-md flex items-center justify-center text-4xl sm:text-6xl mb-2 sm:mb-3 shadow-xl ${
                      currentSpeaker === '2' ? 'border-4 border-green-400' : 'border-2 border-red-400/30'
                    }`}
                  >
                    👤
                  </motion.div>
                  <button
                    type="button"
                    onClick={() => void openProfile(debaters[1].name, debaters[1].id)}
                    className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-xl px-3 sm:px-5 py-1.5 rounded-full border border-white/10 shadow-lg hover:border-brand-400/40 transition-colors"
                  >
                    <p className="text-white font-black text-sm sm:text-base drop-shadow-lg underline-offset-2 hover:underline">{debaters[1].name}</p>
                  </button>
                </motion.div>
              </div>
              
              {/* Timer for Challenger 2 */}
              <AnimatePresence>
                {currentSpeaker === '2' && timerRunning && (
                  <motion.div
                    initial={{ scale: 0, opacity: 0, y: -10 }}
                    animate={{ scale: 1, opacity: 1, y: 0 }}
                    exit={{ scale: 0, opacity: 0, y: -10 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                    className="absolute top-16 left-4 bg-black/95 backdrop-blur-xl px-5 py-3 rounded-2xl shadow-2xl z-20"
                    style={{
                      borderWidth: '3px',
                      borderStyle: 'solid',
                      borderColor: timeRemaining <= 10 ? '#ef4444' : timeRemaining <= 30 ? '#fb923c' : '#4ade80'
                    }}
                  >
                    <div className={`text-4xl font-black tabular-nums ${timeRemaining <= 10 ? 'text-red-500 animate-pulse' : timeRemaining <= 30 ? 'text-brand-400' : 'text-green-400'}`}>
                      {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                    </div>
                    <div className="text-[10px] text-white/60 text-center mt-1 font-medium">Temps restant</div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ) : (
            <div className="flex-1 relative bg-gradient-to-br from-gray-900/20 to-gray-800/20">
              <div className="absolute inset-0 flex flex-col items-center gap-2 pt-16 sm:pt-20">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-center text-white/50"
                >
                  <motion.div 
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-2xl sm:text-3xl mb-2 border border-white/20"
                  >
                    👥
                  </motion.div>
                  <p className="text-[11px] sm:text-xs font-medium">En attente...</p>
                </motion.div>
              </div>
            </div>
          )}
        </div>
        )} {/* end placeholder conditional */}
      </div>

      {/* ── Top Overlay — TikTok-style header ── */}
      <div className="absolute top-0 left-0 right-0 z-30 p-2 sm:p-3">
        {/* Subtle top gradient for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 to-transparent pointer-events-none" />

        <div className="relative flex items-center justify-between">
          {/* Left: médiateur du beef (pas « toi » si tu es challenger — évite Suivre sur soi-même) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void openProfile(host.name, host.id)}
              className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md rounded-full pl-0.5 pr-3 py-0.5 hover:bg-black/55 transition-colors pointer-events-auto"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-brand-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                  <span className="text-white font-bold text-[11px]">{host.name ? host.name[0].toUpperCase() : 'M'}</span>
                </div>
              </div>
              <span className="text-white font-semibold text-xs drop-shadow-lg max-w-[80px] truncate">{host.name}</span>
              {userId === host.id && (
                <span className="text-[9px] font-black text-brand-400 uppercase tracking-wide">Médiateur</span>
              )}
            </button>
            {userId && userId !== host.id && (
              <button
                type="button"
                onClick={() => void toggleFollowHost()}
                className={`px-3 py-1 rounded-full text-white text-xs font-bold transition-colors ${
                  followingHost ? 'bg-white/20 hover:bg-white/30' : 'bg-pink-500 hover:bg-pink-600'
                }`}
              >
                {followingHost ? 'Abonné ✓' : '+ Suivre'}
              </button>
            )}
          </div>

          {/* Center: Timer OR Live badge */}
          <div className="flex items-center gap-1.5">
            {isJoined && timerActive ? (
              <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md border transition-all ${
                timerPaused
                  ? 'bg-yellow-500/30 border-yellow-500/50'
                  : beefTimeRemaining <= 5 * 60
                    ? 'bg-red-500/30 border-red-500/50 animate-pulse'
                    : 'bg-black/40 border-white/10'
              }`}>
                <span className="text-sm">{timerPaused ? '⏸' : '⏱'}</span>
                <span className={`text-sm font-bold tabular-nums ${
                  timerPaused
                    ? 'text-yellow-400'
                    : beefTimeRemaining <= 5 * 60 ? 'text-red-400' : 'text-white'
                }`}>
                  {formatBeefTime(beefTimeRemaining)}
                </span>
                {timerPaused && (
                  <span className="text-yellow-400 text-[10px] font-black animate-pulse ml-0.5">PAUSE</span>
                )}
              </div>
            ) : isJoined && !timerActive && isHost ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full backdrop-blur-md border border-white/10 bg-black/40">
                <span className="text-white/50 text-xs font-medium">Pas de chrono</span>
              </div>
            ) : null}
          </div>

          {/* Right: LIVE badge + viewer count + close */}
          <div className="flex items-center gap-1.5">
            {/* LIVE badge */}
            <div className="flex items-center bg-red-600 rounded-md px-2 py-0.5">
              <div className={`w-1.5 h-1.5 rounded-full mr-1 ${liveConnected ? 'bg-white animate-pulse' : 'bg-yellow-300'}`} />
              <span className="text-white text-[10px] font-black tracking-wider">LIVE</span>
            </div>
            {/* Viewer count — clickable to show viewer list */}
            <button
              onClick={() => setShowViewerList(true)}
              className="flex items-center bg-black/40 backdrop-blur-md rounded-full px-2.5 py-1 gap-1 hover:bg-black/60 transition-colors"
            >
              <svg className="w-3.5 h-3.5 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              <span className="text-white text-[11px] font-bold">{liveViewerCount || 0}</span>
            </button>
            {/* Menu / Close */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
            >
              <MoreVertical className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={handleLeave}
              className="w-10 h-10 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Flying Reactions — centered over video area, float up high ── */}
      <div className="absolute left-1/2 -translate-x-1/2 bottom-56 z-50 pointer-events-none" style={{ width: '60%' }}>
        <AnimatePresence>
          {flyingReactions.map((reaction) => (
            <motion.div
              key={reaction.id}
              initial={{ y: 0, opacity: 0, scale: 0.3 }}
              animate={{
                y: -400,
                opacity: [0, 1, 1, 0.8, 0],
                scale: [0.3, 1.4, 1.1, 0.9, 0.4],
                x: [0, -20, 25, -15, 20],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 3.5,
                ease: 'easeOut',
                opacity: { times: [0, 0.05, 0.4, 0.75, 1] },
                x: { duration: 3.5, ease: 'easeInOut' },
              }}
              className="absolute bottom-0 text-3xl sm:text-4xl drop-shadow-lg"
              style={{ left: `${reaction.x}%` }}
            >
              {reaction.emoji}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── BOTTOM SECTION — TikTok-style comments + input ── */}
      <div className="absolute bottom-0 left-0 right-0 z-40 pointer-events-auto">
        {/* Gradient background — fades from transparent to semi-black */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent pointer-events-none" />

        {/* Comments area — left-aligned, scrollable */}
        <div className="relative px-3 pb-1.5 pr-16" style={{ maxHeight: '40vh' }}>
          <div className="flex flex-col gap-1.5 justify-end overflow-y-auto hide-scrollbar" style={{ maxHeight: '35vh' }}>
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
                  initial={{ opacity: 0, y: 10, x: -10 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex items-start gap-2 max-w-[90%] relative"
                >
                  {/* Avatar circle */}
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-brand-500 flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                    <span className="text-white font-bold text-[10px]">{message.initial}</span>
                  </div>
                  {/* Message bubble */}
                  <div
                    className={`bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-md px-3 py-1.5 min-w-0 ${canDelete ? 'cursor-context-menu touch-manipulation' : ''}`}
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
                    <span className="text-brand-400 text-[11px] font-bold block leading-tight">{message.user_name}</span>
                    <span className="text-white text-[13px] leading-snug break-words">{message.content}</span>
                    {contextMenuMsg === message.id && (
                      <div
                        className="absolute left-0 bottom-full mb-1 z-50 min-w-[8rem] rounded-lg border border-white/15 bg-black/95 py-1 shadow-xl backdrop-blur-md"
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
        </div>

        {/* Emoji reaction picker — togglable overlay */}
        <AnimatePresence>
          {showAllReactions && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="relative mx-3 mb-2 p-2 bg-black/80 backdrop-blur-md rounded-2xl border border-white/10"
            >
              <div className="grid grid-cols-8 gap-1.5">
                {POPULAR_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => { handleReaction(emoji); setShowAllReactions(false); }}
                    aria-label={`Réagir avec ${emoji}`}
                    className="w-10 h-10 flex items-center justify-center text-xl rounded-xl hover:bg-white/10 active:scale-90 transition-all touch-manipulation"
                  >
                    <span aria-hidden>{emoji}</span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom bar — input + action buttons (TikTok-style) */}
        <div className="relative px-2.5 pb-3 pt-1.5 flex items-center gap-1.5">
          {/* Comment input */}
          <div className="flex-1 relative min-w-0">
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
              placeholder="Saisis ton message..."
              aria-label="Message dans le chat du direct"
              autoComplete="off"
              className="w-full bg-white/10 backdrop-blur-sm border border-white/15 rounded-full pl-3.5 pr-12 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-brand-400/50 transition-colors"
            />
            {chatInput.trim() && (
              <button
                type="button"
                onClick={handleSendMessage}
                aria-label="Envoyer le message"
                className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center hover:bg-brand-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24" aria-hidden><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            )}
            <FeatureGuide
              id="arena-chat"
              title="Chat en direct"
              description="Envoie des messages visibles par tous les viewers et participants."
              position="top"
            />
          </div>

          {/* Emoji toggle */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => setShowAllReactions(!showAllReactions)}
            aria-label={showAllReactions ? 'Fermer le panneau de réactions' : 'Ouvrir les réactions emoji'}
            aria-expanded={showAllReactions}
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0 touch-manipulation"
          >
            <span className="text-base" aria-hidden>😀</span>
          </motion.button>

          {/* Like / Heart */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.85 }}
            onClick={() => handleReaction('❤️')}
            aria-label="Envoyer une réaction cœur"
            className="w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0 touch-manipulation"
          >
            <Heart className="w-[18px] h-[18px] text-pink-500 fill-pink-500" aria-hidden />
          </motion.button>

          {/* Gift */}
          <div className="relative flex-shrink-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={() => setShowGiftPicker(!showGiftPicker)}
              aria-label={showGiftPicker ? 'Fermer les cadeaux' : 'Ouvrir les cadeaux'}
              aria-expanded={showGiftPicker}
              className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400/80 to-brand-500/80 flex items-center justify-center touch-manipulation"
            >
              <Gift className="w-[18px] h-[18px] text-white" aria-hidden />
            </motion.button>
            <FeatureGuide
              id="arena-gift"
              title="Envoyer un cadeau"
              description="Soutiens le médiateur avec des points ! Les cadeaux s'affichent en live."
              position="top"
              align="end"
            />
            {/* Gift picker dropdown */}
            <AnimatePresence>
              {showGiftPicker && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.9 }}
                  className="absolute bottom-full mb-2 right-0 bg-black/95 backdrop-blur-xl border border-white/15 rounded-2xl p-3 shadow-2xl z-50"
                  style={{ width: 220 }}
                >
                  <p className="text-white/70 text-[11px] font-semibold mb-2">Envoyer au médiateur</p>
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
                                onClick: () => openBuyPointsPage(router),
                              },
                            });
                            return;
                          }

                          try {
                            const { data: { session } } = await supabase.auth.getSession();
                            const res = await fetch('/api/gifts/send', {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${session?.access_token || ''}`,
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
                            toast(`${gift.emoji} ${gift.label} envoyé !`, 'success');
                          } catch (err: any) {
                            const m = err?.message || 'Erreur lors de l\'envoi';
                            if (typeof m === 'string' && m.toLowerCase().includes('insuffisant')) {
                              toast(m, 'error', {
                                action: { label: 'Recharger', onClick: () => openBuyPointsPage(router) },
                              });
                            } else {
                              toast(m, 'error');
                            }
                          }
                          setShowGiftPicker(false);
                        }}
                        className="flex flex-col items-center gap-1 p-2 rounded-xl bg-white/5 hover:bg-white/15 transition-colors"
                      >
                        <span className="text-2xl">{gift.emoji}</span>
                        <span className="text-white text-[10px] font-bold">{gift.label}</span>
                        <span className="text-brand-400 text-[9px] font-semibold">{gift.cost} pts</span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Share + viewer count */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onShare}
            className="flex items-center gap-0.5 px-2 h-10 rounded-full bg-white/10 backdrop-blur-sm flex-shrink-0 touch-manipulation"
          >
            <Share2 className="w-3.5 h-3.5 text-white" />
            <span className="text-white text-[10px] font-bold">{liveViewerCount || 0}</span>
          </motion.button>
        </div>
      </div>

      {/* Moderator Control Panel with Overlay */}
      <AnimatePresence mode="wait">
        {isHost && showModeratorPanel && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-0 z-40"
          >
            {/* Overlay - Click to close */}
            <div
              onClick={() => setShowModeratorPanel(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            
            {/* Panel */}
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute top-0 right-0 bottom-0 w-72 sm:w-80 bg-black/95 backdrop-blur-xl border-l border-white/20 z-10 overflow-y-auto"
            >
              {/* Header - Fixed with close button */}
              <div className="sticky top-0 bg-gradient-to-r from-yellow-400 to-brand-400 p-3 flex items-center justify-between z-50 shadow-lg">
                <h2 className="text-black font-black text-base sm:text-lg">🎛️ Contrôles</h2>
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowModeratorPanel(false);
                  }} 
                  className="text-black hover:bg-black/20 rounded-full p-1.5 transition-all hover:rotate-90"
                >
                  <X className="w-5 h-5 font-bold" strokeWidth={3} />
                </button>
              </div>

            <div className="p-3 space-y-3">
              {/* Timer Controls — Mediator only */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  ⏱️ Chronomètre du beef
                </h3>
                
                {!timerActive ? (
                  <button
                    onClick={startBeefTimer}
                    className="w-full py-3 rounded-xl text-sm font-bold text-white brand-gradient hover:shadow-glow transition-all"
                  >
                    ▶️ Démarrer le chronomètre
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="text-center py-3 bg-black/40 rounded-xl">
                      <span className={`text-3xl font-black font-mono ${beefTimeRemaining <= 300 ? 'text-red-400' : 'text-white'}`}>
                        {formatBeefTime(beefTimeRemaining)}
                      </span>
                      {timerPaused && (
                        <p className="text-yellow-400 text-xs font-bold mt-1 animate-pulse">EN PAUSE</p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {timerPaused ? (
                        <button onClick={resumeBeefTimer} className="flex-1 py-2 bg-green-500/20 text-green-400 font-bold rounded-xl text-sm hover:bg-green-500/30">
                          ▶️ Reprendre
                        </button>
                      ) : (
                        <button onClick={pauseBeefTimer} className="flex-1 py-2 bg-yellow-500/20 text-yellow-400 font-bold rounded-xl text-sm hover:bg-yellow-500/30">
                          ⏸ Pause
                        </button>
                      )}
                      <button onClick={stopBeefTimer} className="flex-1 py-2 bg-red-500/20 text-red-400 font-bold rounded-xl text-sm hover:bg-red-500/30">
                        ⏹ Arrêter
                      </button>
                    </div>
                    <p className="text-gray-500 text-xs text-center">
                      Auto-pause quand vous parlez ou quand les micros sont coupés
                    </p>
                  </div>
                )}
              </div>

              {/* Speaking Turns Control */}
              <div className="bg-white/5 rounded-xl p-4 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2">
                  🎤 Temps de parole
                </h3>

                {/* Duration selector */}
                <div className="mb-3">
                  <label className="text-gray-400 text-xs mb-1.5 block">Durée par tour</label>
                  <div className="flex gap-1.5">
                    {[30, 60, 90, 120].map(sec => (
                      <button
                        key={sec}
                        onClick={() => setSpeakingTurnDuration(sec)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                          speakingTurnDuration === sec
                            ? 'bg-brand-500 text-white'
                            : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                {/* Active speaking turn indicator */}
                {speakingTurnActive && (
                  <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 mb-3 text-center">
                    <p className="text-green-400 text-xs font-semibold mb-1">En cours</p>
                    <span className="text-2xl font-black text-green-400 font-mono">
                      {Math.floor(speakingTurnRemaining / 60)}:{(speakingTurnRemaining % 60).toString().padStart(2, '0')}
                    </span>
                    <button
                      onClick={stopTimer}
                      className="w-full mt-2 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold hover:bg-red-500/30"
                    >
                      Couper la parole
                    </button>
                  </div>
                )}

                {/* Debaters list */}
                <div className="space-y-2">
                  {debaters.map((debater) => (
                    <div key={debater.id} className="bg-black/40 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => void openProfile(debater.name, debater.id)}
                          className="text-white font-semibold text-sm hover:text-brand-400 cursor-pointer text-left"
                        >
                          {debater.name}
                        </button>
                        <button
                          onClick={() => removeDebater(debater.id)}
                          className="text-red-400 hover:text-red-300 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => currentSpeaker === debater.id ? stopTimer() : startTimer(debater.id)}
                          disabled={timerRunning && currentSpeaker !== debater.id}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            currentSpeaker === debater.id
                              ? 'bg-green-500 text-white animate-pulse'
                              : 'bg-white/10 text-white hover:bg-white/20'
                          } disabled:opacity-30`}
                        >
                          {currentSpeaker === debater.id
                            ? `🎤 ${Math.floor(speakingTurnRemaining / 60)}:${(speakingTurnRemaining % 60).toString().padStart(2, '0')}`
                            : `▶️ ${speakingTurnDuration}s`
                          }
                        </button>
                        <button
                          onClick={() => toggleMute(debater.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold ${
                            debater.isMuted
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-green-500/20 text-green-400'
                          }`}
                        >
                          {debater.isMuted ? '🔇' : '🔊'}
                        </button>
                      </div>
                    </div>
                  ))}
                  {debaters.length === 0 && (
                    <p className="text-gray-500 text-xs text-center py-3">Aucun débatteur pour le moment</p>
                  )}
                </div>
              </div>

              {/* Invite Debater */}
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                  <span>➕</span> Inviter un débatteur
                </h3>
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <div className="flex-1 relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50">@</span>
                      <input
                        type="text"
                        value={inviteInput}
                        onChange={(e) => setInviteInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && inviteDebater()}
                        placeholder="username"
                        className="w-full bg-white/10 border border-white/20 rounded-lg pl-8 pr-3 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:bg-white/15 focus:border-yellow-500/50"
                      />
                    </div>
                    <button
                      onClick={inviteDebater}
                      className="bg-gradient-to-r from-yellow-400 to-brand-400 hover:from-yellow-500 hover:to-brand-500 text-black font-bold px-4 py-2 rounded-lg"
                    >
                      ➕
                    </button>
                  </div>
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="w-full py-2 bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold rounded-lg transition-colors"
                  >
                    🔍 Rechercher un utilisateur
                  </button>
                </div>
              </div>

              {/* Participation Requests */}
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                  <span>✋</span> Demandes ({participationRequests.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {participationRequests.length === 0 ? (
                    <p className="text-white/50 text-sm text-center py-4">Aucune demande</p>
                  ) : (
                    participationRequests.map((request) => (
                      <div key={request.id} className="bg-black/40 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <button
                            onClick={() => openProfile(request.user_name)}
                            className="text-white font-semibold text-sm hover:text-pink-400 cursor-pointer"
                          >
                            {request.user_name}
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => acceptRequest(request)}
                            className="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-1.5 rounded text-xs"
                          >
                            ✓ Accepter
                          </button>
                          <button
                            onClick={() => rejectRequest(request.id)}
                            className="flex-1 bg-red-500 hover:bg-red-600 text-white font-bold py-1.5 rounded text-xs"
                          >
                            ✗ Refuser
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-2">⚡ Actions rapides</h3>
                <div className="space-y-2">
                  <button
                    onClick={() => setDebaters(debaters.map(d => ({ ...d, isMuted: true })))}
                    className="w-full bg-red-500/20 hover:bg-red-500/30 text-red-400 font-bold py-2 rounded text-sm"
                  >
                    🔇 Tout couper
                  </button>
                  <button
                    onClick={() => setDebaters(debaters.map(d => ({ ...d, isMuted: false })))}
                    className="w-full bg-green-500/20 hover:bg-green-500/30 text-green-400 font-bold py-2 rounded text-sm"
                  >
                    🔊 Tout activer
                  </button>
                  <button
                    onClick={() => endBeef('Terminé par le médiateur')}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm mt-2"
                  >
                    🛑 Terminer le beef
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
            className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowProfile(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-b from-gray-900 to-black border border-white/20 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl"
            >
              {/* Header with gradient */}
              <div className="bg-gradient-to-r from-pink-500 via-purple-500 to-blue-500 p-6 relative">
                <button
                  onClick={() => setShowProfile(false)}
                  className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-1"
                >
                  <X className="w-5 h-5" />
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
                    <div className="text-2xl font-black text-pink-400">{selectedProfile.stats.followers}</div>
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

                <div className="flex gap-2">
                  {userId && selectedProfile.id !== userId && (
                    <button
                      type="button"
                      onClick={() => void toggleFollowProfileTarget()}
                      className={`flex-1 font-bold py-2.5 rounded-xl transition-colors ${
                        profileFollowsTarget
                          ? 'bg-white/15 text-white border border-white/25 hover:bg-white/25'
                          : 'bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white'
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
