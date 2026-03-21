import { motion } from 'framer-motion';
import { Mic, MicOff, Volume2, VolumeX, UserPlus, Users } from 'lucide-react';

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
          <div className="w-16 h-16 sm:w-20 sm:h-20 lg:w-24 lg:h-24 rounded-full bg-gradient-to-br from-yellow-400 via-orange-500 to-red-500 p-1 shadow-2xl">
            <div className="w-full h-full rounded-full bg-black flex items-center justify-center text-2xl sm:text-3xl lg:text-4xl">
              🎭
            </div>
          </div>
          
          {/* Mediator Badge */}
          <div className="mt-2 bg-gradient-to-r from-yellow-400 to-orange-500 px-3 py-1 rounded-full shadow-lg">
            <span className="text-black text-[10px] sm:text-xs font-black">MÉDIATEUR</span>
          </div>
        </motion.div>
      </div>

      {/* Participants Grid - Only participants, no mediator */}
      <div className={`grid ${getGridClasses()} gap-2 sm:gap-4 h-full p-2 sm:p-4 auto-rows-fr`}>
        {participants.map((participant, index) => (
          <motion.div
            key={participant.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: index * 0.1 }}
            className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl overflow-hidden border-2 min-h-[200px] sm:min-h-[250px] lg:min-h-[300px] ${
              participant.isSpeaking
                ? 'border-red-500 shadow-lg shadow-red-500/50'
                : participant.isMainParticipant
                ? 'border-orange-500'
                : 'border-gray-700'
            }`}
          >
            {/* Badge TOP - REMOVED - Border is enough to show who's in beef */}

            {/* Video placeholder / Avatar */}
            <div className="w-full h-full flex items-center justify-center bg-black/50">
              {participant.avatar ? (
                <img
                  src={participant.avatar}
                  alt={participant.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="text-6xl">
                  {participant.isMainParticipant ? '🔥' : '👤'}
                </div>
              )}
            </div>

            {/* Participant Info Overlay - More space */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 sm:p-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-white font-bold text-xs sm:text-sm truncate">
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

            {/* Speaking indicator */}
            {participant.isSpeaking && (
              <motion.div
                animate={{
                  opacity: [0.5, 1, 0.5],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                }}
                className="absolute top-2 right-2 flex items-center gap-1 bg-red-500 px-2 py-1 rounded-full"
              >
                <Volume2 className="w-3 h-3 text-white" />
                <span className="text-white text-xs font-bold">PARLE</span>
              </motion.div>
            )}

            {/* Mediator controls */}
            {isMediator && (
              <div className="absolute top-2 left-2 flex gap-1">
                <button
                  onClick={() => onToggleMute?.(participant.id)}
                  className="p-1.5 bg-black/70 hover:bg-black/90 rounded-lg transition-all"
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
                  className="p-1.5 bg-red-500/70 hover:bg-red-500/90 rounded-lg transition-all"
                >
                  <span className="text-white text-xs font-bold">✕</span>
                </button>
              </div>
            )}
          </motion.div>
        ))}

        {/* Add participant button (for mediator) - REMOVED - Already in bottom bar */}
      </div>

      {/* Participant count indicator */}
      <div className="absolute top-4 left-4 z-10 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full border border-gray-700">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-orange-400" />
          <span className="text-white font-bold text-sm">
            {participantCount}/6 sur le ring
          </span>
        </div>
      </div>
    </div>
  );
}
