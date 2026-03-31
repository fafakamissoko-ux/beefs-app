'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, Clock, Users, Flame, Play, CheckCircle, Calendar, ArrowUpRight } from 'lucide-react';
import { hasBeefWatchStarted } from '@/lib/beef-view-local';
import { Countdown } from '@/components/Countdown';

interface BeefCardProps {
  id: string;
  title: string;
  description?: string;
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
  participants_count?: number;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  index: number;
}

export function BeefCard({
  id,
  title,
  description,
  host_name,
  status,
  created_at,
  scheduled_at,
  viewer_count = 0,
  tags = [],
  price = 0,
  thumbnail,
  duration,
  participants_count,
  onClick,
  onTagClick,
  index,
}: BeefCardProps) {
  const [hasOpenedArena, setHasOpenedArena] = useState(false);

  useEffect(() => {
    setHasOpenedArena(hasBeefWatchStarted(id));
  }, [id, status, price]);

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
            const charSum = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
            const hueBase = charSum % 360;

            const gradients: Record<string, string> = {
              live: `linear-gradient(145deg, hsl(${hueBase}, 85%, 18%) 0%, hsl(${(hueBase + 30) % 360}, 75%, 12%) 50%, hsl(${(hueBase + 60) % 360}, 70%, 8%) 100%)`,
              scheduled: `linear-gradient(145deg, hsl(${hueBase}, 60%, 15%) 0%, hsl(${(hueBase + 40) % 360}, 50%, 10%) 50%, hsl(${(hueBase + 80) % 360}, 45%, 7%) 100%)`,
              replay: `linear-gradient(145deg, hsl(${hueBase}, 50%, 14%) 0%, hsl(${(hueBase + 35) % 360}, 40%, 9%) 100%)`,
              ended: `linear-gradient(145deg, hsl(${hueBase}, 20%, 12%) 0%, hsl(${(hueBase + 20) % 360}, 15%, 8%) 100%)`,
            };

            const excerpt = description?.trim().slice(0, 90) || '';
            const displayExcerpt = excerpt.length >= 90 ? excerpt + '…' : excerpt;

            return (
              <div className="w-full h-full relative flex flex-col justify-end overflow-hidden p-4">
                {/* Unique gradient per beef */}
                <div className="absolute inset-0" style={{ background: gradients[status] || gradients.ended }} />

                {/* Decorative shapes */}
                <div
                  className="absolute -top-6 -right-6 w-28 h-28 rounded-full opacity-[0.07]"
                  style={{ background: `radial-gradient(circle, hsl(${hueBase}, 80%, 60%), transparent 70%)` }}
                />
                <div
                  className="absolute bottom-8 -left-8 w-24 h-24 rounded-full opacity-[0.05]"
                  style={{ background: `radial-gradient(circle, hsl(${(hueBase + 120) % 360}, 70%, 55%), transparent 70%)` }}
                />

                {/* Live pulse ring */}
                {status === 'live' && (
                  <motion.div
                    className="absolute top-4 right-4 w-3 h-3 rounded-full bg-red-500"
                    animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.5)', '0 0 0 10px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0)'] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                )}

                {/* Title prominently displayed */}
                <h4 className="relative z-[1] text-[15px] font-bold text-white leading-tight line-clamp-2 mb-1 drop-shadow-[0_1px_6px_rgba(0,0,0,0.5)]">
                  {title}
                </h4>

                {/* Description excerpt */}
                {displayExcerpt && (
                  <p className="relative z-[1] text-[11px] text-white/50 leading-relaxed line-clamp-2 mb-2">
                    {displayExcerpt}
                  </p>
                )}

                {/* Bottom info row */}
                <div className="relative z-[1] flex items-center gap-2">
                  {/* Host avatar pill */}
                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                      style={{ background: `hsl(${charSum % 360}, 65%, 45%)` }}
                    >
                      {(host_name || '?')[0].toUpperCase()}
                    </div>
                    <span className="text-[11px] text-white/70 font-medium truncate max-w-[80px]">{host_name}</span>
                  </div>

                  {/* Participants indicator */}
                  {(participants_count ?? 0) > 0 && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)' }}>
                      <Users className="w-3 h-3 text-white/40" />
                      <span className="text-[10px] text-white/50 font-medium">{participants_count}</span>
                    </div>
                  )}

                  {/* CTA hint */}
                  {status === 'live' && (
                    <div className="ml-auto flex items-center gap-0.5 text-[10px] text-brand-400 font-semibold">
                      <span>Regarder</span>
                      <ArrowUpRight className="w-3 h-3" />
                    </div>
                  )}
                  {status === 'scheduled' && (
                    <div className="ml-auto flex items-center gap-0.5 text-[10px] text-cyan-400 font-semibold">
                      <span>Bientôt</span>
                      <Calendar className="w-3 h-3" />
                    </div>
                  )}
                </div>
              </div>
            );
          })()
        )}

        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#111114] via-transparent to-transparent opacity-90" />

        {/* Status — top left */}
        <div className="absolute top-3 left-3">{getStatusBadge()}</div>

        {/* Replay : beef terminé (ou replay VOD) */}
        {(status === 'ended' || status === 'replay') && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-purple-500/15 border border-purple-500/30 text-purple-300">
              <Play className="w-3 h-3 text-purple-400 fill-purple-400" />
              <span>Replay</span>
            </div>
          </div>
        )}

        {/* À venir payant : prix d’entrée / suite annoncé (pas encore de visionnage) */}
        {status === 'scheduled' && (price ?? 0) > 0 && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-cyan-500/10 border border-cyan-500/25 text-cyan-200">
              <Flame className="w-3 h-3 text-cyan-400" />
              <span>Entrée · {price} pts</span>
            </div>
          </div>
        )}

        {/* Suite : direct en cours + payant + spectateur a déjà ouvert l’arène sur cet appareil */}
        {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-white/10 border border-white/15 text-brand-200">
              <Eye className="w-3 h-3 text-brand-400" />
              <span>Suite · {price} pts</span>
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
      <div className="px-4 py-3">
        {/* Title — only below if there's a real thumbnail (otherwise it's in the card visual) */}
        {thumbnail && (
          <h3 className="text-sm font-semibold text-white mb-1.5 line-clamp-2 group-hover:text-brand-400 transition-colors duration-200 leading-snug">
            {title}
          </h3>
        )}

        {/* Host — only if thumbnail (otherwise host is in the card visual) */}
        {thumbnail && (
          <p className="text-xs text-gray-500 mb-2.5">
            {host_name}
          </p>
        )}

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
                className="px-2 py-0.5 min-h-[32px] text-[11px] font-medium text-gray-400 hover:text-brand-400 rounded-md transition-colors"
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
