import React from 'react';

interface PremiumNotificationBadgeProps {
  count: number;
  compact?: boolean;
  variant?: 'amber' | 'red' | 'cyan';
  inline?: boolean; // Permet d'utiliser le badge sans le positionnement absolu
}

export function PremiumNotificationBadge({
  count,
  compact = false,
  variant = 'red',
  inline = false,
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

  // Dimensions strictes pour empêcher l'écrasement du texte ("apostrophe")
  const sizeClasses = compact
    ? 'h-[16px] min-w-[16px] px-1 text-[9px] leading-none'
    : 'h-[20px] min-w-[20px] px-1.5 text-[10px] leading-none';

  // Ancrage géométrique parfait (déborde toujours en haut à droite sans masquer l'icône)
  const positionClasses = inline
    ? 'relative'
    : 'absolute top-0 right-0 translate-x-[40%] -translate-y-[40%]';

  return (
    <div className={`${positionClasses} z-[50] flex items-center justify-center rounded-full border backdrop-blur-md font-black ${colors[variant]} ${sizeClasses}`}>
      <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${halos[variant]}`} aria-hidden />
      <span className="relative z-10 pt-[1px]">{displayCount}</span>
    </div>
  );
}
