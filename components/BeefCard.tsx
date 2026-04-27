'use client';

import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Flame, Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye } from 'lucide-react';
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
  video_url?: string | null;
  duration?: number;
  participants_count?: number;
  challenger_a_name?: string | null;
  challenger_b_name?: string | null;
  challenger_a_username?: string | null;
  challenger_b_username?: string | null;
  mediator_name?: string | null;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  onApply?: () => void;
  onAuraClick?: () => void;
  /** Onglet feed « À Saisir » : badge ⚖️ EN ATTENTE + CTA médiateur */
  saisirTab?: boolean;
  onSaisirAffaire?: () => void;
  /** L’Arène : médiateur manifeste peut se retirer */
  onSeDesister?: () => void;
  /** Feed : médiateur, affaire planifiée — accès antichambre */
  onPrepareAudience?: () => void;
  /** Carte live : public vs ring (médiateur / challenger accepté) */
  liveAudienceAction?: { variant: 'join' | 'return'; onClick: () => void };
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
  video_url,
  duration,
  participants_count,
  challenger_a_name,
  challenger_b_name,
  challenger_a_username,
  challenger_b_username,
  mediator_name,
  onClick,
  onTagClick,
  onNotifyClick,
  onApply,
  onAuraClick,
  saisirTab = false,
  onSaisirAffaire,
  onSeDesister,
  onPrepareAudience,
  liveAudienceAction,
  intent,
  index,
}: BeefCardProps) {
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaBlockRef = useRef<HTMLDivElement | null>(null);

  const [hasOpenedArena, setHasOpenedArena] = useState(false);
  const [floatingAuras, setFloatingAuras] = useState<{ id: number; x: number }[]>([]);
  const [replayHover, setReplayHover] = useState(false);

  useLayoutEffect(() => {
    if (!video_url?.trim()) return;
    const el = mediaBlockRef.current;
    if (!el) return;
    const v = videoRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.5) {
            void v?.play().catch(() => {
              /* autoplay refusé */
            });
          } else {
            v?.pause();
          }
        }
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [video_url, id]);

  useEffect(() => {
    setHasOpenedArena(hasBeefWatchStarted(id));
  }, [id, status, price]);

  const getPrimaryStatusBadge = () => {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-xs font-bold tracking-wider">
            ⚖️ EN ATTENTE
          </div>
        );
      case 'live':
        return null;
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-bold tracking-wider uppercase">
            ▶ HIGHLIGHTS
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

  /** Pas de timer en pending (date non scellée) ; compte à rebours seulement si planifié ou live à venir */
  const showCountdownTimer =
    (status === 'scheduled' || status === 'live') &&
    !!scheduled_at &&
    new Date(scheduled_at).getTime() > Date.now();

  const isManifesto =
    saisirTab ||
    (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';

  const descText = description?.trim() ?? '';

  return (
    <div className="relative flex h-full min-h-0 w-full max-w-full shrink-0 flex-col">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => isReplay && setReplayHover(false)}
      className={`group relative flex h-full w-full min-h-0 flex-1 flex-col cursor-pointer overflow-hidden transition-all duration-300 max-md:rounded-2xl max-md:border max-md:border-white/[0.06] md:rounded-[1.5rem] md:border md:border-white/[0.08] md:bg-[#08080A] md:hover:border-white/20 ${
        status === 'live' ? 'md:shadow-[0_0_0_1px_rgba(239,68,68,0.25)] md:group-hover:shadow-[0_0_24px_rgba(239,68,68,0.45)]' : ''
      } ${
        isManifesto
          ? 'md:border-dashed md:border-white/15 md:hover:border-prestige-gold/30'
          : ''
      }`}
    >
      <div
        ref={mediaBlockRef}
        className={`relative w-full aspect-video overflow-hidden bg-black/20 shrink-0 max-md:rounded-t-2xl md:rounded-t-[1.5rem] ${
          status === 'live' ? 'ring-1 ring-inset ring-red-500/40 md:group-hover:ring-2 md:group-hover:ring-red-500/60' : ''
        }`}
      >
        <div className="absolute inset-0 overflow-hidden">
        {video_url ? (
          <video
            ref={videoRef}
            src={video_url}
            loop
            muted={isMuted}
            playsInline
            className="h-full w-full object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
          />
        ) : thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover object-center transition-transform duration-500 ease-out group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 384px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />
        )}
        </div>

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40"
          aria-hidden
        />

        <div className="absolute top-2 left-2 z-20 flex max-w-[min(100%,70%)] flex-col items-start gap-1">
            {status === 'live' && (
              <div className="flex w-fit items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-white shadow-sm animate-pulse">
                <div className="h-1.5 w-1.5 rounded-full bg-white" />
                Live
              </div>
            )}
            {getPrimaryStatusBadge()}
        </div>
        <div className="absolute top-2 right-2 z-20 flex max-w-[48%] flex-col items-end gap-1">
            {(status === 'scheduled' || status === 'ready' || (status === 'pending' && scheduled_at)) && (price ?? 0) > 0 && (
              <div className="flex w-fit items-center gap-0.5 rounded border border-cobalt-500/30 bg-cobalt-500/20 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-cobalt-100 backdrop-blur-sm">
                <Flame className="h-2.5 w-2.5" />
                Entrée · {price} pts
              </div>
            )}
            {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
              <div className="flex w-fit items-center gap-0.5 rounded border border-white/20 bg-black/55 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-100 backdrop-blur-sm">
                <Flame className="h-2.5 w-2.5 text-orange-400" />
                Suite · {price} pts
              </div>
            )}
        </div>

        {video_url && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted((m) => !m);
            }}
            className="absolute bottom-2 left-2 z-30 rounded-full border border-white/15 bg-black/50 p-1.5 backdrop-blur-md transition-colors hover:bg-black/70"
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-white" /> : <Volume2 className="h-3.5 w-3.5 text-white" />}
          </button>
        )}

        <div
          className="absolute bottom-2 right-2 z-20 flex max-w-[min(92%,calc(100%-3rem))] flex-wrap items-center justify-end gap-1.5"
          aria-label={`${viewer_count.toLocaleString()} vues`}
        >
          {showCountdownTimer && scheduled_at && (
            <span className="pointer-events-auto rounded border border-white/10 bg-black/60 px-1.5 py-0.5 backdrop-blur-sm [&_*]:!text-[9px]">
              <Countdown scheduledAt={scheduled_at} />
            </span>
          )}
          {status === 'live' && getTimeDisplay() && (
            <div className="flex items-center gap-0.5 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-white/90 backdrop-blur-sm">
              <Clock className="h-2.5 w-2.5" />
              <span>{getTimeDisplay()}</span>
            </div>
          )}
          <div className="flex items-center gap-0.5 rounded border border-white/10 bg-black/60 px-1.5 py-0.5 font-mono text-[9px] font-bold tabular-nums text-white/95 backdrop-blur-sm">
            <Eye className="h-2.5 w-2.5 text-white/90" strokeWidth={2.25} aria-hidden />
            <span>{viewer_count.toLocaleString()}</span>
          </div>
          {onAuraClick && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={(e) => {
                e.stopPropagation();
                const newId = Date.now() + Math.random();
                setFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 30 - 15 }]);
                setTimeout(() => setFloatingAuras((prev) => prev.filter((a) => a.id !== newId)), 1000);
                onAuraClick();
              }}
              className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded border border-prestige-gold/30 bg-black/50 text-prestige-gold"
              aria-label="Envoyer de l'Aura"
            >
              <AnimatePresence>
                {floatingAuras.map((aura) => (
                  <motion.span
                    key={aura.id}
                    initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                    animate={{ opacity: 0, y: -28, scale: 1.1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65 }}
                    className="absolute -top-5 left-1/2 z-50 -translate-x-1/2 pointer-events-none text-[10px] font-black text-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.9)]"
                  >
                    +1
                  </motion.span>
                ))}
              </AnimatePresence>
              <Sparkles className="h-3 w-3 fill-current" />
            </motion.button>
          )}
        </div>

      </div>

      <div className="p-3 md:p-4 flex gap-3 pointer-events-auto w-full bg-[#08080A] relative z-10">
        <div className="shrink-0 pt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 border border-white/20 text-sm font-bold text-white backdrop-blur-md">
            {(host_name || '?')[0].toUpperCase()}
          </div>
        </div>
        <div className="flex min-w-0 flex-col flex-1">
          <h3 className="line-clamp-2 font-sans text-[15px] md:text-base font-bold leading-snug text-white md:group-hover:text-brand-400 transition-colors">
            {title}
          </h3>
          <div className="mt-1 flex flex-col gap-0.5">
            <ProfileUserLink
              username={host_username}
              className="truncate text-xs font-medium text-gray-400 hover:text-white transition-colors"
              profileLabel={`Profil de ${host_name || 'Médiateur'}`}
            >
              {host_name || 'Médiateur'}
            </ProfileUserLink>
            {(challenger_a_name || challenger_b_name) && (
              <span className="truncate text-[11px] font-medium text-gray-500">
                {challenger_a_name || '?'} <span className="text-gray-600">vs</span> {challenger_b_name || '?'}
              </span>
            )}
            {isManifesto && (mediator_name || host_name) && !challenger_a_name && !challenger_b_name && (
              <span className="text-[10px] font-medium text-amber-500/80">Recherche de challengers &amp; médiateur</span>
            )}
          </div>
          {descText ? (
            <p className="mt-1.5 line-clamp-1 text-[11px] text-gray-500 break-words">
              {descText}
            </p>
          ) : null}
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.slice(0, 3).map((tag, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                  className="rounded px-1 text-[9px] font-medium text-gray-600 transition-colors hover:text-brand-400"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {((status === 'scheduled' && onNotifyClick) ||
        (status === 'pending' && onSaisirAffaire) ||
        (status === 'scheduled' && (onPrepareAudience || onSeDesister)) ||
        (status === 'live' && liveAudienceAction) ||
        (isManifesto && onApply)) && (
        <div className="px-3 pb-3 md:px-4 md:pb-4 pt-1 bg-[#08080A] space-y-2">
          {isManifesto && onApply && (
            <div className="flex flex-wrap gap-3 border-b border-white/[0.06] pb-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="text-[10px] font-medium text-amber-500/90 underline-offset-2 hover:underline"
              >
                + Rôle au ring
              </button>
            </div>
          )}
          {status === 'scheduled' && onNotifyClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNotifyClick();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 py-2.5 text-xs font-bold uppercase tracking-wide text-amber-100 transition-all hover:bg-amber-500/20"
            >
              <Bell className="h-4 w-4 shrink-0" strokeWidth={2.2} />
              M&apos;alerter
            </button>
          )}
          {status === 'pending' && onSaisirAffaire && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSaisirAffaire();
              }}
              className="w-full rounded-xl bg-white/10 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Saisir l&apos;Affaire
            </button>
          )}
          {status === 'scheduled' && (onPrepareAudience || onSeDesister) && (
            <div className="flex flex-col gap-2">
              {onPrepareAudience && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPrepareAudience();
                  }}
                  className="w-full rounded-xl border border-white/20 py-2.5 text-center text-sm font-semibold text-white transition-all hover:bg-white/10"
                >
                  Préparer l&apos;Audience
                </button>
              )}
              {onSeDesister && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSeDesister();
                  }}
                  className="w-full py-1.5 text-center text-xs font-medium text-red-400/90 transition-colors hover:text-red-300"
                >
                  Se désister
                </button>
              )}
            </div>
          )}
          {status === 'live' && liveAudienceAction && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                liveAudienceAction.onClick();
              }}
              className="w-full rounded-xl border border-brand-500/35 bg-brand-500/15 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-brand-500/25"
            >
              {liveAudienceAction.variant === 'return'
                ? "Retourner dans l'Arène"
                : "Rejoindre l'Audience"}
            </button>
          )}
        </div>
      )}

      {/* Overlay Replay — hover preview pour les beefs terminés */}
      {isReplay && (
        <AnimatePresence>
          {replayHover && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-[3] flex items-center justify-center rounded-t-2xl bg-black/60 backdrop-blur-sm md:rounded-[1.5rem]"
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
    </div>
  );
}
