'use client';

import { useState } from 'react';
import { Settings, Users, Clock, Sliders, Save, Play, Square, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Debater {
  id: string;
  name: string;
  team: 'A' | 'B';
  volume: number;
}

interface HostControlPanelProps {
  isHost: boolean;
  debateMode: '1v1' | 'multi';
  debaters?: Debater[];
  activeSpeakerId?: string | null;
  speakingTimePerDebater?: number;
  onModeChange: (mode: '1v1' | 'multi') => void;
  onStartSpeaking?: (debaterId: string) => void;
  onStopSpeaking?: () => void;
  onSetSpeakingTime?: (seconds: number) => void;
  onReaction?: (emoji: string) => void;
  onSave?: () => void;
}

export function HostControlPanel({ 
  isHost, 
  debateMode, 
  debaters = [],
  activeSpeakerId,
  speakingTimePerDebater = 60,
  onModeChange,
  onStartSpeaking,
  onStopSpeaking,
  onSetSpeakingTime,
  onReaction,
  onSave 
}: HostControlPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!isHost) return null;

  return (
    <div className="relative">
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 rounded-lg transition-colors"
      >
        <Settings className="w-4 h-4" />
        <span className="text-xs font-bold hidden sm:inline">Contrôles Host</span>
      </button>

      {/* Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-full right-0 mt-2 w-80 bg-arena-dark border border-arena-gray rounded-lg shadow-xl z-50"
          >
            <div className="p-4 space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-arena-gray pb-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-5 h-5 text-purple-400" />
                  <h3 className="font-bold">PANNEAU DE CONTRÔLE</h3>
                </div>
                <button
                  onClick={() => setIsOpen(false)}
                  className="text-gray-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Debate Mode */}
              <div>
                <label className="text-xs font-bold text-gray-400 mb-2 block">
                  MODE DE DÉBAT
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => onModeChange('1v1')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                      debateMode === '1v1'
                        ? 'bg-blue-500/20 border-blue-500 text-blue-400'
                        : 'bg-arena-gray border-arena-gray hover:border-blue-500/50'
                    }`}
                  >
                    <Users className="w-6 h-6" />
                    <span className="text-xs font-bold">1 vs 1</span>
                    <span className="text-xs text-gray-500">Classique</span>
                  </button>

                  <button
                    onClick={() => onModeChange('multi')}
                    className={`flex flex-col items-center gap-2 p-3 rounded-lg border transition-all ${
                      debateMode === 'multi'
                        ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                        : 'bg-arena-gray border-arena-gray hover:border-purple-500/50'
                    }`}
                  >
                    <Users className="w-6 h-6" />
                    <span className="text-xs font-bold">Multi</span>
                    <span className="text-xs text-gray-500">Équipes</span>
                  </button>
                </div>
              </div>

              {/* Info */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <div className="flex gap-2">
                  <div className="text-blue-400">ℹ️</div>
                  <div className="text-xs text-gray-300">
                    {debateMode === '1v1' 
                      ? 'Mode classique : 1 host contre 1 challenger'
                      : 'Mode équipes : Plusieurs débatteurs par équipe (2v2, 3v3, etc.)'
                    }
                  </div>
                </div>
              </div>

              {/* Reactions Slider */}
              <div>
                <label className="text-xs font-bold text-gray-400 mb-2 block">
                  RÉACTIONS RAPIDES
                </label>
                <div className="relative">
                  <div 
                    className="overflow-x-auto pb-2" 
                    style={{
                      scrollbarWidth: 'thin',
                      scrollbarColor: 'rgb(168 85 247 / 0.5) rgb(17 24 39)'
                    }}
                  >
                    <div className="flex gap-2">
                      {['👍', '👎', '😂', '🔥', '💯', '👏', '🤔', '😮', '💀', '🎯', '⚡', '💪', '🧠', '👀', '🤯', '😡', '❤️', '🎉', '🙌', '💎', '🌟', '✨', '🚀', '💥', '🎪', '🎭'].map((emoji) => (
                        <motion.button
                          key={emoji}
                          onClick={() => onReaction?.(emoji)}
                          whileHover={{ scale: 1.15 }}
                          whileTap={{ scale: 0.9 }}
                          className="flex-shrink-0 w-12 h-12 flex items-center justify-center text-2xl bg-arena-darker hover:bg-purple-500/20 border border-arena-gray hover:border-purple-500/50 rounded-lg transition-all"
                          title={`Réaction ${emoji}`}
                        >
                          {emoji}
                        </motion.button>
                      ))}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-1 text-center">
                  ← Glissez pour voir toutes les réactions →
                </p>
              </div>

              {/* Turn Management (Multi mode only) */}
              {debateMode === 'multi' && debaters.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-2">
                    <Mic className="w-4 h-4" />
                    GESTION DES TOURS
                  </label>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {debaters.map((debater) => (
                      <div
                        key={debater.id}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all ${
                          activeSpeakerId === debater.id
                            ? 'bg-green-500/20 border-green-500'
                            : 'bg-arena-darker border-arena-gray'
                        }`}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <span className={`w-2 h-2 rounded-full ${
                            activeSpeakerId === debater.id 
                              ? 'bg-green-500 animate-pulse' 
                              : debater.volume <= 15 
                                ? 'bg-orange-500' 
                                : 'bg-gray-500'
                          }`} />
                          <span className="text-xs truncate">{debater.name}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            debater.team === 'A' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {debater.team}
                          </span>
                          {debater.volume <= 15 && debater.volume > 0 && (
                            <span className="text-xs text-orange-400">🔉{debater.volume}%</span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            if (activeSpeakerId === debater.id) {
                              onStopSpeaking?.();
                            } else {
                              onStartSpeaking?.(debater.id);
                            }
                          }}
                          className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                            activeSpeakerId === debater.id
                              ? 'bg-red-500 hover:bg-red-600 text-white'
                              : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/30 text-green-400'
                          }`}
                        >
                          {activeSpeakerId === debater.id ? (
                            <span className="flex items-center gap-1">
                              <Square className="w-3 h-3" /> Stop
                            </span>
                          ) : (
                            <span className="flex items-center gap-1">
                              <Play className="w-3 h-3" /> Start
                            </span>
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                  {activeSpeakerId && (
                    <div className="mt-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-2">
                      <div className="flex gap-2 items-start">
                        <div className="text-yellow-400">⚠️</div>
                        <div className="text-xs text-gray-300">
                          Le volume sera automatiquement réduit à 10% quand le temps expire
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Save Button */}
              <button
                onClick={() => {
                  onSave?.();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 rounded-lg font-bold text-sm transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>Sauvegarder</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
