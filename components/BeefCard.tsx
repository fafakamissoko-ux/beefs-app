'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, Clock, Users, Flame, Play, CheckCircle, Calendar, ArrowUpRight, User } from 'lucide-react';
import { hasBeefWatchStarted } from '@/lib/beef-view-local';
import { Countdown } from '@/components/Countdown';
import { ProfileUserLink } from '@/components/ProfileUserLink';

interface BeefCardProps {
  id: string;
  title: string;
  description?: string;
  host_name: string;
  /** `username` en base pour lien profil (pas le seul display name). */
  host_username?: string | null;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  is_premium?: boolean;
  price?: number;
  thumbnail?: string;
  duration?: number;
  participants_count?: number;
  challenger_a_name?: string | null;
  challenger_b_name?: string | null;
  mediator_name?: string | null;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  onApply?: () => void;
  index: number;
}

export function BeefCard({
  id,
  title,
  description,
  host_name,
  host_username,
  status,
  created_at,
  scheduled_at,
  viewer_count = 0,
  tags = [],
  price = 0,
  thumbnail,
  duration,
  participants_count,
  challenger_a_name,
  challenger_b_name,
  mediator_name,
  onClick,
  onTagClick,
  onApply,
  index,
}: BeefCardProps) {
  const [hasOpenedArena, setHasOpenedArena] = useState(false);
  const [replayHover, setReplayHover] = useState(false);

  const uiStatus: typeof status | 'scheduled' | 'preparing' =
    status === 'pending' && scheduled_at && new Date(scheduled_at).getTime() > Date.now()
      ? 'scheduled'
      : status === 'pending' || status === 'ready'
        ? 'preparing'
        : status;

  useEffect(() => {
    setHasOpenedArena(hasBeefWatchStarted(id));
  }, [id, status, price]);

  const getStatusBadge = () => {
    const base = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider backdrop-blur-md';
    switch (uiStatus) {
      case 'live':
        return (
          <div className={`${base} bg-red-500/15 border border-red-500/30 text-red-400`}>
            <motion.div animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1.2, repeat: Infinity }} className="w-1.5 h-1.5 bg-red-500 rounded-full" />
            LIVE
          </div>
        );
      case 'scheduled':
        return (
          <div className={`${base} bg-cyan-400/10 border border-cyan-400/25 text-cyan-400`}>
            <Calendar className="w-3 h-3" />
            À VENIR
          </div>
        );
      case 'replay':
        return (
          <div className={`${base} bg-purple-500/12 border border-purple-500/25 text-purple-400`}>
            <Play className="w-3 h-3 fill-current" />
            REPLAY
          </div>
        );
      case 'ended':
        return (
          <div className={`${base} bg-gray-500/12 border border-gray-500/25 text-gray-400`}>
            <CheckCircle className="w-3 h-3" />
            TERMINÉ
          </div>
        );
      case 'cancelled':
        return (
          <div className={`${base} bg-gray-500/12 border border-gray-500/25 text-amber-500/90`}>
            <CheckCircle className="w-3 h-3" />
            ANNULÉ
          </div>
        );
      case 'preparing':
        return (
          <div className={`${base} bg-amber-400/10 border border-amber-400/25 text-amber-300`}>
            <Clock className="w-3 h-3" />
            PRÉPARATION
          </div>
        );
    }
  };

  const getTimeDisplay = () => {
    const now = Date.now();
    const createdTime = new Date(created_at).getTime();
    const minutesAgo = Math.floor((now - createdTime) / 60000);
    if (status === 'live' || uiStatus === 'live') {
      if (minutesAgo < 60) return `${minutesAgo}min`;
      return `${Math.floor(minutesAgo / 60)}h`;
    } else if (duration) {
      return `${duration}min`;
    }
    return '';
  };

  const charSum = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hueBase = charSum % 360;

  const isManifesto = uiStatus === 'preparing';
  const mediatorSlotName = (mediator_name?.trim() || host_name?.trim() || '') || null;
  const isReplay = status === 'ended' || status === 'replay';

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => setReplayHover(false)}
      className={`group relative cursor-pointer overflow-hidden rounded-[2rem] bg-white/[0.04] border backdrop-blur-2xl transition-all duration-300 hover:scale-[0.98] hover:bg-white/[0.06] ${
        isManifesto
          ? 'border-dashed border-white/15 hover:border-prestige-gold/30'
          : 'border-white/[0.08] hover:border-white/20'
      }`}
    >
      {/* Visual */}
      <div className="relative h-48 overflow-hidden rounded-t-[2rem]">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 384px"
          />
        ) : (
          <div className="absolute inset-0">
            <div
              className="absolute inset-0"
              style={{
                background: `linear-gradient(145deg, hsl(${hueBase}, 65%, 16%) 0%, hsl(${(hueBase + 40) % 360}, 50%, 9%) 100%)`,
              }}
            />
            <div
              className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-[0.08]"
              style={{ background: `radial-gradient(circle, hsl(${hueBase}, 80%, 55%), transparent 70%)` }}
            />
            <div
              className="absolute bottom-6 -left-6 w-24 h-24 rounded-full opacity-[0.05]"
              style={{ background: `radial-gradient(circle, hsl(${(hueBase + 120) % 360}, 70%, 50%), transparent 70%)` }}
            />
          </div>
        )}

        {/* Gradient lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {/* Live pulse */}
        {uiStatus === 'live' && (
          <motion.div
            className="absolute top-4 right-4 w-3 h-3 rounded-full bg-red-500"
            animate={{ boxShadow: ['0 0 0 0 rgba(239,68,68,0.5)', '0 0 0 10px rgba(239,68,68,0)', '0 0 0 0 rgba(239,68,68,0)'] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        )}

        {/* Badge statut */}
        <div className="absolute top-3.5 left-3.5">{getStatusBadge()}</div>

        {/* Badges contextuels (replay, prix) */}
        {(status === 'ended' || status === 'replay') && (
          <div className="absolute top-3.5 right-3.5">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider bg-purple-500/15 border border-purple-500/30 text-purple-300 backdrop-blur-md">
              <Play className="w-3 h-3 fill-current" />
              Replay
            </div>
          </div>
        )}
        {uiStatus === 'scheduled' && (price ?? 0) > 0 && (
          <div className="absolute top-3.5 right-3.5">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 border border-cyan-500/25 text-cyan-200 backdrop-blur-md">
              <Flame className="w-3 h-3" />
              Entrée · {price} pts
            </div>
          </div>
        )}
        {uiStatus === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
          <div className="absolute top-3.5 right-3.5">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider bg-white/10 border border-white/15 text-brand-200 backdrop-blur-md">
              <Eye className="w-3 h-3 text-brand-400" />
              Suite · {price} pts
            </div>
          </div>
        )}

        {/* Titre + description (dans le visuel) */}
        {!thumbnail && (
          <div className="absolute inset-x-0 bottom-0 z-[1] flex flex-col justify-end p-5">
            <h4 className="font-sans text-base font-bold text-white leading-snug line-clamp-2 mb-1 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
              {title}
            </h4>
            {description?.trim() && (
              <p className="font-sans text-[11px] text-white/50 leading-relaxed line-clamp-2">
                {description.trim().slice(0, 90)}{(description.trim().length > 90) ? '…' : ''}
              </p>
            )}
          </div>
        )}

        {/* Métriques bas — chrono / countdown + viewers */}
        <div className="absolute bottom-3 left-4 right-4 z-[2] flex items-center justify-between">
          {uiStatus === 'scheduled' && scheduled_at ? (
            <Countdown scheduledAt={scheduled_at} />
          ) : getTimeDisplay() ? (
            <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/60">
              <Clock className="w-3 h-3" />
              <span>{getTimeDisplay()}</span>
            </div>
          ) : <div />}
          <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/60">
            <Eye className="w-3 h-3" />
            <span>{viewer_count.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Contenu sous le visuel */}
      <div className="px-5 py-4">
        {thumbnail && (
          <h3 className="font-sans text-[15px] font-bold text-white mb-1 line-clamp-2 leading-snug group-hover:text-brand-400 transition-colors duration-200">
            {title}
          </h3>
        )}

        {/* Médiateur (hôte du beef) */}
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-white/30 shrink-0">
            Médiateur
          </span>
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0"
            style={{ background: `hsl(${hueBase}, 55%, 42%)` }}
          >
            {(host_name || '?')[0].toUpperCase()}
          </div>
          <ProfileUserLink
            username={host_username}
            className="font-sans text-xs text-white/50 font-medium truncate"
          >
            {host_name}
          </ProfileUserLink>
          {(participants_count ?? 0) > 0 && (
            <div className="ml-auto flex items-center gap-1 font-mono text-[10px] text-white/35 tracking-wider">
              <Users className="w-3 h-3" />
              {participants_count}
            </div>
          )}
          {uiStatus === 'live' && (
            <div className="ml-auto flex items-center gap-0.5 font-sans text-[10px] text-brand-400 font-semibold">
              Regarder <ArrowUpRight className="w-3 h-3" />
            </div>
          )}
          {uiStatus === 'scheduled' && !((participants_count ?? 0) > 0) && (
            <div className="ml-auto flex items-center gap-0.5 font-sans text-[10px] text-cyan-400 font-semibold">
              Bientôt <Calendar className="w-3 h-3" />
            </div>
          )}
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((tag, idx) => (
              <button
                key={idx}
                onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
                className="px-2.5 py-0.5 font-sans text-[11px] font-medium text-white/40 hover:text-brand-400 rounded-full bg-white/[0.04] border border-white/[0.06] transition-colors"
              >
                #{tag}
              </button>
            ))}
            {tags.length > 3 && (
              <span className="px-1 font-mono text-[10px] text-white/25 tracking-wider self-center">+{tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Ring — challengers sur toutes les cartes (le médiateur est déjà la ligne « Hôte » ci-dessus) */}
        {!isManifesto && (challenger_a_name || challenger_b_name) && (
          <div className="mt-3 pt-3 border-t border-white/[0.06]">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">
              Challengers
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {challenger_a_name ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-cobalt-500/30 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {challenger_a_name[0].toUpperCase()}
                  </div>
                  <span className="font-sans text-[11px] text-white/60 font-medium truncate max-w-[80px]">
                    {challenger_a_name}
                  </span>
                </div>
              ) : null}
              {challenger_b_name ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-ember-500/25 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {challenger_b_name[0].toUpperCase()}
                  </div>
                  <span className="font-sans text-[11px] text-white/60 font-medium truncate max-w-[80px]">
                    {challenger_b_name}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Mode Manifeste — slots dynamiques pour les beefs en préparation */}
        {isManifesto && (
          <div className="mt-4 pt-3 border-t border-white/[0.06]">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2.5">Participants</p>
            <div className="flex items-center gap-2">
              {/* Challenger A — premier ring (pas le médiateur) */}
              {challenger_a_name ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-cobalt-500/30 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {challenger_a_name[0].toUpperCase()}
                  </div>
                  <span className="font-sans text-[11px] text-white/60 font-medium truncate max-w-[70px]">
                    {challenger_a_name}
                  </span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onApply?.();
                  }}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2.5 py-1 hover:border-brand-400/40 hover:bg-brand-500/5 transition-colors"
                >
                  <User className="w-4 h-4 text-white/20" />
                  <span className="font-sans text-[11px] text-white/30 italic">Challenger</span>
                </button>
              )}

              {/* Challenger B — rempli ou pointillés */}
              {challenger_b_name ? (
                <div className="flex items-center gap-1.5 rounded-full bg-white/[0.06] border border-white/[0.08] px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-cobalt-500/30 flex items-center justify-center text-[9px] font-bold text-white shrink-0">
                    {challenger_b_name[0].toUpperCase()}
                  </div>
                  <span className="font-sans text-[11px] text-white/60 font-medium truncate max-w-[70px]">{challenger_b_name}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onApply?.(); }}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-white/20 px-2.5 py-1 hover:border-brand-400/40 hover:bg-brand-500/5 transition-colors"
                >
                  <User className="w-4 h-4 text-white/20" />
                  <span className="font-sans text-[11px] text-white/30 italic">Challenger</span>
                </button>
              )}

              {/* Médiateur — slot or (host = médiateur sur le feed si mediator_name absent) */}
              {mediatorSlotName ? (
                <div className="flex items-center gap-1.5 rounded-full bg-prestige-gold/8 border border-prestige-gold/20 px-2.5 py-1">
                  <div className="w-5 h-5 rounded-full bg-prestige-gold/25 flex items-center justify-center text-[9px] font-bold text-prestige-gold shrink-0">
                    {mediatorSlotName[0].toUpperCase()}
                  </div>
                  <ProfileUserLink
                    username={host_username}
                    className="font-sans text-[11px] text-prestige-gold/70 font-medium truncate max-w-[70px]"
                  >
                    {mediator_name?.trim() ? mediator_name : host_name}
                  </ProfileUserLink>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onApply?.(); }}
                  className="flex items-center gap-1.5 rounded-full border border-dashed border-prestige-gold/20 px-2.5 py-1 hover:border-prestige-gold/40 hover:bg-prestige-gold/5 transition-colors"
                >
                  <User className="w-4 h-4 text-prestige-gold/20" />
                  <span className="font-sans text-[11px] text-prestige-gold/30 italic">Médiateur</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Overlay Replay — hover preview pour les beefs terminés */}
      {isReplay && (
        <AnimatePresence>
          {replayHover && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-[3] rounded-[2rem] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            >
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                exit={{ scale: 0.8 }}
                className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center backdrop-blur-md"
              >
                <Play className="w-7 h-7 text-white fill-white ml-1" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </motion.div>
  );
}
