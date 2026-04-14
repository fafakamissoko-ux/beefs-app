'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Flame, Play, Calendar, ArrowUpRight, User } from 'lucide-react';
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
  status:
    | 'live'
    | 'ended'
    | 'replay'
    | 'scheduled'
    | 'cancelled'
    | 'pending'
    | 'ready'
    | 'completed';
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
  /** Onglet feed « À Saisir » : badge ⚖️ EN ATTENTE + CTA médiateur */
  saisirTab?: boolean;
  onSaisirAffaire?: () => void;
  /** L’Arène : médiateur manifeste peut se retirer */
  onSeDesister?: () => void;
  intent?: string | null;
  created_by?: string | null;
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
  saisirTab = false,
  onSaisirAffaire,
  onSeDesister,
  intent,
  index,
}: BeefCardProps) {
  const [hasOpenedArena, setHasOpenedArena] = useState(false);
  const [replayHover, setReplayHover] = useState(false);

  useEffect(() => {
    setHasOpenedArena(hasBeefWatchStarted(id));
  }, [id, status, price]);

  const getPrimaryStatusBadge = () => {
    const base = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider backdrop-blur-md';
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-bold tracking-wider">
            ⚖️ EN ATTENTE
          </div>
        );
      case 'live':
        return (
          <div className={`${base} bg-ember-500/15 border border-ember-500/35 text-ember-400`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember-500" aria-hidden />
            LIVE
          </div>
        );
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-wider uppercase">
            ▶ JURISPRUDENCE
          </div>
        );
      case 'scheduled':
      case 'ready':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cobalt-500/10 border border-cobalt-500/20 text-cobalt-400 text-xs font-bold tracking-wider uppercase">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            À VENIR
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-500/12 border border-gray-500/25 text-gray-400 text-xs font-bold tracking-wider uppercase">
            ANNULÉ
          </div>
        );
      default:
        return null;
    }
  };

  const getTimeDisplay = () => {
    const now = Date.now();
    const createdTime = new Date(created_at).getTime();
    const minutesAgo = Math.floor((now - createdTime) / 60000);
    if (status === 'live') {
      if (minutesAgo < 60) return `${minutesAgo}min`;
      return `${Math.floor(minutesAgo / 60)}h`;
    }
    return '';
  };

  const showScheduledCountdown =
    (status === 'scheduled' || status === 'pending') &&
    !!scheduled_at &&
    new Date(scheduled_at).getTime() > Date.now();

  const charSum = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hueBase = charSum % 360;

  const isManifesto =
    saisirTab ||
    (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const mediatorSlotName = (mediator_name?.trim() || host_name?.trim() || '') || null;
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';

  return (
    <div className="flex flex-col">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => isReplay && setReplayHover(false)}
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
              className={
                hueBase % 2 === 0
                  ? 'absolute inset-0 bg-gradient-to-br from-cobalt-950/90 via-surface-1 to-black'
                  : 'absolute inset-0 bg-gradient-to-br from-ember-950/85 via-surface-1 to-black'
              }
            />
            <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-cobalt-500/15 blur-3xl opacity-90" />
            <div className="absolute bottom-6 -left-6 w-24 h-24 rounded-full bg-ember-500/12 blur-2xl opacity-80" />
          </div>
        )}

        {/* Gradient lisibilité */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

        {/* Badge statut (unique, haut gauche) */}
        <div className="absolute top-3.5 left-3.5 z-[2]">{getPrimaryStatusBadge()}</div>

        {(status === 'scheduled' || status === 'ready' || (status === 'pending' && scheduled_at)) && (price ?? 0) > 0 && (
          <div className="absolute top-3.5 right-3.5">
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-[10px] font-bold uppercase tracking-wider bg-cobalt-500/12 border border-cobalt-500/25 text-cobalt-200 backdrop-blur-md">
              <Flame className="w-3 h-3" />
              Entrée · {price} pts
            </div>
          </div>
        )}
        {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
          <div className="absolute top-3.5 right-3.5">
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-200 backdrop-blur-md">
              <Flame className="h-3 w-3 text-orange-500" />
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
              <p className="font-sans text-[11px] text-white/50 leading-relaxed line-clamp-2 break-words whitespace-normal text-ellipsis overflow-hidden">
                {description.trim()}
              </p>
            )}
          </div>
        )}

        {/* Métriques bas — chrono / countdown + viewers */}
        <div className="absolute bottom-3 left-4 right-4 z-[2] flex items-center justify-between">
          {showScheduledCountdown && scheduled_at ? (
            <Countdown scheduledAt={scheduled_at} />
          ) : status === 'live' && getTimeDisplay() ? (
            <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/60">
              <Clock className="w-3 h-3" />
              <span>{getTimeDisplay()}</span>
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-orange-500">
            <Flame className="h-3 w-3 shrink-0" strokeWidth={2.25} />
            <span className="text-white/80">{viewer_count.toLocaleString()}</span>
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
            {saisirTab && !mediator_name?.trim() ? 'Auteur' : 'Médiateur'}
          </span>
          <div
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${
              hueBase % 2 === 0 ? 'bg-cobalt-700' : 'bg-ember-800'
            }`}
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
          {status === 'live' && (
            <div className="ml-auto flex items-center gap-0.5 font-sans text-[10px] text-brand-400 font-semibold">
              Regarder <ArrowUpRight className="w-3 h-3" />
            </div>
          )}
          {(status === 'scheduled' || status === 'ready' || showScheduledCountdown) && !((participants_count ?? 0) > 0) && (
            <div className="ml-auto flex items-center gap-0.5 font-sans text-[10px] text-cobalt-400 font-semibold">
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

      {onSaisirAffaire && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSaisirAffaire();
          }}
          className="mt-4 w-full rounded-[2rem] bg-white py-3.5 text-center text-sm font-bold text-black transition-colors hover:bg-gray-200"
        >
          Saisir l&apos;Affaire
        </button>
      )}
      {onSeDesister && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSeDesister();
          }}
          className="mt-4 w-full rounded-[2rem] border border-white/15 bg-white/[0.04] py-3.5 text-center text-sm font-bold text-red-400 transition-colors hover:border-red-500/40 hover:bg-red-500/10"
        >
          Se désister
        </button>
      )}
    </div>
  );
}
