'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DailyVideo } from '@/components/DailyVideo';
import { MultiDebaterArena } from '@/components/MultiDebaterArena';
import { DebateTimer } from '@/components/DebateTimer';
import { HostControlPanel } from '@/components/HostControlPanel';
import { TensionGauge } from '@/components/TensionGauge';
import { ChatPanel } from '@/components/ChatPanel';
import { ChallengerQueue } from '@/components/ChallengerQueue';
import { AIFactCheck } from '@/components/AIFactCheck';
import { GiftSystem } from '@/components/GiftSystem';
import { ReactionButtons } from '@/components/ReactionButtons';
import { ReactionSlider } from '@/components/ReactionSlider';
import { TikTokStyleArena } from '@/components/TikTokStyleArena';
import { ReactionOverlay } from '@/components/ReactionOverlay';
import { PointsDisplay } from '@/components/PointsDisplay';
import { Leaderboard } from '@/components/Leaderboard';
import { LivePoll } from '@/components/LivePoll';
import { PredictionSystem } from '@/components/PredictionSystem';
import { ClipButton } from '@/components/ClipButton';
import { SpectacleMode } from '@/components/SpectacleMode';
import { useTensionMeter } from '@/hooks/useTensionMeter';
import { usePointsSystem } from '@/hooks/usePointsSystem';
import { supabase } from '@/lib/supabase/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';

export default function ArenaPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  
  // Get authenticated user
  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isHost, setIsHost] = useState(false);

  // Load authenticated user
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        setUserId(user.id);
        
        // Get user details from users table
        const { data: userData } = await supabase
          .from('users')
          .select('username, display_name')
          .eq('id', user.id)
          .single();
        
        if (userData) {
          setUserName(userData.display_name || userData.username || 'Utilisateur');
        } else {
          setUserName('Utilisateur');
        }
      } else {
        // User not authenticated - redirect to login
        window.location.href = '/login';
      }
    };
    
    loadUser();
  }, []);

  const [host, setHost] = useState({
    id: 'host_1',
    name: 'Host Principal',
    isHost: true,
    videoEnabled: true,
    audioEnabled: true,
    badges: ['controversial'],
  });

  const [challenger, setChallenger] = useState<any>(null);

  // Multi-debater system
  const [debateMode, setDebateMode] = useState<'1v1' | 'multi'>('1v1');
  const [debaters, setDebaters] = useState<Array<{
    id: string;
    name: string;
    team: 'A' | 'B';
    videoEnabled: boolean;
    audioEnabled: boolean;
    volume: number;
    isHost?: boolean;
  }>>([
    // Mock data
    { id: 'host_1', name: 'Host Principal', team: 'A', videoEnabled: true, audioEnabled: true, volume: 100, isHost: true },
  ]);

  // Speaking turns system
  const [activeSpeakerId, setActiveSpeakerId] = useState<string | null>(null);
  const [speakingTimePerDebater, setSpeakingTimePerDebater] = useState(60); // 60 seconds per turn
  const [currentSpeakerTimeLeft, setCurrentSpeakerTimeLeft] = useState<number | null>(null);
  const [speakingTimerActive, setSpeakingTimerActive] = useState(false);

  const { localTension, isChaosMode, tap } = useTensionMeter(roomId);

  // Points system
  const { points: userPoints, addPoints, spendPoints } = usePointsSystem({
    userId,
    roomId,
    initialPoints: 1000,
  });

  // Reactions system
  const [reactions, setReactions] = useState<Array<{ id: string; emoji: string; x: number; y: number; timestamp: number }>>([]);

  // Poll system
  const [activePoll, setActivePoll] = useState({
    question: "Qui gagne ce débat ?",
    options: [
      { id: '1', text: 'Host', votes: 45, color: '#3b82f6' },
      { id: '2', text: 'Challenger', votes: 32, color: '#ef4444' },
      { id: '3', text: 'Match nul', votes: 12, color: '#6b7280' },
    ],
    totalVotes: 89,
  });
  const [hasVotedPoll, setHasVotedPoll] = useState(false);

  // Prediction system
  const [activePrediction, setActivePrediction] = useState({
    id: '1',
    question: "Qui va remporter ce débat ?",
    options: [
      { id: '1', text: 'Host gagne', odds: 1.5, totalPoints: 5000, color: '#3b82f6' },
      { id: '2', text: 'Challenger gagne', odds: 2.5, totalPoints: 3000, color: '#ef4444' },
    ],
    status: 'active' as const,
  });

  // Timer effect for active speaker
  useEffect(() => {
    if (speakingTimerActive && activeSpeakerId && currentSpeakerTimeLeft !== null && currentSpeakerTimeLeft > 0) {
      const interval = setInterval(() => {
        setCurrentSpeakerTimeLeft(prev => {
          if (prev === null || prev <= 1) {
            // Time's up - reduce volume to 10%
            handleVolumeChange(activeSpeakerId, 10);
            setSpeakingTimerActive(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [speakingTimerActive, activeSpeakerId, currentSpeakerTimeLeft]);

  useEffect(() => {
    // Load room data
    loadRoomData();
  }, [roomId]);

  const loadRoomData = async () => {
    const { data: beef } = await supabase
      .from('beefs')
      .select('*, users!beefs_mediator_id_fkey(username, display_name, avatar_url)')
      .eq('id', roomId)
      .single();

    if (beef) {
      // Block access to ended beefs
      if (beef.status === 'ended' || beef.status === 'cancelled') {
        window.location.href = '/feed';
        return;
      }

      const mediator = beef.users as any;
      setHost({
        id: beef.mediator_id,
        name: mediator?.display_name || mediator?.username || 'Médiateur',
        isHost: true,
        videoEnabled: true,
        audioEnabled: true,
        badges: [],
      });

      setIsHost(beef.mediator_id === userId);

      // Create or retrieve Daily.co room for this beef
      await ensureDailyRoom(roomId);
    } else {
      window.location.href = '/feed';
    }
  };

  const ensureDailyRoom = async (beefId: string) => {
    const roomName = `beef-${beefId.replace(/-/g, '').slice(0, 32)}`;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }

      const getRes = await fetch(`/api/daily/rooms?name=${roomName}`, { headers: authHeaders });
      const getData = await getRes.json();

      if (getData.success && getData.room?.url) {
        setDailyRoomUrl(getData.room.url);
        return;
      }

      const createRes = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({
          roomName,
          privacy: 'public',
          maxParticipants: 10,
        }),
      });
      const createData = await createRes.json();

      if (createData.success && createData.room?.url) {
        setDailyRoomUrl(createData.room.url);
      } else {
        console.error('Failed to create Daily room:', createData);
      }
    } catch (err) {
      console.error('Error ensuring Daily room:', err);
    }
  };

  // Handlers
  const handleReaction = (emoji: string) => {
    const newReaction = {
      id: Date.now().toString(),
      emoji,
      x: Math.random() * window.innerWidth * 0.6,
      y: Math.random() * window.innerHeight * 0.5 + window.innerHeight * 0.25,
      timestamp: Date.now(),
    };
    
    setReactions(prev => [...prev, newReaction]);
    
    // Award points for reactions
    addPoints(1, 'Réaction envoyée');
    
    // Remove after animation
    setTimeout(() => {
      setReactions(prev => prev.filter(r => r.id !== newReaction.id));
    }, 2000);
  };

  const handleVote = (optionId: string) => {
    if (hasVotedPoll) return;
    
    setActivePoll(prev => ({
      ...prev,
      options: prev.options.map(opt => 
        opt.id === optionId ? { ...opt, votes: opt.votes + 1 } : opt
      ),
      totalVotes: prev.totalVotes + 1,
    }));
    
    setHasVotedPoll(true);
    addPoints(5, 'Vote sondage');
  };

  const handlePredict = (optionId: string, points: number) => {
    const success = spendPoints(points, 'Prédiction');
    if (!success) return;
    
    setActivePrediction(prev => ({
      ...prev,
      userPrediction: optionId,
      pointsWagered: points,
      options: prev.options.map(opt =>
        opt.id === optionId ? { ...opt, totalPoints: opt.totalPoints + points } : opt
      ),
    }));
  };

  const handleCreateClip = async () => {
    // Simulate clip creation
    await new Promise(resolve => setTimeout(resolve, 1500));
    const clipUrl = `https://arena-vs.app/clips/${roomId}-${Date.now()}`;
    return clipUrl;
  };

  const handleAddDebater = (team: 'A' | 'B') => {
    const newDebater = {
      id: `debater_${Date.now()}`,
      name: `Débatteur ${debaters.length + 1}`,
      team,
      videoEnabled: true,
      audioEnabled: true,
      volume: 100,
    };
    setDebaters(prev => [...prev, newDebater]);
  };

  const handleRemoveDebater = (debaterId: string) => {
    // If removing active speaker, stop the timer
    if (debaterId === activeSpeakerId) {
      setActiveSpeakerId(null);
      setSpeakingTimerActive(false);
      setCurrentSpeakerTimeLeft(null);
    }
    setDebaters(prev => prev.filter(d => d.id !== debaterId));
  };

  const handleToggleMute = (debaterId: string) => {
    setDebaters(prev => prev.map(d => 
      d.id === debaterId 
        ? { ...d, volume: d.volume === 0 ? 100 : 0 }
        : d
    ));
  };

  const handleVolumeChange = (debaterId: string, volume: number) => {
    setDebaters(prev => prev.map(d => 
      d.id === debaterId 
        ? { ...d, volume: Math.max(0, Math.min(100, volume)) }
        : d
    ));
  };

  const handleStartSpeaking = (debaterId: string) => {
    // Reset previous speaker volume if any
    if (activeSpeakerId && activeSpeakerId !== debaterId) {
      handleVolumeChange(activeSpeakerId, 100);
    }
    
    setActiveSpeakerId(debaterId);
    setCurrentSpeakerTimeLeft(speakingTimePerDebater);
    setSpeakingTimerActive(true);
    
    // Make sure the new speaker has full volume
    handleVolumeChange(debaterId, 100);
  };

  const handleStopSpeaking = () => {
    if (activeSpeakerId) {
      handleVolumeChange(activeSpeakerId, 100); // Reset volume
    }
    setActiveSpeakerId(null);
    setSpeakingTimerActive(false);
    setCurrentSpeakerTimeLeft(null);
  };

  const handleSetSpeakingTime = (seconds: number) => {
    setSpeakingTimePerDebater(seconds);
  };

  const handleModeChange = (mode: '1v1' | 'multi') => {
    setDebateMode(mode);
    // Reset debaters when switching modes
    if (mode === '1v1') {
      setDebaters([
        { id: 'host_1', name: 'Host Principal', team: 'A', videoEnabled: true, audioEnabled: true, volume: 100, isHost: true },
      ]);
    }
  };

  // Daily.co room
  const [dailyRoomUrl, setDailyRoomUrl] = useState<string | null>(null);

  // TikTok-style view
  const [viewMode, setViewMode] = useState<'tiktok' | 'classic'>('tiktok');

  // Show loading while user data is being fetched
  if (!userId || !userName) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4"></div>
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  if (viewMode === 'tiktok') {
    return (
      <div className="fixed inset-0 top-16 overflow-hidden">
        <TikTokStyleArena
          host={host}
          challenger={challenger}
          roomId={roomId}
          userId={userId}
          userName={userName}
          viewerCount={0}
          tension={localTension}
          points={userPoints}
          debateTitle=""
          dailyRoomUrl={dailyRoomUrl}
          onReaction={handleReaction}
          onTap={tap}
          onGift={() => {}}
          onShare={() => {}}
        />
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 top-16 flex flex-col bg-gray-950 overflow-hidden ${isChaosMode ? 'chaos-mode' : ''}`}>
      <SpectacleMode isChaosMode={isChaosMode} tension={localTension} />
      <ReactionOverlay reactions={reactions} />

      {/* Top Bar */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-black/80 backdrop-blur-sm border-b border-white/10 z-20">
        <PointsDisplay points={userPoints} />
        <div className="flex items-center gap-2">
          {isHost && (
            <HostControlPanel
              isHost={isHost}
              debateMode={debateMode}
              debaters={debaters}
              activeSpeakerId={activeSpeakerId}
              speakingTimePerDebater={speakingTimePerDebater}
              onModeChange={handleModeChange}
              onStartSpeaking={handleStartSpeaking}
              onStopSpeaking={handleStopSpeaking}
              onSetSpeakingTime={handleSetSpeakingTime}
              onReaction={handleReaction}
            />
          )}
          <ClipButton onCreateClip={handleCreateClip} />
        </div>
      </div>

      {/* Main layout: video+controls on left, chat on right */}
      <div className="flex-1 flex overflow-hidden min-h-0">

        {/* LEFT COLUMN: video (top) + reactions + tension (bottom) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">

          {/* Video area — takes available space */}
          <div className="flex-1 min-h-0 p-2">
            {dailyRoomUrl ? (
              <DailyVideo roomUrl={dailyRoomUrl} userName={userName} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gray-900 rounded-2xl">
                <div className="text-center text-gray-400">
                  <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500 mx-auto mb-3" />
                  <p className="text-sm">Connexion vidéo...</p>
                </div>
              </div>
            )}
          </div>

          {/* Reactions bar — fixed height, always visible below video */}
          <div className="flex-shrink-0 bg-black/60 backdrop-blur-sm border-t border-white/10">
            <ReactionSlider onReaction={handleReaction} />
          </div>

          {/* Tension meter — fixed height */}
          <div className="flex-shrink-0 px-3 py-2 bg-black/40">
            <TensionGauge
              tension={localTension}
              isChaosMode={isChaosMode}
              onTap={tap}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: chat sidebar — desktop only */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-shrink-0 border-l border-white/10 bg-gray-900 flex-col overflow-hidden">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <TabsList className="bg-black/50 border-b border-white/10 flex-shrink-0 p-2">
              <TabsTrigger value="chat">💬</TabsTrigger>
              <TabsTrigger value="queue">👥</TabsTrigger>
              <TabsTrigger value="ai">🤖</TabsTrigger>
              <TabsTrigger value="stats">📊</TabsTrigger>
              <TabsTrigger value="engage">🎯</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 overflow-hidden">
              <ChatPanel roomId={roomId} userId={userId} userName={userName} />
            </TabsContent>

            <TabsContent value="queue" className="flex-1 overflow-auto">
              <ChallengerQueue
                roomId={roomId}
                userId={userId}
                userName={userName}
                isHost={isHost}
              />
            </TabsContent>

            <TabsContent value="ai" className="flex-1 overflow-auto p-2 space-y-2">
              <div className="space-y-2">
                <h4 className="font-bold text-xs text-gray-400">FACT-CHECKING</h4>
                <AIFactCheck roomId={roomId} />
              </div>
              <div className="pt-2 border-t border-white/10 space-y-2">
                <h4 className="font-bold text-xs text-gray-400">GIFTS</h4>
                {challenger && (
                  <GiftSystem roomId={roomId} userId={userId} targetUserId={challenger.id} targetUserName={challenger.name} />
                )}
                <GiftSystem roomId={roomId} userId={userId} targetUserId={host.id} targetUserName={host.name} />
              </div>
            </TabsContent>

            <TabsContent value="stats" className="flex-1 overflow-hidden">
              <Leaderboard roomId={roomId} />
            </TabsContent>

            <TabsContent value="engage" className="flex-1 overflow-auto p-2 space-y-3">
              <LivePoll
                question={activePoll.question}
                options={activePoll.options}
                onVote={handleVote}
                hasVoted={hasVotedPoll}
                totalVotes={activePoll.totalVotes}
              />

              <PredictionSystem
                prediction={activePrediction}
                userPoints={userPoints}
                onPredict={handlePredict}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
