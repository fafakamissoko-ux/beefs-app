'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Settings, Users as UsersIcon, Mic, MicOff, UserPlus, X, Play, Pause, Timer, Volume2, VolumeX } from 'lucide-react';
import { MultiParticipantGrid } from '@/components/MultiParticipantGrid';
import { InviteParticipantModal } from '@/components/InviteParticipantModal';
import { supabase } from '@/lib/supabase/client';
import { useDailyRoom } from '@/hooks/useDailyRoom';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';

interface RingParticipant {
  id: string;
  name: string;
  avatar?: string;
  isMainParticipant: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface RoomData {
  id: string;
  title: string;
  host_name: string;
  category?: string;
  status: string;
}

export default function BeefSessionPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Mock data - replace with real data from Supabase
  const currentUserId = user?.id || 'mock-user';
  const mediatorId = 'mediator1'; // Will be fetched from beef data
  const isMediator = currentUserId === mediatorId;
  
  // Room & beef data
  const [roomData, setRoomData] = useState<RoomData | null>(null);
  const [beefTitle, setBeefTitle] = useState('Chargement...');
  
  // Daily.co audio integration
  const dailyRoomUrl = `https://beefs.daily.co/${roomId}`; // Will be created dynamically
  const { 
    isJoined: audioJoined,
    isJoining: audioJoining,
    isMuted,
    participants: audioParticipants,
    toggleMute,
    joinRoom: joinAudio,
    leaveRoom: leaveAudio,
    error: audioError,
  } = useDailyRoom({
    roomUrl: dailyRoomUrl,
    userData: {
      userId: currentUserId,
      username: user?.user_metadata?.username || 'User',
    },
    autoJoin: false, // Manual join when beef starts
  });
  
  // Core session state - Mediator NOT in participants list
  const [ringParticipants, setRingParticipants] = useState<RingParticipant[]>([
    { 
      id: 'p1', 
      name: 'Jean', 
      isMainParticipant: true, 
      isSpeaking: false, 
      isMuted: false 
    },
    { 
      id: 'p2', 
      name: 'Marc', 
      isMainParticipant: true, 
      isSpeaking: true, 
      isMuted: false 
    },
  ]);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [showMediatorPanel, setShowMediatorPanel] = useState(false);
  const [viewerCount] = useState(2341);
  const [sessionTimer, setSessionTimer] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(true);

  // Load room data
  useEffect(() => {
    const loadRoomData = async () => {
      try {
        const { data, error } = await supabase
          .from('rooms')
          .select('*')
          .eq('id', roomId)
          .single();

        if (error) throw error;

        if (data) {
          setRoomData(data);
          setBeefTitle(data.title);
        }
      } catch (error) {
        console.error('Error loading room:', error);
        // Fallback to mock data based on roomId
        const mockTitles: { [key: string]: string } = {
          'demo-room-1': 'IA vs Emploi: Le grand débat',
          'demo-room-2': 'Crypto: Avenir ou Arnaque?',
          'demo-room-3': 'Débat Tech 2026',
          'demo-room-4': 'Gaming vs Études: Le débat',
        };
        setBeefTitle(mockTitles[roomId] || 'Beef en direct');
      }
    };

    loadRoomData();
  }, [roomId]);

  // Session timer
  useEffect(() => {
    if (!isTimerRunning) return;
    const interval = setInterval(() => {
      setSessionTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  // Format time
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handlers
  const handleInviteParticipant = (userId: string) => {
    const newParticipant: RingParticipant = {
      id: userId,
      name: `Participant ${ringParticipants.length + 1}`,
      avatar: '👤',
      isMainParticipant: false,
      isSpeaking: false,
      isMuted: true,
    };
    
    setRingParticipants([...ringParticipants, newParticipant]);
  };

  const handleToggleMute = (participantId: string) => {
    setRingParticipants(ringParticipants.map(p => 
      p.id === participantId ? { ...p, isMuted: !p.isMuted } : p
    ));
  };

  const handleRemoveParticipant = (participantId: string) => {
    // Can remove ANY participant, including main ones
    if (ringParticipants.length <= 1) {
      toast('Il faut au moins 1 participant!', 'error');
      return;
    }
    setRingParticipants(ringParticipants.filter(p => p.id !== participantId));
  };

  const handleGiveSpeech = (participantId: string) => {
    setRingParticipants(ringParticipants.map(p => ({
      ...p,
      isSpeaking: p.id === participantId,
      isMuted: p.id === participantId ? false : p.isMuted,
    })));
  };

  return (
    <div className="fixed inset-0 top-16 bg-black overflow-hidden">
      {/* Top Bar - Session Info */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/90 to-transparent p-2 sm:p-4">
        <div className="flex items-center justify-between">
          {/* Left: Title & Timer */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black text-sm sm:text-lg truncate flex items-center gap-2">
              🔥 {beefTitle}
              {isMediator && (
                <span className="text-xs sm:text-sm bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/50">
                  Médiateur
                </span>
              )}
            </h1>
            <div className="flex items-center gap-3 text-gray-400 text-xs sm:text-sm mt-1">
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{formatTime(sessionTimer)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Eye className="w-3 h-3 sm:w-4 sm:h-4" />
                <span>{viewerCount.toLocaleString()} témoins</span>
              </div>
            </div>
          </div>

          {/* Right: Live Badge & Controls */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-red-500/20 backdrop-blur-sm px-2 sm:px-3 py-1 rounded-full border border-red-500">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white font-bold text-xs sm:text-sm">LIVE</span>
            </div>
            
            {isMediator && (
              <button
                onClick={() => setShowMediatorPanel(!showMediatorPanel)}
                className="p-2 bg-orange-500/20 hover:bg-orange-500/30 rounded-lg transition-colors border border-orange-500/50"
              >
                <Settings className="w-4 h-4 sm:w-5 sm:h-5 text-orange-400" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content - Participants Grid (MODULABLE) */}
      <div className="w-full h-full pt-16 sm:pt-20 pb-20 sm:pb-24">
        <MultiParticipantGrid
          participants={ringParticipants}
          mediatorId={mediatorId}
          currentUserId={currentUserId}
          onInviteParticipant={() => setShowInviteModal(true)}
          onToggleMute={handleToggleMute}
          onRemoveParticipant={handleRemoveParticipant}
        />
      </div>

      {/* Bottom Bar - Mediator Quick Controls */}
      {isMediator && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/95 to-transparent p-2 sm:p-4">
          <div className="max-w-7xl mx-auto">
            {/* Compact Control Bar */}
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                {/* Left: Quick Stats */}
                <div className="flex items-center gap-4 text-xs sm:text-sm">
                  <div className="flex items-center gap-2">
                    <UsersIcon className="w-4 h-4 text-orange-400" />
                    <span className="text-white font-semibold">
                      {ringParticipants.length}/6
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2">
                    <Mic className="w-4 h-4 text-green-400" />
                    <span className="text-white font-semibold">
                      {ringParticipants.find(p => p.isSpeaking)?.name || 'Personne'}
                    </span>
                  </div>
                </div>

                {/* Right: Action Buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-semibold text-xs sm:text-sm text-black transition-colors"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Inviter</span>
                  </button>
                  
                  <button
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    {isTimerRunning ? (
                      <Pause className="w-4 h-4 text-white" />
                    ) : (
                      <Play className="w-4 h-4 text-white" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mediator Extended Panel (Expandable) */}
      <AnimatePresence>
        {showMediatorPanel && isMediator && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={() => setShowMediatorPanel(false)}
          >
            <motion.div
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-t-2xl sm:rounded-2xl p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto border-t-2 sm:border-2 border-orange-500/50"
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-white flex items-center gap-2">
                  🎭 Contrôles Médiateur
                </h2>
                <button
                  onClick={() => setShowMediatorPanel(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400" />
                </button>
              </div>

              {/* Participants List with Controls */}
              <div className="space-y-3">
                <h3 className="text-white font-bold mb-3">Participants actifs:</h3>
                {ringParticipants.map((participant) => (
                  <div
                    key={participant.id}
                    className="bg-black/40 border border-gray-700 rounded-xl p-4 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">
                        {participant.isMainParticipant ? '🔥' : '👤'}
                      </div>
                      <div>
                        <p className="text-white font-bold">{participant.name}</p>
                        <p className="text-gray-400 text-sm">
                          {participant.isMainParticipant ? 'En beef' : 'Invité'}
                          {participant.isSpeaking && ' • Parle actuellement'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleGiveSpeech(participant.id)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          participant.isSpeaking
                            ? 'bg-red-500 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        Parole
                      </button>
                      <button
                        onClick={() => handleToggleMute(participant.id)}
                        className={`p-2 rounded-lg transition-colors ${
                          participant.isMuted
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-green-500/20 text-green-400'
                        }`}
                      >
                        {participant.isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                      </button>
                      {!participant.isMainParticipant && (
                        <button
                          onClick={() => handleRemoveParticipant(participant.id)}
                          className="p-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Participant Button */}
              <button
                onClick={() => {
                  setShowMediatorPanel(false);
                  setShowInviteModal(true);
                }}
                className="w-full mt-4 p-4 bg-orange-500/20 hover:bg-orange-500/30 border-2 border-dashed border-orange-500 rounded-xl text-orange-400 font-bold transition-all flex items-center justify-center gap-2"
              >
                <UserPlus className="w-5 h-5" />
                Inviter quelqu'un sur le ring
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Modal */}
      <InviteParticipantModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={handleInviteParticipant}
        currentParticipants={ringParticipants.map(p => p.id)}
      />
    </div>
  );
}
