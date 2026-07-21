import React from 'react';

interface PremiumNotificationBadgeProps {
  count: number;
  compact?: boolean;
  variant?: 'amber' | 'red' | 'cyan';
}

export function PremiumNotificationBadge({
  count,
  compact = false,
  variant = 'red',
}: PremiumNotificationBadgeProps) {
  if (count <= 0) return null;

  const displayCount = count > 99 ? '99+' : count;

  const colors = {
    amber: 'bg-amber-500/20 border-amber-500/50 text-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.6)]',
    red: 'bg-red-500/20 border-red-500/50 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.6)]',
    cyan: 'bg-cyan-500/20 border-cyan-500/50 text-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)]',
  };

  const halos = {
    amber: 'bg-amber-500',
    red: 'bg-red-500',
    cyan: 'bg-cyan-500',
  };

  const sizeClasses = compact
    ? 'h-3.5 min-w-[14px] px-1 text-[9px] -top-1 -right-1'
    : 'h-4.5 min-w-[18px] px-1.5 text-[10px] -top-1.5 -right-1.5';

  return (
    <div className={`absolute z-[50] flex items-center justify-center rounded-full border backdrop-blur-md font-black ${colors[variant]} ${sizeClasses}`}>
      {/* Impulsion Lumineuse (Pulse) */}
      <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${halos[variant]}`} aria-hidden />
      {/* Compteur Quantitatif */}
      <span className="relative z-10 drop-shadow-md">{displayCount}</span>
    </div>
  );
}
