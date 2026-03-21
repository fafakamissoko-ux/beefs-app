'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Eye, Settings, Users as UsersIcon } from 'lucide-react';
import { MultiParticipantGrid } from '@/components/MultiParticipantGrid';
import { InviteParticipantModal } from '@/components/InviteParticipantModal';

interface RingParticipant {
  id: string;
  name: string;
  avatar?: string;
  isMainParticipant: boolean;
  isSpeaking?: boolean;
  isMuted?: boolean;
}

export default function RingPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  
  // Mock data - Replace with real data
  const currentUserId = 'mediator1';
  const mediatorId = 'mediator1';
  
  const [ringParticipants, setRingParticipants] = useState<RingParticipant[]>([
    { 
      id: 'p1', 
      name: 'Jean (Accusé)', 
      isMainParticipant: true, 
      isSpeaking: false, 
      isMuted: false 
    },
    { 
      id: 'p2', 
      name: 'Marc (Accusateur)', 
      isMainParticipant: true, 
      isSpeaking: true, 
      isMuted: false 
    },
  ]);
  
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [viewerCount] = useState(2341);
  const [beefTitle] = useState('Conflit: Idée de startup volée');

  const handleInviteParticipant = (userId: string) => {
    // Mock: Add new participant to the ring
    const newParticipant: RingParticipant = {
      id: userId,
      name: `Participant ${ringParticipants.length + 1}`,
      avatar: '👤',
      isMainParticipant: false,
      isSpeaking: false,
      isMuted: true, // Muted by default when joining
    };
    
    setRingParticipants([...ringParticipants, newParticipant]);
  };

  const handleToggleMute = (participantId: string) => {
    setRingParticipants(ringParticipants.map(p => 
      p.id === participantId ? { ...p, isMuted: !p.isMuted } : p
    ));
  };

  const handleRemoveParticipant = (participantId: string) => {
    setRingParticipants(ringParticipants.filter(p => p.id !== participantId));
  };

  // Auto-switch speaker every 10 seconds (demo)
  useEffect(() => {
    const interval = setInterval(() => {
      setRingParticipants(prev => {
        const speakingIndex = prev.findIndex(p => p.isSpeaking);
        return prev.map((p, i) => ({
          ...p,
          isSpeaking: i === (speakingIndex + 1) % prev.length,
        }));
      });
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 top-16 bg-black overflow-hidden">
      {/* Top Overlay - Info */}
      <div className="absolute top-0 left-0 right-0 z-10 bg-gradient-to-b from-black/80 to-transparent p-2 sm:p-4">
        <div className="flex items-center justify-between">
          {/* Beef Title */}
          <div className="flex-1 min-w-0">
            <h1 className="text-white font-black text-sm sm:text-lg truncate">
              🔥 {beefTitle}
            </h1>
            <p className="text-gray-400 text-xs sm:text-sm">Session en direct</p>
          </div>

          {/* Viewer Count */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1 sm:gap-2 bg-red-500/20 backdrop-blur-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-full border border-red-500">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <Eye className="w-3 h-3 sm:w-4 sm:h-4 text-white" />
              <span className="text-white font-bold text-xs sm:text-base">{viewerCount.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Participants Grid */}
      <div className="w-full h-full pt-16 sm:pt-20 pb-24 sm:pb-32">
        <MultiParticipantGrid
          participants={ringParticipants}
          mediatorId={mediatorId}
          currentUserId={currentUserId}
          onInviteParticipant={() => setShowInviteModal(true)}
          onToggleMute={handleToggleMute}
          onRemoveParticipant={handleRemoveParticipant}
        />
      </div>

      {/* Bottom Overlay - Mediator Controls */}
      {currentUserId === mediatorId && (
        <div className="absolute bottom-0 left-0 right-0 z-10 bg-gradient-to-t from-black/90 to-transparent p-2 sm:p-4">
          <div className="max-w-7xl mx-auto">
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 sm:p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center justify-center">
                    🎭
                  </div>
                  <div>
                    <p className="text-white font-bold">Mode Médiateur</p>
                    <p className="text-gray-400 text-sm">Tu gères cette session</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg font-semibold text-black transition-colors"
                  >
                    <UsersIcon className="w-4 h-4" />
                    <span>Inviter</span>
                  </button>
                  
                  <button className="p-2 bg-white/10 hover:bg-white/20 rounded-lg transition-colors">
                    <Settings className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/10">
                <div>
                  <p className="text-gray-400 text-xs">Sur le ring</p>
                  <p className="text-white font-bold">{ringParticipants.length}/6</p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Parole à</p>
                  <p className="text-white font-bold">
                    {ringParticipants.find(p => p.isSpeaking)?.name || 'Personne'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400 text-xs">Témoins</p>
                  <p className="text-white font-bold">{viewerCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <InviteParticipantModal
        isOpen={showInviteModal}
        onClose={() => setShowInviteModal(false)}
        onInvite={handleInviteParticipant}
        currentParticipants={ringParticipants.map(p => p.id)}
      />

      {/* Demo Info */}
      <div className="absolute top-24 right-4 z-20 bg-blue-500/20 backdrop-blur-sm border border-blue-500 rounded-lg p-4 max-w-xs">
        <p className="text-blue-400 font-bold text-sm mb-2">🎯 DEMO - Système Multi-Participants</p>
        <ul className="text-white text-xs space-y-1">
          <li>✅ 2-6 personnes sur le ring</li>
          <li>✅ Layout adaptatif automatique</li>
          <li>✅ Inviter des participants (bouton +)</li>
          <li>✅ Mute/unmute par le médiateur</li>
          <li>✅ Retirer des participants</li>
          <li>✅ Indicateur de qui parle</li>
        </ul>
      </div>
    </div>
  );
}
