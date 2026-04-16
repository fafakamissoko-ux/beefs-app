'use client';

import { useState, useEffect, useCallback } from 'react';

interface UsePointsSystemOptions {
  userId: string;
  roomId: string;
  initialPoints?: number;
}

export function usePointsSystem({ userId, roomId, initialPoints = 1000 }: UsePointsSystemOptions) {
  const [points, setPoints] = useState(initialPoints);
  const [pointsEarned, setPointsEarned] = useState(0);

  // Passive points earning - watching the stream
  useEffect(() => {
    const interval = setInterval(() => {
      // Earn 10 points every minute for watching
      addPoints(10, 'Regarder le stream');
    }, 60000); // Every 60 seconds

    return () => clearInterval(interval);
  }, []);

  const addPoints = useCallback((amount: number, _reason?: string) => {
    setPoints(prev => prev + amount);
    setPointsEarned(prev => prev + amount);
  }, []);

  const spendPoints = useCallback((amount: number, _reason?: string): boolean => {
    if (amount > points) {
      return false; // Not enough points
    }
    
    setPoints(prev => prev - amount);

    return true;
  }, [points]);

  const hasEnoughPoints = useCallback((amount: number): boolean => {
    return points >= amount;
  }, [points]);

  return {
    points,
    pointsEarned,
    addPoints,
    spendPoints,
    hasEnoughPoints,
  };
}
