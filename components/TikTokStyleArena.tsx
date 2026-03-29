'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Gift, Share2, Heart, X, MoreVertical } from 'lucide-react';
import { ChatPanel } from './ChatPanel';
import { PreJoinScreen } from './PreJoinScreen';
import { TensionButton } from './TensionButton';
import { ParticipantVideo } from './ParticipantVideo';
import { useDailyCall } from '@/hooks/useDailyCall';
import { supabase } from '@/lib/supabase/client';
import { MultiParticipantGrid } from './MultiParticipantGrid';
import { InviteParticipantModal } from './InviteParticipantModal';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';

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
  viewerCount?: number;
  tension: number;
  points: number;
  debateTitle?: string;
  dailyRoomUrl?: string | null;
  onReaction: (emoji: string) => void;
  onTap: () => void;
  onGift: () => void;
  onShare: () => void;
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
  viewerCount = 0,
  tension,
  points,
  debateTitle = 'Débat en direct',
  dailyRoomUrl,
  onReaction,
  onTap,
  onGift,
  onShare,
}: TikTokStyleArenaProps) {
  const router = useRouter();
  const { toast } = useToast();
  // Always start with pre-join screen, regardless of dailyRoomUrl availability
  const [hasJoined, setHasJoined] = useState(false);
  const [chatInput, setChatInput] = useState('');

  // Daily.co callObject — gives individual video tracks
  const { join, leave, toggleMic, toggleCam, isJoined, isJoining, micEnabled, camEnabled,
    localParticipant, remoteParticipants, error: callError } = useDailyCall(dailyRoomUrl ?? null, userName);

  // Auto-join when user clicked "Rejoindre" AND dailyRoomUrl becomes available
  useEffect(() => {
    if (hasJoined && dailyRoomUrl && !isJoined && !isJoining) {
      join();
    }
  }, [hasJoined, dailyRoomUrl, isJoined, isJoining, join]);
  const [flyingReactions, setFlyingReactions] = useState<Array<{ id: string; emoji: string; x: number }>>([]);
  const [showMenu, setShowMenu] = useState(false);
  const [visibleMessages, setVisibleMessages] = useState<VisibleMessage[]>([]);
  const [showAllReactions, setShowAllReactions] = useState(false); // NEW: Toggle pour afficher toutes les réactions
  
  // Moderator controls — check if current user is the beef creator
  const isHost = userId === host.id;
  const [showModeratorPanel, setShowModeratorPanel] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  
  // Participant roles from DB — maps Daily.co userNames to beef roles
  const [participantRoles, setParticipantRoles] = useState<Record<string, { role: string; name: string }>>({});
  const [liveViewerCount, setLiveViewerCount] = useState(viewerCount);

  // Beef duration limit (60 min countdown)
  const [beefTimeRemaining, setBeefTimeRemaining] = useState(MAX_BEEF_DURATION);
  const beefWarning5Shown = useRef(false);
  const beefWarning1Shown = useRef(false);

  // Timer state — controlled by mediator
  const [timerActive, setTimerActive] = useState(false);
  const [timerPaused, setTimerPaused] = useState(false);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

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
          toast('Le beef est terminé (60 min max)', 'error');
          leave();
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [timerActive, timerPaused, leave, toast]);

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

  const startBeefTimer = () => {
    setBeefTimeRemaining(MAX_BEEF_DURATION);
    beefWarning5Shown.current = false;
    beefWarning1Shown.current = false;
    setTimerActive(true);
    setTimerPaused(false);
    toast('Chronomètre démarré !', 'success');
  };

  const pauseBeefTimer = () => {
    setTimerPaused(true);
    toast('Chronomètre en pause', 'info');
  };

  const resumeBeefTimer = () => {
    setTimerPaused(false);
    toast('Chronomètre repris', 'info');
  };

  const stopBeefTimer = () => {
    setTimerActive(false);
    setTimerPaused(false);
    toast('Chronomètre arrêté', 'info');
  };

  const formatBeefTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Load beef participants from Supabase to map roles
  useEffect(() => {
    const loadParticipants = async () => {
      const { data } = await supabase
        .from('beef_participants')
        .select('user_id, role, is_main, users!beef_participants_user_id_fkey(username, display_name)')
        .eq('beef_id', roomId);

      if (data) {
        const roles: Record<string, { role: string; name: string }> = {};
        data.forEach((p: any) => {
          const name = p.users?.display_name || p.users?.username || 'Participant';
          roles[p.user_id] = { role: p.role, name };
        });
        setParticipantRoles(roles);
      }
    };
    loadParticipants();
  }, [roomId]);

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
    const roleA = participantRoles[a.sessionId]?.role;
    const roleB = participantRoles[b.sessionId]?.role;
    if (roleA === 'participant' && roleB !== 'participant') return -1;
    if (roleA !== 'participant' && roleB === 'participant') return 1;
    return 0;
  });

  // Video layout: determine which participant goes in each slot based on role
  const hostRemoteParticipant = !isHost
    ? remoteParticipants.find(p => p.userName === host.name) ?? null
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
  
  // Mock profiles database
  const mockProfiles: { [key: string]: UserProfile } = {
    'User123': {
      id: 'u1',
      username: 'User123',
      displayName: 'User 123',
      bio: 'Passionné de débats et de discussions constructives 💬',
      isPrivate: false,
      joinedDate: '2024-01-15',
      stats: { debates: 45, wins: 23, followers: 1200, following: 456 }
    },
    'DebatLover': {
      id: 'u2',
      username: 'DebatLover',
      displayName: 'Debate Lover',
      bio: 'Toujours prêt pour un bon débat 🔥',
      isPrivate: false,
      joinedDate: '2023-11-20',
      stats: { debates: 89, wins: 51, followers: 3400, following: 890 }
    },
    'Challenger 1': {
      id: '1',
      username: 'Challenger1',
      displayName: 'Challenger 1',
      bio: 'Je ne recule devant aucun argument 💪',
      isPrivate: false,
      joinedDate: '2024-03-10',
      stats: { debates: 12, wins: 8, followers: 234, following: 120 }
    },
  };

  // ── HYBRID LIVE SYNC: Broadcast (instant) + Polling (fallback) ──
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const [liveConnected, setLiveConnected] = useState(false);
  const seenMsgKeys = useRef(new Set<string>());

  const addRemoteMessage = useCallback((msgUserName: string, content: string, initial?: string) => {
    const key = `${msgUserName}::${content}`;
    if (seenMsgKeys.current.has(key)) return;
    seenMsgKeys.current.add(key);
    // Remove key after 5s so the same message text can be sent again later
    setTimeout(() => seenMsgKeys.current.delete(key), 5000);
    const msgId = `m_${Date.now()}_${Math.random()}`;
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
        addRemoteMessage(payload.user_name, payload.content, payload.initial);
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
            addRemoteMessage(msg.display_name || msg.username, msg.content);
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
    console.log('⏱️ Timer state:', { timerRunning, timeRemaining, currentSpeaker });
    if (timerRunning && timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            console.log('⏹️ Timer finished for:', currentSpeaker);
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
    console.log('🎤 Starting timer for debater:', debaterId, 'Time limit:', timeLimit);
    setCurrentSpeaker(debaterId);
    setTimeRemaining(timeLimit);
    setTimerRunning(true);
    // Unmute the speaker
    setDebaters(debaters.map(d => 
      d.id === debaterId ? { ...d, isMuted: false } : { ...d, isMuted: true }
    ));
  };

  const stopTimer = () => {
    setTimerRunning(false);
    setCurrentSpeaker(null);
  };

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

  const inviteDebater = () => {
    if (inviteInput.trim()) {
      const username = inviteInput.startsWith('@') ? inviteInput.substring(1) : inviteInput;
      // Check if already exists
      if (debaters.some(d => d.name === username)) {
        toast('Ce débatteur est déjà dans le débat', 'info');
        return;
      }
      // Add new debater
      setDebaters([...debaters, {
        id: Date.now().toString(),
        name: username,
        isMuted: true,
        speakingTime: 0,
      }]);
      setInviteInput('');
    }
  };

  const openProfile = (username: string) => {
    const profile = mockProfiles[username];
    if (profile) {
      if (profile.isPrivate) {
        toast('Ce profil est privé', 'info');
        return;
      }
      setSelectedProfile(profile);
      setShowProfile(true);
    } else {
      // Create a default profile if not found
      setSelectedProfile({
        id: Date.now().toString(),
        username: username,
        displayName: username,
        bio: 'Nouveau sur Beefs',
        isPrivate: false,
        joinedDate: new Date().toISOString().split('T')[0],
        stats: { debates: 0, wins: 0, followers: 0, following: 0 }
      });
      setShowProfile(true);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const cleanContent = sanitizeMessage(chatInput);
    if (!cleanContent) return;

    const senderInitial = userName?.[0]?.toUpperCase() || '?';

    // Show locally immediately
    const localMsg: VisibleMessage = {
      id: Date.now().toString(),
      user_name: userName,
      content: cleanContent,
      timestamp: Date.now(),
      initial: senderInitial,
    };
    const localKey = `${userName}::${cleanContent}`;
    seenMsgKeys.current.add(localKey);
    setTimeout(() => seenMsgKeys.current.delete(localKey), 5000);
    setVisibleMessages(prev => [...prev, localMsg].slice(-80));
    setChatInput('');

    // Broadcast to other users (instant delivery if connected)
    if (channelRef.current) {
      channelRef.current.send({
        type: 'broadcast',
        event: 'message',
        payload: { user_name: userName, content: cleanContent, initial: senderInitial },
      }).catch(() => console.warn('[Live] Message broadcast failed'));
    }
    console.log('[Live] Sending message as:', userName, '| userId:', userId?.slice(0, 8));

    // Persist to DB — this is what the polling fallback reads
    const { error } = await supabase.from('beef_messages').insert({
      beef_id: roomId,
      user_id: userId,
      username: userName,
      display_name: userName,
      content: cleanContent,
      is_pinned: false,
    });
    if (error) console.error('[Live] Message insert failed:', error.message, error);
  };


  // Join: mark as "ready to join" — the useEffect above triggers join() when dailyRoomUrl is ready
  const handleJoin = () => {
    setHasJoined(true);
  };

  const [isLeaving, setIsLeaving] = useState(false);

  // Leave: show black screen instantly, stop camera, then navigate
  const handleLeave = useCallback(async () => {
    setIsLeaving(true); // Immediately cover the video with black screen
    await leave();
    router.replace('/feed');
  }, [leave, router]);

  // Show pre-join screen before entering
  if (!hasJoined) {
    return (
      <div className="w-full h-full relative">
        <PreJoinScreen userName={userName} onJoin={handleJoin} />
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
      {isLeaving && (
        <div className="absolute inset-0 bg-black z-[999] flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
            <span className="text-gray-500 text-sm">Déconnexion...</span>
          </div>
        </div>
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-blue-500/30 border-2 border-blue-400/40 flex items-center justify-center text-5xl font-black text-white">
                      {leftPanel ? leftPanelName[0].toUpperCase() : 'A'}
                    </div>
                    {!leftPanel && (
                      <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                        <span className="text-white/70 text-xs font-medium">En attente du challenger...</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Name tag — bottom left */}
                <div className="absolute bottom-14 left-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                  <div className="w-2 h-2 rounded-full bg-blue-400" />
                  <span className="text-white text-[11px] font-bold drop-shadow-md">
                    {leftPanelName}
                  </span>
                </div>
                {/* Mic/Cam controls when this panel shows local video */}
                {leftPanelIsLocal && (
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 z-10">
                    <button
                      onClick={toggleMic}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${micEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                    >
                      {micEnabled ? '🎤' : '🔇'}
                    </button>
                    <button
                      onClick={toggleCam}
                      className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${camEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                    >
                      {camEnabled ? '📹' : '🚫'}
                    </button>
                  </div>
                )}
                {currentSpeaker === '1' && (
                  <div className="absolute bottom-[4.5rem] left-2 flex gap-0.5 z-10">
                    {[...Array(4)].map((_, i) => (
                      <motion.div key={i} animate={{ height: [3, 10, 3] }}
                        transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.12 }}
                        className="w-1 bg-green-400 rounded-full" style={{ minHeight: 3 }} />
                    ))}
                  </div>
                )}
              </div>

              {/* CENTER — Mediator bubble (local video) — vertically centered */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-2 pointer-events-auto">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex flex-col items-center gap-2">
                  {/* Circle with mediator VIDEO — enlarged */}
                  <div className="relative">
                    <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-full overflow-hidden
                      bg-gradient-to-br from-brand-400 to-brand-600 p-[3px] shadow-2xl shadow-brand-500/60"
                      style={{ filter: 'drop-shadow(0 0 20px rgba(255,107,44,0.5))' }}>
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
                            <span className="text-white font-black text-4xl">
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
                  {/* MÉDIATEUR label */}
                  <div className="brand-gradient px-3 py-1 rounded-full shadow-lg shadow-brand-500/40">
                    <span className="text-white text-xs font-black">⚖️ MÉDIATEUR</span>
                  </div>
                  {/* Mic/Cam + Controls — only for host (mediator) */}
                  {isHost && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={toggleMic}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${micEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                      >
                        {micEnabled ? '🎤' : '🔇'}
                      </button>
                      <button
                        onClick={toggleCam}
                        className={`w-9 h-9 rounded-full flex items-center justify-center text-base transition-all shadow ${camEnabled ? 'bg-white/20 backdrop-blur-sm text-white hover:bg-white/30' : 'bg-red-500 text-white shadow-red-500/50'}`}
                      >
                        {camEnabled ? '📹' : '🚫'}
                      </button>
                      <button
                        onClick={() => setShowModeratorPanel(true)}
                        className="bg-black/80 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5
                          flex items-center gap-1.5 hover:bg-white/10 transition-all text-white shadow"
                      >
                        <span className="text-sm">⚙️</span>
                        <span className="text-xs font-semibold">Contrôles</span>
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
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-24 h-24 rounded-full bg-red-500/30 border-2 border-red-400/40 flex items-center justify-center text-5xl font-black text-white">
                      {rightPanel ? rightPanelName[0].toUpperCase() : 'B'}
                    </div>
                    {!rightPanel && (
                      <div className="flex items-center gap-2 bg-black/50 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-white/70 text-xs font-medium">En attente du challenger...</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Name tag — bottom right */}
                <div className="absolute bottom-14 right-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full flex items-center gap-1.5 z-10">
                  <span className="text-white text-[11px] font-bold drop-shadow-md">
                    {rightPanelName}
                  </span>
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                </div>
                {currentSpeaker === '2' && (
                  <div className="absolute bottom-[4.5rem] right-2 flex gap-0.5 z-10">
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
                  <div className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-xl px-3 sm:px-5 py-1.5 rounded-full border border-white/10 shadow-lg">
                    <p className="text-white font-black text-sm sm:text-base drop-shadow-lg">{debaters[0].name}</p>
                  </div>
                </motion.div>
              </div>
              
              {/* Timer for Challenger 1 */}
              <AnimatePresence>
                {(() => {
                  const shouldShow = currentSpeaker === '1' && timerRunning;
                  console.log('🕐 Timer condition for Challenger 1:', { currentSpeaker, timerRunning, shouldShow });
                  return shouldShow;
                })() && (
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
            <div className="flex-1 relative bg-gradient-to-br from-gray-900/20 to-gray-800/20 flex items-center justify-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="text-center text-white/50"
              >
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-3xl sm:text-4xl mb-2 border border-white/20"
                >
                  👥
                </motion.div>
                <p className="text-xs sm:text-sm font-medium">En attente...</p>
              </motion.div>
            </div>
          )}

          {/* Moderator in Center (Host) */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ 
                type: 'spring', 
                stiffness: 200, 
                damping: 15,
                delay: 0.3 
              }}
              className="relative flex flex-col items-center"
            >
              {/* Moderator Bubble */}
              <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-br from-yellow-400 via-brand-400 to-pink-500 p-1 shadow-2xl">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-3xl sm:text-4xl">
                  👤
                </div>
              </div>
              
              {/* Moderator Badge - Clickable for host, shows host name for spectators */}
              <div className="mt-2 relative">
                {isHost ? (
                  <button
                    onClick={() => setShowModeratorPanel(!showModeratorPanel)}
                    className="bg-gradient-to-r from-yellow-400 to-brand-400 px-3 py-1 rounded-full shadow-lg whitespace-nowrap cursor-pointer hover:from-yellow-500 hover:to-brand-500 transition-colors"
                  >
                    <span className="text-black text-[10px] sm:text-xs font-black">🎛️ CONTRÔLES</span>
                  </button>
                ) : (
                  <div className="bg-gradient-to-r from-yellow-400 to-brand-400 px-3 py-1 rounded-full shadow-lg whitespace-nowrap">
                    <span className="text-black text-[10px] sm:text-xs font-black">{host.name}</span>
                  </div>
                )}
                
                {/* Debate Title - Dynamic animation - Absolute position to not affect layout */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 whitespace-nowrap">
                  <AnimatePresence>
                    {showDebateTitle && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0, y: -10 }}
                        animate={{ scale: 1, opacity: 1, y: 0 }}
                        exit={{ scale: 0, opacity: 0, y: -10 }}
                        transition={{ 
                          type: 'spring', 
                          stiffness: 300, 
                          damping: 20 
                        }}
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
                  <div className="bg-gradient-to-br from-black/60 to-black/40 backdrop-blur-xl px-3 sm:px-5 py-1.5 rounded-full border border-white/10 shadow-lg">
                    <p className="text-white font-black text-sm sm:text-base drop-shadow-lg">{debaters[1].name}</p>
                  </div>
                </motion.div>
              </div>
              
              {/* Timer for Challenger 2 */}
              <AnimatePresence>
                {(() => {
                  const shouldShow = currentSpeaker === '2' && timerRunning;
                  console.log('🕑 Timer condition for Challenger 2:', { currentSpeaker, timerRunning, shouldShow });
                  return shouldShow;
                })() && (
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
            <div className="flex-1 relative bg-gradient-to-br from-gray-900/20 to-gray-800/20 flex items-center justify-center">
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.2 }}
                className="text-center text-white/50"
              >
                <motion.div 
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center text-3xl sm:text-4xl mb-2 border border-white/20"
                >
                  👥
                </motion.div>
                <p className="text-xs sm:text-sm font-medium">En attente...</p>
              </motion.div>
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
          {/* Left: Host pill (avatar + name + follow) */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 bg-black/40 backdrop-blur-md rounded-full pl-0.5 pr-3 py-0.5">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-brand-500 p-[2px]">
                <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
                  <span className="text-white font-bold text-[11px]">{userName ? userName[0].toUpperCase() : 'U'}</span>
                </div>
              </div>
              <span className="text-white font-semibold text-xs drop-shadow-lg max-w-[80px] truncate">{userName}</span>
            </div>
            <button className="bg-pink-500 hover:bg-pink-600 px-3 py-1 rounded-full text-white text-[10px] font-bold transition-colors">
              + Suivre
            </button>
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
            {/* Viewer count */}
            <div className="flex items-center bg-black/40 backdrop-blur-md rounded-full px-2.5 py-1 gap-1">
              <svg className="w-3.5 h-3.5 text-white/80" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
              </svg>
              <span className="text-white text-[11px] font-bold">{viewerCount || 0}</span>
            </div>
            {/* Menu / Close */}
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
            >
              <MoreVertical className="w-4 h-4 text-white" />
            </button>
            <button
              onClick={handleLeave}
              className="w-8 h-8 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Flying Reactions — float up over video area like TikTok hearts ── */}
      <div className="absolute right-[15%] bottom-44 z-50 pointer-events-none w-20">
        <AnimatePresence>
          {flyingReactions.map((reaction) => (
            <motion.div
              key={reaction.id}
              initial={{ y: 0, opacity: 0, scale: 0.3 }}
              animate={{
                y: -300,
                opacity: [0, 1, 1, 0.8, 0],
                scale: [0.3, 1.3, 1.1, 0.9, 0.5],
                x: [0, -15, 20, -10, 15],
              }}
              exit={{ opacity: 0 }}
              transition={{
                duration: 3,
                ease: 'easeOut',
                opacity: { times: [0, 0.05, 0.4, 0.75, 1] },
                x: { duration: 3, ease: 'easeInOut' },
              }}
              className="absolute bottom-0 text-3xl sm:text-4xl drop-shadow-lg"
              style={{ left: `${reaction.x % 50}px` }}
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
            {visibleMessages.map((message) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 10, x: -10 }}
                animate={{ opacity: 1, y: 0, x: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                className="flex items-start gap-2 max-w-[90%]"
              >
                {/* Avatar circle */}
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-pink-500 to-brand-500 flex items-center justify-center flex-shrink-0 ring-1 ring-white/20">
                  <span className="text-white font-bold text-[10px]">{message.initial}</span>
                </div>
                {/* Message bubble */}
                <div className="bg-white/10 backdrop-blur-sm rounded-2xl rounded-tl-md px-3 py-1.5 min-w-0">
                  <span className="text-brand-400 text-[11px] font-bold block leading-tight">{message.user_name}</span>
                  <span className="text-white text-[13px] leading-snug break-words">{message.content}</span>
                </div>
              </motion.div>
            ))}
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
                    onClick={() => { handleReaction(emoji); setShowAllReactions(false); }}
                    className="w-10 h-10 flex items-center justify-center text-xl rounded-xl hover:bg-white/10 active:scale-90 transition-all touch-manipulation"
                  >
                    {emoji}
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
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
              placeholder="Saisis ton message..."
              className="w-full bg-white/10 backdrop-blur-sm border border-white/15 rounded-full pl-3.5 pr-9 py-2 text-white placeholder-white/40 text-sm focus:outline-none focus:border-brand-400/50 transition-colors"
            />
            {chatInput.trim() && (
              <button
                onClick={handleSendMessage}
                className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 bg-brand-500 rounded-full flex items-center justify-center hover:bg-brand-600 transition-colors"
              >
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
              </button>
            )}
          </div>

          {/* Emoji toggle */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setShowAllReactions(!showAllReactions)}
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0 touch-manipulation"
          >
            <span className="text-base">😀</span>
          </motion.button>

          {/* Like / Heart */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => handleReaction('❤️')}
            className="w-9 h-9 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center flex-shrink-0 touch-manipulation"
          >
            <Heart className="w-[18px] h-[18px] text-pink-500 fill-pink-500" />
          </motion.button>

          {/* Gift */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onGift}
            className="w-9 h-9 rounded-full bg-gradient-to-br from-yellow-400/80 to-brand-500/80 flex items-center justify-center flex-shrink-0 touch-manipulation"
          >
            <Gift className="w-[18px] h-[18px] text-white" />
          </motion.button>

          {/* Tension Meter */}
          <TensionButton tension={tension} onTap={onTap} />

          {/* Share + viewer count */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={onShare}
            className="flex items-center gap-0.5 px-2 h-9 rounded-full bg-white/10 backdrop-blur-sm flex-shrink-0 touch-manipulation"
          >
            <Share2 className="w-3.5 h-3.5 text-white" />
            <span className="text-white text-[10px] font-bold">{viewerCount || 0}</span>
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

              {/* Debaters Control */}
              <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                <h3 className="text-white font-bold text-sm mb-2 flex items-center gap-2">
                  <span>👥</span> Débatteurs
                </h3>
                <div className="space-y-2">
                  {debaters.map((debater) => (
                    <div key={debater.id} className="bg-black/40 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => openProfile(debater.name)}
                          className="text-white font-semibold text-sm hover:text-pink-400 cursor-pointer"
                        >
                          {debater.name}
                        </button>
                        <button
                          onClick={() => removeDebater(debater.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          ✕
                        </button>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => startTimer(debater.id)}
                          disabled={timerRunning}
                          className={`flex-1 py-1.5 rounded text-xs font-bold ${
                            currentSpeaker === debater.id
                              ? 'bg-green-500 text-white'
                              : 'bg-white/10 text-white hover:bg-white/20'
                          } disabled:opacity-50`}
                        >
                          {currentSpeaker === debater.id ? '🎤 Parle' : '▶️ Donner parole'}
                        </button>
                        <button
                          onClick={() => toggleMute(debater.id)}
                          className={`px-3 py-1.5 rounded text-xs font-bold ${
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
                </div>
              </div>

              {/* Invite Debater by ID */}
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
                        onKeyPress={(e) => e.key === 'Enter' && inviteDebater()}
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
                  <p className="text-white/40 text-xs">Ex: @username ou username</p>
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
                </div>
              </div>
            </div>
          </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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

                {/* Actions */}
                <div className="flex gap-2">
                  <button className="flex-1 bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white font-bold py-2.5 rounded-xl">
                    Suivre
                  </button>
                  <button className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold py-2.5 rounded-xl border border-white/20">
                    Message
                  </button>
                </div>
              </div>
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
      `}</style>
    </div>
  );
}
