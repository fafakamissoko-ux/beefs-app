'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Target, TrendingUp, Users } from 'lucide-react';

interface Prediction {
  id: string;
  question: string;
  options: PredictionOption[];
  status: 'active' | 'locked' | 'resolved';
  userPrediction?: string;
  pointsWagered?: number;
}

interface PredictionOption {
  id: string;
  text: string;
  odds: number;
  totalPoints: number;
  color: string;
}

interface PredictionSystemProps {
  prediction: Prediction;
  userPoints: number;
  onPredict: (optionId: string, points: number) => void;
}

export function PredictionSystem({
  prediction,
  userPoints,
  onPredict,
}: PredictionSystemProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [wagerAmount, setWagerAmount] = useState(100);

  const totalPoints = prediction.options.reduce((sum, opt) => sum + opt.totalPoints, 0);

  const getPercentage = (points: number) => {
    return totalPoints > 0 ? Math.round((points / totalPoints) * 100) : 50;
  };

  const handlePredict = () => {
    if (selectedOption && wagerAmount > 0) {
      onPredict(selectedOption, wagerAmount);
    }
  };

  const quickAmounts = [100, 500, 1000, userPoints];

  return (
    <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 backdrop-blur-sm rounded-lg p-3 border border-purple-500/30">
      {/* Header */}
      <div className="flex items-start gap-2 mb-3">
        <Target className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-xs text-gray-400">PRÉDICTION</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              prediction.status === 'active'
                ? 'bg-green-500/20 text-green-400'
                : prediction.status === 'locked'
                ? 'bg-yellow-500/20 text-yellow-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}>
              {prediction.status === 'active' ? 'EN COURS' : 
               prediction.status === 'locked' ? 'VERROUILLÉ' : 'TERMINÉ'}
            </span>
          </div>
          <p className="text-xs text-white">{prediction.question}</p>
        </div>
      </div>

      {/* Options */}
      <div className="space-y-1.5 mb-3">
        {prediction.options.map((option) => {
          const percentage = getPercentage(option.totalPoints);
          const isSelected = selectedOption === option.id;
          const hasUserPrediction = prediction.userPrediction === option.id;

          return (
            <button
              key={option.id}
              onClick={() => setSelectedOption(option.id)}
              disabled={prediction.status !== 'active' || !!prediction.userPrediction}
              className={`w-full relative overflow-hidden rounded-lg border transition-all ${
                isSelected
                  ? 'border-purple-400 bg-purple-500/10'
                  : hasUserPrediction
                  ? 'border-green-400 bg-green-500/10'
                  : 'border-purple-500/30 hover:border-purple-400'
              } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {/* Progress Bar */}
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${percentage}%` }}
                className="absolute inset-0 opacity-20"
                style={{ backgroundColor: option.color }}
              />

              {/* Content */}
              <div className="relative px-3 py-2">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="font-medium text-xs flex items-center gap-1">
                    {option.text}
                    {hasUserPrediction && (
                      <span className="text-xs text-green-400">✓</span>
                    )}
                  </span>
                  <span className="text-xs font-bold" style={{ color: option.color }}>
                    {option.odds}x
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>{percentage}%</span>
                  <span>{option.totalPoints.toLocaleString()} pts</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Wager Section */}
      {prediction.status === 'active' && !prediction.userPrediction && (
        <div className="space-y-3 pt-3 border-t border-purple-500/30">
          <div>
            <label className="text-xs font-bold text-gray-400 mb-2 block">
              MONTANT DU PARI
            </label>
            <input
              type="range"
              min="10"
              max={userPoints}
              step="10"
              value={wagerAmount}
              onChange={(e) => setWagerAmount(Number(e.target.value))}
              className="w-full accent-purple-500"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>10</span>
              <span className="font-bold text-purple-400">{wagerAmount} pts</span>
              <span>{userPoints}</span>
            </div>
          </div>

          {/* Quick Amounts */}
          <div className="flex gap-2">
            {quickAmounts.map((amount) => (
              <button
                key={amount}
                onClick={() => setWagerAmount(Math.min(amount, userPoints))}
                className="flex-1 px-2 py-1 text-xs font-bold bg-purple-500/20 hover:bg-purple-500/30 rounded border border-purple-500/30 transition-colors"
              >
                {amount === userPoints ? 'MAX' : amount}
              </button>
            ))}
          </div>

          {/* Potential Win */}
          {selectedOption && (
            <div className="bg-purple-500/10 rounded p-2 text-center">
              <div className="text-xs text-gray-400">Gain potentiel</div>
              <div className="text-lg font-bold text-purple-400">
                {Math.round(
                  wagerAmount *
                    (prediction.options.find((o) => o.id === selectedOption)?.odds || 1)
                ).toLocaleString()}{' '}
                pts
              </div>
            </div>
          )}

          {/* Submit Button */}
          <button
            onClick={handlePredict}
            disabled={!selectedOption || wagerAmount <= 0}
            className="w-full py-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 disabled:from-gray-600 disabled:to-gray-600 rounded-lg font-bold text-sm transition-all disabled:cursor-not-allowed"
          >
            PARIER {wagerAmount} POINTS
          </button>
        </div>
      )}

      {/* User Prediction */}
      {prediction.userPrediction && (
        <div className="pt-3 border-t border-purple-500/30">
          <div className="bg-green-500/10 border border-green-500/30 rounded p-3">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="font-bold text-xs">VOTRE PRÉDICTION</span>
            </div>
            <div className="text-sm">
              {prediction.options.find((o) => o.id === prediction.userPrediction)?.text}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {prediction.pointsWagered} points misés
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
