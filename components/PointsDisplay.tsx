'use client';

import { Flame } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hrefWithFrom } from '@/lib/navigation-return';

interface PointsDisplayProps {
  points: number;
  className?: string;
}

export function PointsDisplay({ points, className = '' }: PointsDisplayProps) {
  const pathname = usePathname();
  return (
    <Link
      href={hrefWithFrom('/points', pathname)}
      className={`flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-brand-500/20 to-brand-400/20 border border-brand-500/50 rounded-lg hover:from-brand-500/30 hover:to-brand-400/30 transition-all ${className}`}
    >
      <Flame className="w-4 h-4 text-brand-400" />
      <span className="text-white font-bold text-sm">{points.toLocaleString()}</span>
    </Link>
  );
}
