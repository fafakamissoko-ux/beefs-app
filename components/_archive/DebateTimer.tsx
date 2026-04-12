'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Clock, Settings } from 'lucide-react';

interface DebateTimerProps {
  isHost: boolean;
  onTimeUpdate?: (remainingTime: number) => void;
}

export function DebateTimer({ isHost, onTimeUpdate }: DebateTimerProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(180); // 3 minutes par défaut
  const [totalTime, setTotalTime] = useState(180);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining((prev) => {
          const newTime = prev - 1;
          onTimeUpdate?.(newTime);
          return newTime;
        });
      }, 1000);
    }

    if (timeRemaining === 0) {
      setIsRunning(false);
      // Play sound or alert
    }

    return () => clearInterval(interval);
  }, [isRunning, timeRemaining, onTimeUpdate]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleReset = () => {
    setIsRunning(false);
    setTimeRemaining(totalTime);
  };

  const percentage = (timeRemaining / totalTime) * 100;
  const isWarning = percentage <= 25;
  const isCritical = percentage <= 10;

  const presetTimes = [60, 120, 180, 300, 600, 900, 1800]; // 1min à 30min

  return (
    <div className="bg-arena-dark/95 backdrop-blur-sm border border-arena-gray rounded-lg p-3">
      {/* Timer Display */}
      <div className="flex items-center gap-3 mb-3">
        <Clock className={`w-5 h-5 ${isCritical ? 'text-red-500 animate-pulse' : isWarning ? 'text-yellow-500' : 'text-blue-500'}`} />
        
        <div className="flex-1">
          <div className="text-xs text-gray-400 mb-1">TEMPS DE PAROLE</div>
          <div className={`text-2xl font-black font-mono ${isCritical ? 'text-red-500 animate-pulse' : isWarning ? 'text-yellow-500' : 'text-white'}`}>
            {formatTime(timeRemaining)}
          </div>
        </div>

        {isHost && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 hover:bg-white/5 rounded transition-colors"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      <div className="relative h-2 bg-arena-darker rounded-full overflow-hidden mb-3">
        <motion.div
          className={`absolute left-0 top-0 bottom-0 ${
            isCritical 
              ? 'bg-red-500' 
              : isWarning 
                ? 'bg-yellow-500' 
                : 'bg-gradient-to-r from-blue-500 to-cyan-500'
          }`}
          initial={{ width: '100%' }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Host Controls */}
      {isHost && (
        <div className="flex gap-2">
          <button
            onClick={() => setIsRunning(!isRunning)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-bold text-sm transition-all ${
              isRunning
                ? 'bg-yellow-500 hover:bg-yellow-600 text-black'
                : 'bg-green-500 hover:bg-green-600 text-white'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>Start</span>
              </>
            )}
          </button>

          <button
            onClick={handleReset}
            className="px-4 py-2 bg-arena-gray hover:bg-arena-gray/80 rounded-lg transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Settings Panel */}
      <AnimatePresence>
        {showSettings && isHost && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-arena-gray"
          >
            <div className="text-xs font-bold text-gray-400 mb-2">DURÉE PRÉDÉFINIE</div>
            <div className="grid grid-cols-4 gap-1">
              {presetTimes.map((time) => (
                <button
                  key={time}
                  onClick={() => {
                    setTotalTime(time);
                    setTimeRemaining(time);
                    setIsRunning(false);
                  }}
                  className={`px-2 py-1 text-xs font-bold rounded transition-colors ${
                    totalTime === time
                      ? 'bg-blue-500 text-white'
                      : 'bg-arena-gray hover:bg-arena-gray/80'
                  }`}
                >
                  {time < 60 ? `${time}s` : `${Math.floor(time / 60)}m`}
                </button>
              ))}
            </div>

            <div className="mt-2">
              <label className="text-xs text-gray-400 block mb-1">Personnalisé (secondes)</label>
              <input
                type="number"
                min="10"
                max="3600"
                value={totalTime}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 60;
                  setTotalTime(val);
                  setTimeRemaining(val);
                }}
                className="w-full px-2 py-1 bg-arena-darker border border-arena-gray rounded text-sm"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning Message */}
      {isCritical && isRunning && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-2 text-center text-xs text-red-400 font-bold animate-pulse"
        >
          ⏰ TEMPS PRESQUE ÉCOULÉ !
        </motion.div>
      )}
    </div>
  );
}
