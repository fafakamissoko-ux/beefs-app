'use client';

import { useState } from 'react';
import { Camera, CameraOff, Mic, MicOff, Crown, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
  badges?: string[];
}

interface ArenaLayoutProps {
  host: Participant;
  challenger: Participant | null;
}

export function ArenaLayout({ host, challenger }: ArenaLayoutProps) {
  return (
    <div className="w-full h-full flex flex-row bg-arena-darker">
      {/* Main Arena - Split Screen */}
      <div className="flex-1 flex flex-row min-h-0">
        {/* Host Side */}
        <ParticipantView 
          participant={host} 
          side="left"
          label="HOST"
        />

        {/* VS Divider */}
        <div className="relative flex items-center justify-center w-1 bg-arena-dark">
          <div className="absolute inset-0 bg-gradient-to-r from-arena-blue via-arena-purple to-arena-red opacity-50" />
          <div className="relative z-10 bg-arena-darker px-1.5 py-3 rounded-full -ml-3 -mr-3">
            <span className="text-xl font-black neon-purple rotate-0 block" style={{writingMode: 'vertical-rl'}}>
              VS
            </span>
          </div>
        </div>

        {/* Challenger Side */}
        {challenger ? (
          <ParticipantView 
            participant={challenger} 
            side="right"
            label="CHALLENGER"
          />
        ) : (
          <EmptySlot />
        )}
      </div>
    </div>
  );
}

function ParticipantView({ 
  participant, 
  side, 
  label 
}: { 
  participant: Participant; 
  side: 'left' | 'right';
  label: string;
}) {
  const borderColor = side === 'left' ? 'border-arena-blue' : 'border-arena-red';
  const bgColor = side === 'left' ? 'bg-arena-blue/10' : 'bg-arena-red/10';

  return (
    <div className={`flex-1 relative ${bgColor} border-2 ${borderColor} p-2`}>
      {/* Video Placeholder */}
      <div className="relative h-full bg-arena-dark rounded-lg overflow-hidden">
        {/* Simulated video feed */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-2 bg-gradient-to-br from-gray-700 to-gray-900 rounded-full flex items-center justify-center text-2xl font-bold">
              {participant.name.charAt(0)}
            </div>
            {!participant.videoEnabled && (
              <CameraOff className="w-6 h-6 text-gray-500 mx-auto" />
            )}
          </div>
        </div>

        {/* Participant Info Overlay */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between">
          <div className="bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5">
              {participant.isHost && (
                <Crown className="w-4 h-4 text-yellow-400" />
              )}
              <span className="font-bold text-sm">{participant.name}</span>
            </div>
            <div className="text-xs text-gray-400">{label}</div>
          </div>

          {/* Badges */}
          <div className="flex gap-1">
            {participant.badges?.includes('controversial') && (
              <div className="bg-arena-red/90 px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />
                <span className="hidden sm:inline">CONTROVERSIAL</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls Overlay */}
        <div className="absolute bottom-2 left-2 right-2 flex justify-center gap-2">
          <ControlButton 
            icon={participant.videoEnabled ? Camera : CameraOff} 
            active={participant.videoEnabled}
          />
          <ControlButton 
            icon={participant.audioEnabled ? Mic : MicOff} 
            active={participant.audioEnabled}
          />
        </div>
      </div>
    </div>
  );
}

function EmptySlot() {
  return (
    <div className="flex-1 relative bg-arena-red/5 border-2 border-arena-red border-dashed p-2">
      <div className="h-full flex items-center justify-center text-center">
        <div>
          <div className="w-20 h-20 mx-auto mb-3 border-4 border-dashed border-arena-red/30 rounded-full flex items-center justify-center">
            <span className="text-3xl">🎯</span>
          </div>
          <h3 className="text-lg font-bold text-gray-400 mb-1">
            En Attente de Challenger
          </h3>
          <p className="text-sm text-gray-500">
            Rejoignez la file d'attente pour défier le host
          </p>
        </div>
      </div>
    </div>
  );
}

function ControlButton({ 
  icon: Icon, 
  active 
}: { 
  icon: React.ElementType; 
  active: boolean;
}) {
  return (
    <button
      className={`p-2 rounded-full transition-all ${
        active 
          ? 'bg-white/20 hover:bg-white/30' 
          : 'bg-red-500/70 hover:bg-red-500/90'
      }`}
    >
      <Icon className="w-4 h-4" />
    </button>
  );
}
