'use client';

import { motion } from 'framer-motion';
import { Eye, Clock, Users, Crown, Flame, Play, CheckCircle, Calendar, ArrowUpRight } from 'lucide-react';
import { Countdown } from '@/components/Countdown';

interface BeefCardProps {
  id: string;
  title: string;
  host_name: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  index: number;
}

export function BeefCard({
  title,
  host_name,
  status,
  created_at,
  scheduled_at,
  viewer_count = 0,
  tags = [],
  is_premium = false,
  price = 0,
  thumbnail,
  duration,
  onClick,
  onTagClick,
  index,
}: BeefCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'live':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
            <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            <span className="text-red-400">LIVE</span>
          </div>
        );
      case 'scheduled':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(0, 229, 255, 0.1)', border: '1px solid rgba(0, 229, 255, 0.25)' }}>
            <Calendar className="w-3 h-3 text-cyan-400" />
            <span className="text-cyan-400">À VENIR</span>
          </div>
        );
      case 'replay':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(168, 85, 247, 0.12)', border: '1px solid rgba(168, 85, 247, 0.25)' }}>
            <Play className="w-3 h-3 text-purple-400 fill-purple-400" />
            <span className="text-purple-400">REPLAY</span>
          </div>
        );
      case 'ended':
        return (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'rgba(107, 114, 128, 0.12)', border: '1px solid rgba(107, 114, 128, 0.25)' }}>
            <CheckCircle className="w-3 h-3 text-gray-400" />
            <span className="text-gray-400">TERMINÉ</span>
          </div>
        );
    }
  };

  const getTimeDisplay = () => {
    const now = Date.now();
    const createdTime = new Date(created_at).getTime();
    const minutesAgo = Math.floor((now - createdTime) / 60000);
    if (status === 'live') {
      if (minutesAgo < 60) return `${minutesAgo}min`;
      return `${Math.floor(minutesAgo / 60)}h`;
    } else if (duration) {
      return `${duration}min`;
    }
    return '';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      className="group card-interactive overflow-hidden"
    >
      {/* Thumbnail */}
      <div className="relative h-44 overflow-hidden bg-surface-3">
        {thumbnail ? (
          <img src={thumbnail} alt={title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="absolute inset-0 opacity-[0.07]" style={{ background: 'linear-gradient(135deg, #FF6B2C, #E83A14)' }} />
            <Flame className="w-12 h-12 text-white/[0.08]" />
          </div>
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent opacity-90" />

        {/* Status — top left */}
        <div className="absolute top-3 left-3">{getStatusBadge()}</div>

        {/* Premium — top right */}
        {is_premium && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold" style={{ background: 'linear-gradient(135deg, #FFD600, #FF6B2C)', color: '#000' }}>
              <Crown className="w-3 h-3" />
              <span>{price} PTS</span>
            </div>
          </div>
        )}

        {/* Bottom row */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between">
          {status === 'scheduled' && scheduled_at ? (
            <Countdown scheduledAt={scheduled_at} />
          ) : getTimeDisplay() ? (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Clock className="w-3 h-3" />
              <span>{getTimeDisplay()}</span>
            </div>
          ) : <div />}
          
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Eye className="w-3 h-3" />
            <span className="font-medium">{viewer_count.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-3.5">
        {/* Title */}
        <h3 className="text-sm font-semibold text-white mb-1.5 line-clamp-2 group-hover:text-brand-400 transition-colors duration-200 leading-snug">
          {title}
        </h3>

        {/* Host */}
        <p className="text-xs text-gray-500 mb-2.5">
          {host_name}
        </p>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
                className="px-2 py-0.5 text-[11px] font-medium text-gray-400 hover:text-brand-400 rounded-md transition-colors"
                style={{ background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.06)' }}
              >
                #{tag}
              </button>
            ))}
            {tags.length > 3 && (
              <span className="px-1 text-[11px] text-gray-600">+{tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}
