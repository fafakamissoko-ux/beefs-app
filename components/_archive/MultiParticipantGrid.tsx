'use client';

import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { Mic, MicOff, Volume2, Users } from 'lucide-react';

interface Participant {
  id: string;
  name: string;
  avatar?: string;
  isMainParticipant: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

interface MultiParticipantGridProps {
  participants: Participant[];
  mediatorId: string;
  currentUserId: string;
  onInviteParticipant?: () => void;
  onToggleMute?: (participantId: string) => void;
  onRemoveParticipant?: (participantId: string) => void;
}

export function MultiParticipantGrid({
  participants,
  mediatorId,
  currentUserId,
  onInviteParticipant,
  onToggleMute,
  onRemoveParticipant,
}: MultiParticipantGridProps) {
  const isMediator = currentUserId === mediatorId;
  const participantCount = participants.length;

  // Dynamic grid layout based on participant count - RESPONSIVE
  const getGridClasses = () => {
    switch (participantCount) {
      case 1:
        return 'grid-cols-1';
      case 2:
        return 'grid-cols-1 sm:grid-cols-2';
      case 3:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      case 4:
        return 'grid-cols-1 sm:grid-cols-2';
      case 5:
      case 6:
        return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';
      default:
        return 'grid-cols-1 sm:grid-cols-2';
    }
  };

  return (
    <div className="relative w-full h-full">
      {/* Mediator Bubble - Center (like TikTok) */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-30 pointer-events-none">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="relative flex flex-col items-center pointer-events-auto"
        >
          {/* Mediator Avatar Bubble */}
          <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-gradient-to-br from-cobalt-500 via-ember-500 to-obsidian p-1 shadow-2xl">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-2xl sm:text-3xl lg:text-4xl">
              🎭
            </div>
          </div>
          
          {/* Mediator Badge */}
          <div className="mt-2 bg-gradient-to-r from-cobalt-600 to-ember-500 px-3 py-1 rounded-[2px] shadow-lg">
            <span className="text-[10px] font-black text-white sm:text-xs">MÉDIATEUR</span>
          </div>
        </motion.div>
      </div>

      {/* Participants Grid - Only participants, no mediator */}
      <div className={`grid ${getGridClasses()} gap-2 sm:gap-4 h-full p-2 sm:p-4 auto-rows-fr`}>
        <AnimatePresence mode="popLayout">
          {participants.map((participant, index) => (
            <motion.div
              key={participant.id}
              layout
              initial={{ opacity: 0, scale: 0.92, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: -12 }}
              transition={{
                type: 'spring',
                stiffness: 380,
                damping: 28,
                delay: index * 0.05,
              }}
              className={`relative min-h-[200px] overflow-hidden rounded-[2px] border bg-gradient-to-br from-obsidian-900 via-[#0c0c0f] to-black shadow-chrome sm:min-h-[250px] lg:min-h-[300px] ${
                participant.isSpeaking
                  ? 'border-cobalt-400/55'
                  : participant.isMainParticipant
                    ? 'border-ember-500/65'
                    : 'border-white/10'
              }`}
            >
            {/* Badge TOP - REMOVED - Border is enough to show who's in beef */}

            {/* Video placeholder / Avatar */}
            <div className="relative w-full h-full flex items-center justify-center bg-black/50">
              {participant.avatar ? (
                <Image
                  src={participant.avatar}
                  alt={participant.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 640px) 100vw, 400px"
                />
              ) : (
                <div className="text-6xl">
                  {participant.isMainParticipant ? '🔥' : '👤'}
                </div>
              )}
            </div>

            {participant.isSpeaking && (
              <motion.div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[6] rounded-[2px] animate-neon-pulse"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            )}

            {/* Participant Info Overlay - More space */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/70 to-transparent p-2 sm:p-3">
              <div className="frosted-titanium rounded-[2px] px-2 py-1.5 sm:px-2.5 sm:py-2">
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold tracking-tight text-white sm:text-sm">
                    {participant.name}
                  </span>

                  {/* Controls */}
                  <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                    {participant.isMuted ? (
                      <MicOff className="w-3 h-3 sm:w-4 sm:h-4 text-red-400" />
                    ) : (
                      <Mic className="w-3 h-3 sm:w-4 sm:h-4 text-green-400" />
                    )}
                  </div>
                </div>
              </div>
            </div>
            </div>

            {/* Speaking indicator */}
            {participant.isSpeaking && (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                className="frosted-titanium absolute right-2 top-2 z-[8] flex items-center gap-1.5 rounded-full px-2.5 py-1"
              >
                <motion.span
                  className="h-2 w-2 rounded-full bg-accent"
                  animate={{ scale: [1, 1.35, 1], opacity: [1, 0.65, 1] }}
                  transition={{ duration: 1.2, repeat: Infinity }}
                />
                <Volume2 className="h-3 w-3 text-accent" />
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-white">
                  Live
                </span>
              </motion.div>
            )}

            {/* Mediator controls */}
            {isMediator && (
              <div className="absolute left-2 top-2 z-[8] flex gap-1">
                <button
                  onClick={() => onToggleMute?.(participant.id)}
                  className="rounded-lg bg-black/60 p-1.5 backdrop-blur-md transition-all hover:bg-black/85"
                >
                  {participant.isMuted ? (
                    <Mic className="w-3 h-3 text-white" />
                  ) : (
                    <MicOff className="w-3 h-3 text-white" />
                  )}
                </button>
                {/* Allow removing ANY participant now */}
                <button
                  onClick={() => onRemoveParticipant?.(participant.id)}
                  className="rounded-lg bg-red-500/75 p-1.5 backdrop-blur-md transition-all hover:bg-red-500"
                >
                  <span className="text-white text-xs font-bold">✕</span>
                </button>
              </div>
            )}
          </motion.div>
          ))}
        </AnimatePresence>

        {/* Add participant button (for mediator) - REMOVED - Already in bottom bar */}
      </div>

      {/* Participant count indicator */}
      <div className="frosted-titanium absolute left-4 top-4 z-10 rounded-full px-3 py-1.5">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-brand-400" />
          <span className="text-sm font-semibold tracking-tight text-white">
            {participantCount}/6 sur le ring
          </span>
        </div>
      </div>
    </div>
  );
}
