'use client';

import { useEffect, useState } from 'react';
import { Clock, Calendar } from 'lucide-react';

interface CountdownProps {
  scheduledAt: string; // ISO date string
  onComplete?: () => void;
}

export function Countdown({ scheduledAt, onComplete }: CountdownProps) {
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    total: number;
  } | null>(null);

  useEffect(() => {
    const calculateTimeLeft = () => {
      const now = new Date().getTime();
      const target = new Date(scheduledAt).getTime();
      const difference = target - now;

      if (difference <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, total: 0 });
        onComplete?.();
        return;
      }

      const days = Math.floor(difference / (1000 * 60 * 60 * 24));
      const hours = Math.floor((difference % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds, total: difference });
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [scheduledAt, onComplete]);

  if (!timeLeft) return null;

  if (timeLeft.total === 0) {
    return (
      <div className="flex items-center gap-2 text-red-500 font-bold text-sm">
        <Clock className="w-4 h-4 animate-pulse" />
        <span>Démarre maintenant!</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Clock className="w-4 h-4 text-blue-400" />
      <div className="flex gap-1 text-sm font-bold">
        {timeLeft.days > 0 && (
          <span className="text-white">
            {timeLeft.days}j
          </span>
        )}
        <span className="text-white">{String(timeLeft.hours).padStart(2, '0')}</span>
        <span className="text-blue-400">:</span>
        <span className="text-white">{String(timeLeft.minutes).padStart(2, '0')}</span>
        <span className="text-blue-400">:</span>
        <span className="text-white">{String(timeLeft.seconds).padStart(2, '0')}</span>
      </div>
    </div>
  );
}
