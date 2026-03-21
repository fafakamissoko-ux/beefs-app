'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { BarChart3, Clock } from 'lucide-react';

interface PollOption {
  id: string;
  text: string;
  votes: number;
  color: string;
}

interface LivePollProps {
  question: string;
  options: PollOption[];
  onVote: (optionId: string) => void;
  hasVoted?: boolean;
  timeRemaining?: number;
  totalVotes: number;
}

export function LivePoll({
  question,
  options,
  onVote,
  hasVoted = false,
  timeRemaining,
  totalVotes,
}: LivePollProps) {
  const getPercentage = (votes: number) => {
    return totalVotes > 0 ? Math.round((votes / totalVotes) * 100) : 0;
  };

  return (
    <div className="bg-arena-darker/80 backdrop-blur-sm rounded-lg p-3 border border-arena-gray/50">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-2 flex-1">
          <BarChart3 className="w-4 h-4 text-arena-blue mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-bold text-xs mb-1 text-gray-400">SONDAGE</h3>
            <p className="text-xs text-white">{question}</p>
          </div>
        </div>
        
        {timeRemaining && timeRemaining > 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            {timeRemaining}s
          </div>
        )}
      </div>

      {/* Options */}
      <div className="space-y-1.5">
        {options.map((option) => {
          const percentage = getPercentage(option.votes);

          return (
            <button
              key={option.id}
              onClick={() => !hasVoted && onVote(option.id)}
              disabled={hasVoted}
              className={`w-full relative overflow-hidden rounded border transition-all ${
                hasVoted
                  ? 'cursor-default border-arena-gray/50'
                  : 'cursor-pointer border-arena-gray hover:border-arena-blue'
              }`}
            >
              {/* Progress Bar */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                transition={{ duration: 0.5, ease: 'easeOut' }}
                className="absolute inset-0 opacity-30"
                style={{ backgroundColor: option.color }}
              />

              {/* Content */}
              <div className="relative px-3 py-2 flex items-center justify-between">
                <span className="font-medium text-xs">{option.text}</span>
                {hasVoted && (
                  <span className="font-bold text-xs" style={{ color: option.color }}>
                    {percentage}%
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-2 text-xs text-gray-500 text-center">
        {totalVotes.toLocaleString()} vote{totalVotes !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
