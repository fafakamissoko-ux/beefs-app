'use client';

import { Flame } from 'lucide-react';
import Link from 'next/link';

interface PointsDisplayProps {
  points: number;
  className?: string;
}

export function PointsDisplay({ points, className = '' }: PointsDisplayProps) {
  return (
    <Link
      href="/buy-points"
      className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/50 rounded-lg hover:from-orange-500/30 hover:to-red-500/30 transition-all ${className}`}
    >
      <Flame className="w-4 h-4 text-orange-500" />
      <span className="text-white font-bold text-sm">{points.toLocaleString()}</span>
    </Link>
  );
}
