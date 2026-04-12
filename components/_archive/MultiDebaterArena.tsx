'use client';

import { useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Crown, UserPlus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Debater {
  id: string;
  name: string;
  team: 'A' | 'B';
  videoEnabled: boolean;
  audioEnabled: boolean;
  volume: number; // 0-100
  isHost?: boolean;
  avatar?: string;
}

interface MultiDebaterArenaProps {
  debaters: Debater[];
  isHost: boolean;
  activeSpeakerId?: string;
  timeRemaining?: number;
  onAddDebater?: (team: 'A' | 'B') => void;
  onRemoveDebater?: (debaterId: string) => void;
  onToggleMute?: (debaterId: string) => void;
  onVolumeChange?: (debaterId: string, volume: number) => void;
}

export function MultiDebaterArena({ 
  debaters, 
  isHost,
  activeSpeakerId,
  timeRemaining,
  onAddDebater,
  onRemoveDebater,
  onToggleMute,
  onVolumeChange
}: MultiDebaterArenaProps) {
  const teamA = debaters.filter(d => d.team === 'A');
  const teamB = debaters.filter(d => d.team === 'B');

  return (
    <div className="w-full h-full flex flex-col lg:flex-row bg-arena-darker gap-2">
      {/* Team A */}
      <div className="flex-1 flex flex-col gap-2 p-2 bg-blue-500/5 border-2 border-blue-500/30 rounded-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-blue-400">ÉQUIPE A</h3>
          {isHost && (
            <button
              onClick={() => onAddDebater?.('A')}
              className="p-1 hover:bg-white/5 rounded transition-colors"
              title="Ajouter débatteur"
            >
              <UserPlus className="w-4 h-4 text-blue-400" />
            </button>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 gap-2">
          {teamA.map((debater) => (
            <DebaterCard 
              key={debater.id} 
              debater={debater} 
              isHost={isHost}
              isActiveSpeaker={activeSpeakerId === debater.id}
              timeRemaining={timeRemaining}
              onRemove={onRemoveDebater}
              onToggleMute={onToggleMute}
              onVolumeChange={onVolumeChange}
              teamColor="blue"
            />
          ))}
          
          {teamA.length === 0 && (
            <div className="flex items-center justify-center h-full border-2 border-dashed border-blue-500/30 rounded-lg">
              <div className="text-center text-gray-500">
                <div className="text-2xl mb-2">👥</div>
                <p className="text-xs">En attente de débatteurs</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* VS Divider */}
      <div className="flex lg:flex-col items-center justify-center px-4 lg:px-2 py-2 lg:py-4">
        <div className="relative">
          <div className="absolute inset-0 bg-gradient-to-r lg:bg-gradient-to-b from-blue-500 via-purple-500 to-red-500 opacity-50 blur-lg"></div>
          <div className="relative bg-arena-darker px-4 py-2 rounded-full font-black text-xl text-white shadow-lg">
            VS
          </div>
        </div>
      </div>

      {/* Team B */}
      <div className="flex-1 flex flex-col gap-2 p-2 bg-red-500/5 border-2 border-red-500/30 rounded-lg">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-red-400">ÉQUIPE B</h3>
          {isHost && (
            <button
              onClick={() => onAddDebater?.('B')}
              className="p-1 hover:bg-white/5 rounded transition-colors"
              title="Ajouter débatteur"
            >
              <UserPlus className="w-4 h-4 text-red-400" />
            </button>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 gap-2">
          {teamB.map((debater) => (
            <DebaterCard 
              key={debater.id} 
              debater={debater} 
              isHost={isHost}
              isActiveSpeaker={activeSpeakerId === debater.id}
              timeRemaining={timeRemaining}
              onRemove={onRemoveDebater}
              onToggleMute={onToggleMute}
              onVolumeChange={onVolumeChange}
              teamColor="red"
            />
          ))}
          
          {teamB.length === 0 && (
            <div className="flex items-center justify-center h-full border-2 border-dashed border-red-500/30 rounded-lg">
              <div className="text-center text-gray-500">
                <div className="text-2xl mb-2">👥</div>
                <p className="text-xs">En attente de débatteurs</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DebaterCard({ 
  debater, 
  isHost,
  isActiveSpeaker,
  timeRemaining,
  onRemove,
  onToggleMute,
  onVolumeChange,
  teamColor 
}: { 
  debater: Debater; 
  isHost: boolean;
  isActiveSpeaker?: boolean;
  timeRemaining?: number;
  onRemove?: (debaterId: string) => void;
  onToggleMute?: (debaterId: string) => void;
  onVolumeChange?: (debaterId: string, volume: number) => void;
  teamColor: 'blue' | 'red';
}) {
  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  
  const borderColor = teamColor === 'blue' ? 'border-blue-500/50' : 'border-red-500/50';
  const bgColor = teamColor === 'blue' ? 'bg-blue-500/10' : 'bg-red-500/10';
  const activeBorderColor = teamColor === 'blue' ? 'border-blue-400' : 'border-red-400';

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isLowVolume = debater.volume <= 15;
  const isMuted = debater.volume === 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ 
        opacity: 1, 
        scale: isActiveSpeaker ? 1.02 : 1,
      }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={`relative ${bgColor} border-2 ${isActiveSpeaker ? activeBorderColor + ' shadow-lg' : borderColor} rounded-lg p-2 min-h-[120px] transition-all`}
    >
      {/* Active Speaker Timer Icon */}
      {isActiveSpeaker && timeRemaining !== undefined && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute top-2 left-2 z-10 pointer-events-none"
        >
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full font-bold text-sm backdrop-blur-sm border-2 ${
            timeRemaining === 0
              ? 'bg-red-500/90 border-red-600 text-white animate-pulse'
              : timeRemaining <= 10 
                ? 'bg-red-500/80 border-red-500 text-white animate-pulse-fast' 
                : timeRemaining <= 30 
                  ? 'bg-orange-500/80 border-orange-400 text-white'
                  : timeRemaining <= 60
                    ? 'bg-yellow-500/80 border-yellow-400 text-white'
                    : 'bg-green-500/80 border-green-400 text-white'
          }`}>
            <div className="flex items-center gap-1">
              <span className="text-lg">🎤</span>
              <span className="font-mono font-black tracking-wider">
                {formatTime(timeRemaining)}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Remove button (host only) */}
      {isHost && !debater.isHost && (
        <button
          onClick={() => onRemove?.(debater.id)}
          className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors z-20"
        >
          <X className="w-3 h-3" />
        </button>
      )}

      {/* Video placeholder */}
      <div className="relative h-full bg-arena-dark rounded overflow-hidden mb-2">
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-12 h-12 mx-auto mb-1 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-lg font-bold">
              {debater.avatar || debater.name.charAt(0)}
            </div>
            {!debater.videoEnabled && (
              <CameraOff className="w-4 h-4 text-gray-500 mx-auto" />
            )}
          </div>
        </div>

        {/* Name & Controls overlay */}
        <div className="absolute bottom-1 left-1 right-1 space-y-1">
          {/* Volume indicator */}
          {isLowVolume && !isMuted && (
            <div className="bg-orange-500/90 px-2 py-0.5 rounded text-xs font-bold text-center">
              🔉 Volume réduit ({debater.volume}%)
            </div>
          )}
          
          <div className="bg-black/70 backdrop-blur-sm px-2 py-1 rounded flex items-center justify-between">
            <div className="flex items-center gap-1 flex-1 min-w-0">
              {debater.isHost && (
                <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0" />
              )}
              <span className="text-xs font-bold truncate">{debater.name}</span>
            </div>
            
            <div className="flex gap-1">
              <div className={`w-5 h-5 flex items-center justify-center rounded ${
                debater.videoEnabled ? 'bg-white/20' : 'bg-red-500/70'
              }`}>
                {debater.videoEnabled ? (
                  <Camera className="w-3 h-3" />
                ) : (
                  <CameraOff className="w-3 h-3" />
                )}
              </div>
              
              {/* Micro button - clickable by host */}
              {isHost ? (
                <button
                  onClick={() => onToggleMute?.(debater.id)}
                  className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                    isMuted ? 'bg-red-500/70 hover:bg-red-500' : 
                    isLowVolume ? 'bg-orange-500/70 hover:bg-orange-500' :
                    'bg-white/20 hover:bg-white/30'
                  }`}
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted ? (
                    <MicOff className="w-3 h-3" />
                  ) : (
                    <Mic className="w-3 h-3" />
                  )}
                </button>
              ) : (
                <div className={`w-5 h-5 flex items-center justify-center rounded ${
                  isMuted ? 'bg-red-500/70' : 
                  isLowVolume ? 'bg-orange-500/70' :
                  'bg-white/20'
                }`}>
                  {isMuted ? (
                    <MicOff className="w-3 h-3" />
                  ) : (
                    <Mic className="w-3 h-3" />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
