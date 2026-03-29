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
          (() => {
            const tagT = tags.reduce(
              (acc, tag) => acc + tag.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
              0
            );
            const shift = tagT % 16;
            const initials = (title.trim().slice(0, 2) || '••').toUpperCase();
            return (
              <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
                {status === 'live' ? (
                  <>
                    <div
                      className="absolute inset-0"
                      style={{
                        background: `linear-gradient(135deg, #ff5c33 0%, #e83a14 ${42 + shift}%, #b91c1c 100%)`,
                      }}
                    />
                    <motion.div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background:
                          'radial-gradient(ellipse 85% 65% at 45% 25%, rgba(255, 210, 120, 0.5), transparent 55%)',
                      }}
                      animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.07, 1] }}
                      transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </>
                ) : (
                  <div
                    className="absolute inset-0"
                    style={{
                      background:
                        status === 'scheduled'
                          ? `linear-gradient(135deg, #0369a1 0%, #06b6d4 ${40 + shift}%, #0891b2 100%)`
                          : status === 'replay'
                            ? `linear-gradient(135deg, #7c3aed 0%, #a855f7 ${40 + shift}%, #5b21b6 100%)`
                            : `linear-gradient(135deg, #57534e 0%, #71717a ${40 + shift}%, #3f3f46 100%)`,
                    }}
                  />
                )}
                <div
                  className="absolute inset-0 pointer-events-none opacity-[0.22]"
                  style={{
                    backgroundImage:
                      'repeating-linear-gradient(0deg, transparent, transparent 9px, rgba(255,255,255,0.045) 9px, rgba(255,255,255,0.045) 10px), repeating-linear-gradient(90deg, transparent, transparent 11px, rgba(0,0,0,0.07) 11px, rgba(0,0,0,0.07) 12px)',
                  }}
                />
                <span className="relative z-[1] text-4xl font-bold tracking-tight text-white/95 drop-shadow-[0_2px_12px_rgba(0,0,0,0.45)] select-none">
                  {initials}
                </span>
                <Flame
                  className="absolute bottom-11 right-3 w-5 h-5 text-white/28 pointer-events-none z-[1]"
                  aria-hidden
                />
              </div>
            );
          })()
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
