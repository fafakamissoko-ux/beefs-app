'use client';

import { useState, useEffect } from 'react';
import { Trophy, TrendingUp, Flame, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

interface LeaderboardEntry {
  rank: number;
  userId: string;
  userName: string;
  points: number;
  wins: number;
  streak: number;
}

interface LeaderboardProps {
  roomId?: string;
  limit?: number;
}

export function Leaderboard({ roomId, limit = 10 }: LeaderboardProps) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'points' | 'wins'>('points');

  useEffect(() => {
    loadLeaderboard();
  }, [roomId, tab]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      // Mock data for now - replace with real Supabase query
      const mockData: LeaderboardEntry[] = [
        { rank: 1, userId: '1', userName: 'Débatteur Pro', points: 15420, wins: 42, streak: 7 },
        { rank: 2, userId: '2', userName: 'Logic Master', points: 12350, wins: 38, streak: 3 },
        { rank: 3, userId: '3', userName: 'Argumentor', points: 9870, wins: 29, streak: 5 },
        { rank: 4, userId: '4', userName: 'Le Sage', points: 8230, wins: 25, streak: 2 },
        { rank: 5, userId: '5', userName: 'Rhétorique King', points: 7650, wins: 22, streak: 1 },
      ];
      
      setLeaderboard(mockData);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="w-5 h-5 text-yellow-400" />;
      case 2:
        return <Trophy className="w-5 h-5 text-gray-400" />;
      case 3:
        return <Trophy className="w-5 h-5 text-amber-600" />;
      default:
        return <span className="text-gray-500 font-bold">#{rank}</span>;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-arena-blue"></div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-arena-gray bg-arena-darker">
        <button
          onClick={() => setTab('points')}
          className={`flex-1 px-3 py-2 text-xs font-bold transition-colors ${
            tab === 'points'
              ? 'text-arena-blue border-b-2 border-arena-blue'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          🏆 POINTS
        </button>
        <button
          onClick={() => setTab('wins')}
          className={`flex-1 px-3 py-2 text-xs font-bold transition-colors ${
            tab === 'wins'
              ? 'text-arena-blue border-b-2 border-arena-blue'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          ⚔️ VICTOIRES
        </button>
      </div>

      {/* Leaderboard List */}
      <div className="flex-1 overflow-auto">
        <div className="divide-y divide-arena-gray/30">
          {leaderboard.map((entry, index) => (
            <motion.div
              key={entry.userId}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`p-3 hover:bg-white/5 transition-colors ${
                entry.rank <= 3 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                {/* Rank */}
                <div className="w-8 flex justify-center">
                  {getRankIcon(entry.rank)}
                </div>

                {/* User Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm truncate flex items-center gap-2">
                    {entry.userName}
                    {entry.streak >= 3 && (
                      <span className="flex items-center gap-1 text-xs text-orange-400">
                        <Flame className="w-3 h-3" />
                        {entry.streak}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    {tab === 'points' ? `${entry.points.toLocaleString()} pts` : `${entry.wins} victoires`}
                  </div>
                </div>

                {/* Trend */}
                {entry.rank <= 3 && (
                  <TrendingUp className="w-4 h-4 text-green-400" />
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
