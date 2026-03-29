'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { ArenaLayout } from '@/components/ArenaLayout';
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
  
  // Mock user data (would come from auth in production)
  const [userId] = useState(() => `user_${Math.random().toString(36).substr(2, 9)}`);
  const [userName] = useState(() => `Débatteur ${Math.floor(Math.random() * 1000)}`);
  const [isHost, setIsHost] = useState(false);

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
    const { data: room } = await supabase
      .from('rooms')
      .select('*')
      .eq('id', roomId)
      .single();

    if (room) {
      setHost({
        id: room.host_id,
        name: room.host_name,
        isHost: true,
        videoEnabled: true,
        audioEnabled: true,
        badges: [],
      });
      
      setIsHost(room.host_id === userId);

      // Check for active challenger
      if (room.current_challenger_id) {
        const { data: challengerData } = await supabase
          .from('challenger_queue')
          .select('*')
          .eq('user_id', room.current_challenger_id)
          .eq('status', 'active')
          .single();

        if (challengerData) {
          setChallenger({
            id: challengerData.user_id,
            name: challengerData.user_name,
            isHost: false,
            videoEnabled: true,
            audioEnabled: true,
          });
        }
      }
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

  // TikTok-style view
  const [viewMode, setViewMode] = useState<'tiktok' | 'classic'>('tiktok');

  if (viewMode === 'tiktok') {
    return (
      <div className="fixed inset-0 top-16 overflow-hidden">
        <TikTokStyleArena
          host={host}
          challenger={challenger}
          roomId={roomId}
          userId={userId}
          userName={userName}
          viewerCount={Math.floor(Math.random() * 1000) + 100}
          tension={localTension}
          points={userPoints}
          debateTitle="Débat: Technologie vs Environnement"
          onReaction={handleReaction}
          onTap={tap}
          onShare={() => console.log('Share clicked')}
        />
      </div>
    );
  }

  return (
    <div className={`fixed inset-0 top-16 flex flex-col bg-arena-darker overflow-hidden ${isChaosMode ? 'chaos-mode' : ''}`}>
      {/* Spectacle Mode Effects */}
      <SpectacleMode isChaosMode={isChaosMode} tension={localTension} />

      {/* Reaction Overlay */}
      <ReactionOverlay reactions={reactions} />

      {/* Top Bar - Points, Controls & Clip */}
      <div className="flex-shrink-0 flex items-center justify-between px-2 sm:px-4 py-1.5 sm:py-2 bg-arena-dark/95 backdrop-blur-sm border-b border-arena-gray z-20 gap-1.5 sm:gap-2">
        <PointsDisplay points={userPoints} />
        
        <div className="flex items-center gap-1.5 sm:gap-2">
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

      {/* Main Container */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
        {/* Left: Arena View */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          <div className="flex-1 overflow-hidden p-1 sm:p-2">
            {debateMode === '1v1' ? (
              <ArenaLayout host={host} challenger={challenger} />
            ) : (
              <MultiDebaterArena 
                debaters={debaters}
                isHost={isHost}
                activeSpeakerId={activeSpeakerId || undefined}
                timeRemaining={currentSpeakerTimeLeft || undefined}
                onAddDebater={handleAddDebater}
                onRemoveDebater={handleRemoveDebater}
                onToggleMute={handleToggleMute}
                onVolumeChange={handleVolumeChange}
              />
            )}
          </div>

          {/* Mobile: Chat Overlay - Only visible on small screens */}
          <div className="lg:hidden absolute bottom-0 left-0 right-0 h-1/3 pointer-events-none">
            <div className="h-full flex flex-col pointer-events-auto bg-gradient-to-t from-black/90 via-black/70 to-transparent backdrop-blur-sm">
              <div className="flex-1 overflow-auto px-3 pt-8">
                <ChatPanel roomId={roomId} userId={userId} userName={userName} />
              </div>
            </div>
          </div>
          
          {/* Bottom Controls */}
          <div className="flex-shrink-0 relative z-10">
            {/* Reaction Slider - Always Visible */}
            <ReactionSlider onReaction={handleReaction} />

            {/* Tension Meter */}
            <div className="px-2 py-1 sm:py-2">
              <TensionGauge 
                tension={localTension} 
                isChaosMode={isChaosMode}
                onTap={tap}
              />
            </div>
          </div>
        </div>

        {/* Right: Sidebar - Desktop Only */}
        <div className="hidden lg:flex w-80 xl:w-96 flex-shrink-0 border-l border-arena-gray bg-arena-dark flex-col overflow-hidden">
          <Tabs defaultValue="chat" className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <TabsList className="bg-arena-darker border-b border-arena-gray flex-shrink-0 p-2">
              <TabsTrigger value="chat">💬</TabsTrigger>
              <TabsTrigger value="queue">👥</TabsTrigger>
              <TabsTrigger value="ai">🤖</TabsTrigger>
              <TabsTrigger value="stats">📊</TabsTrigger>
              <TabsTrigger value="engage">🎯</TabsTrigger>
            </TabsList>

            <TabsContent value="chat" className="flex-1 overflow-auto">
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
              
              <div className="pt-2 border-t border-arena-gray space-y-2">
                <h4 className="font-bold text-xs text-gray-400">GIFTS</h4>
                {challenger && (
                  <GiftSystem
                    roomId={roomId}
                    userId={userId}
                    targetUserId={challenger.id}
                    targetUserName={challenger.name}
                  />
                )}
                <GiftSystem
                  roomId={roomId}
                  userId={userId}
                  targetUserId={host.id}
                  targetUserName={host.name}
                />
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
