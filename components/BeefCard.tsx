'use client';

import { motion } from 'framer-motion';
import { Eye, Clock, Users, Crown, Flame, Play, CheckCircle, Calendar } from 'lucide-react';
import { Countdown } from '@/components/Countdown';

interface BeefCardProps {
  id: string;
  title: string;
  host_name: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled';
  created_at: string;
  scheduled_at?: string; // For scheduled beefs
  viewer_count?: number;
  tags?: string[]; // Changed from category to tags array
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number; // in minutes
  onClick: () => void;
  onTagClick?: (tag: string) => void; // Callback for tag filtering
  onNotifyClick?: () => void; // Callback for notify button (scheduled beefs)
  index: number;
}

export function BeefCard({
  id,
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
  onNotifyClick,
  index,
}: BeefCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case 'live':
        return (
          <div className="flex items-center gap-2 bg-red-500 px-3 py-1.5 rounded-full shadow-lg">
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-2 h-2 bg-white rounded-full"
            />
            <span className="text-white text-xs font-bold uppercase tracking-wide">En direct</span>
          </div>
        );
      case 'scheduled':
        return (
          <div className="flex items-center gap-2 bg-blue-500 px-3 py-1.5 rounded-full shadow-lg">
            <Calendar className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-bold uppercase tracking-wide">À venir</span>
          </div>
        );
      case 'replay':
        return (
          <div className="flex items-center gap-2 bg-purple-500 px-3 py-1.5 rounded-full shadow-lg">
            <Play className="w-3 h-3 text-white fill-white" />
            <span className="text-white text-xs font-bold uppercase tracking-wide">Replay</span>
          </div>
        );
      case 'ended':
        return (
          <div className="flex items-center gap-2 bg-gray-600 px-3 py-1.5 rounded-full shadow-lg">
            <CheckCircle className="w-3 h-3 text-white" />
            <span className="text-white text-xs font-bold uppercase tracking-wide">Terminé</span>
          </div>
        );
    }
  };

  const getTimeDisplay = () => {
    const now = Date.now();
    const createdTime = new Date(created_at).getTime();
    const minutesAgo = Math.floor((now - createdTime) / 60000);

    if (status === 'live') {
      if (minutesAgo < 60) return `Il y a ${minutesAgo} min`;
      const hoursAgo = Math.floor(minutesAgo / 60);
      return `Il y a ${hoursAgo}h`;
    } else if (duration) {
      return `${duration} min`;
    }
    return '';
  };

  const getCategoryColor = () => {
    // Get color based on first tag if exists
    if (!tags || tags.length === 0) return 'from-gray-500 to-gray-600';
    
    const firstTag = tags[0].toLowerCase();
    const colors: Record<string, string> = {
      tech: 'from-blue-500 to-cyan-500',
      politique: 'from-red-500 to-pink-500',
      sport: 'from-green-500 to-emerald-500',
      culture: 'from-purple-500 to-violet-500',
      finance: 'from-yellow-500 to-orange-500',
      argent: 'from-yellow-500 to-orange-500',
      gaming: 'from-indigo-500 to-purple-500',
      startup: 'from-cyan-500 to-blue-500',
      business: 'from-orange-500 to-red-500',
    };
    
    // Check if first tag matches a color key
    for (const [key, color] of Object.entries(colors)) {
      if (firstTag.includes(key)) return color;
    }
    
    return 'from-gray-500 to-gray-600';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.4 }}
      onClick={onClick}
      className={`group relative bg-gradient-to-br rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 ${
        is_premium
          ? 'from-yellow-900/30 via-gray-900 to-gray-900 border-2 border-yellow-500/50 hover:border-yellow-400 hover:shadow-2xl hover:shadow-yellow-500/30'
          : 'from-gray-800 via-gray-900 to-black border-2 border-gray-700/50 hover:border-orange-500 hover:shadow-2xl hover:shadow-orange-500/30'
      }`}
    >
      {/* Thumbnail/Preview Section */}
      <div className="relative h-48 overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${getCategoryColor()} opacity-20 group-hover:opacity-30 transition-opacity duration-300`}>
            <div className="absolute inset-0 flex items-center justify-center">
              <Flame className="w-16 h-16 text-white/30" />
            </div>
          </div>
        )}
        
        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
        
        {/* Status Badge - Top Left */}
        <div className="absolute top-3 left-3">
          {getStatusBadge()}
        </div>

        {/* Premium Badge - Top Right */}
        {is_premium && (
          <div className="absolute top-3 right-3">
            <div className="flex items-center gap-1.5 bg-gradient-to-r from-yellow-400 to-orange-500 px-3 py-1.5 rounded-full shadow-lg">
              <Crown className="w-3.5 h-3.5 text-black" />
              <span className="text-black text-xs font-black">{price} PTS</span>
            </div>
          </div>
        )}

        {/* Viewer Count - Bottom Right */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full">
          <Eye className="w-4 h-4 text-white" />
          <span className="text-white text-sm font-bold">{viewer_count.toLocaleString()}</span>
        </div>

        {/* Time - Bottom Left */}
        {status === 'scheduled' && scheduled_at ? (
          <div className="absolute bottom-3 left-3">
            <Countdown scheduledAt={scheduled_at} />
          </div>
        ) : getTimeDisplay() ? (
          <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-black/70 backdrop-blur-sm px-3 py-1.5 rounded-full">
            <Clock className="w-4 h-4 text-gray-300" />
            <span className="text-gray-300 text-xs font-semibold">{getTimeDisplay()}</span>
          </div>
        ) : null}
      </div>

      {/* Content Section */}
      <div className="p-5">
        {/* Title */}
        <h3 className="text-xl font-black text-white mb-2 line-clamp-2 group-hover:text-orange-400 transition-colors duration-300">
          {title}
        </h3>

        {/* Host Info */}
        <div className="flex items-center gap-2 text-gray-400 mb-3">
          <Users className="w-4 h-4" />
          <span className="text-sm font-medium">Par {host_name}</span>
        </div>

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-3">
            {tags.slice(0, 5).map((tag, idx) => (
              <motion.button
                key={idx}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={(e) => {
                  e.stopPropagation();
                  onTagClick?.(tag);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 text-orange-400 text-xs font-bold rounded-full hover:bg-orange-500/30 transition-colors"
              >
                <span className="text-orange-500">$</span>
                {tag}
              </motion.button>
            ))}
            {tags.length > 5 && (
              <span className="inline-flex items-center px-2 py-1 text-gray-500 text-xs font-semibold">
                +{tags.length - 5}
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between">
          {/* Hover Arrow Indicator */}
          <motion.div
            initial={{ opacity: 0, x: -10 }}
            whileHover={{ opacity: 1, x: 0 }}
            className="text-orange-400"
          >
            <Flame className="w-5 h-5" />
          </motion.div>
        </div>
      </div>

      {/* Hover Glow Effect */}
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
        <div className={`absolute inset-0 bg-gradient-to-t ${is_premium ? 'from-yellow-500/10' : 'from-orange-500/10'} to-transparent blur-xl`} />
      </div>
    </motion.div>
  );
}
