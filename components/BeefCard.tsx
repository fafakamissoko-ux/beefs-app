'use client';

import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Flame, Play, Calendar, User, Sparkles, Volume2, VolumeX, Bell } from 'lucide-react';
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
  const [descExpanded, setDescExpanded] = useState(false);
  const [descNeedsToggle, setDescNeedsToggle] = useState(false);
  const descMeasureRef = useRef<HTMLParagraphElement>(null);

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

  useEffect(() => {
    setDescExpanded(false);
  }, [id, description]);

  useLayoutEffect(() => {
    const el = descMeasureRef.current;
    const text = description?.trim();
    if (!el || !text) {
      setDescNeedsToggle(false);
      return;
    }
    if (descExpanded) {
      setDescNeedsToggle(true);
      return;
    }
    const overflows = el.scrollHeight > el.clientHeight + 2;
    const longTextFallback = text.length > 90;
    setDescNeedsToggle(overflows || longTextFallback);
  }, [description, descExpanded, thumbnail, video_url]);

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

  const charSum = title.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const hueBase = charSum % 360;

  const isManifesto =
    saisirTab ||
    (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const mediatorSlotName = (mediator_name?.trim() || host_name?.trim() || '') || null;
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';

  const hasHeroMedia = Boolean((video_url && String(video_url).trim()) || thumbnail);

  const descText = description?.trim() ?? '';

  const collapsibleDescription = descText ? (
    <div className="min-w-0 space-y-0.5">
      <p
        ref={descMeasureRef}
        style={{ overflowWrap: 'anywhere' }}
        className={`font-sans text-[11px] leading-snug text-white/50 break-words ${
          descExpanded
            ? 'max-h-24 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]'
            : 'line-clamp-2 overflow-hidden'
        }`}
      >
        {descText}
      </p>
      {(descNeedsToggle || descText.length > 90) && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setDescExpanded((v) => !v);
          }}
          className="font-sans text-[10px] font-semibold text-brand-400 hover:text-brand-300"
        >
          {descExpanded ? 'Réduire' : 'Voir plus'}
        </button>
      )}
    </div>
  ) : null;

  return (
    <div className="relative flex min-h-0 w-full max-w-full flex-col max-md:min-h-0 max-md:h-[100dvh] max-md:w-full max-md:shrink-0 max-md:snap-start max-md:snap-always">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => isReplay && setReplayHover(false)}
      className={`group relative flex h-full w-full min-h-0 flex-1 flex-col cursor-pointer overflow-hidden transition-all duration-300 max-md:flex-1 max-md:rounded-none max-md:border-none md:rounded-[2rem] md:border md:border-white/[0.08] md:bg-white/[0.04] md:backdrop-blur-2xl md:hover:scale-[0.98] md:hover:border-white/20 md:hover:bg-white/[0.06] ${
        isManifesto
          ? 'md:border-dashed md:border-white/15 md:hover:border-prestige-gold/30'
          : ''
      }`}
    >
      {/* Média de fond (mobile) / en-tête (desktop) */}
      <div
        ref={mediaBlockRef}
        className="relative w-full min-h-0 flex-1 overflow-hidden bg-black max-md:absolute max-md:inset-0 max-md:z-0 md:aspect-[16/10] md:shrink-0 md:rounded-t-[2rem]"
      >
        {video_url ? (
          <video
            ref={videoRef}
            src={video_url}
            loop
            muted={isMuted}
            playsInline
            className="h-full w-full object-cover object-center"
          />
        ) : thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
            sizes="(max-width: 768px) 100vw, 384px"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-b from-gray-900 to-black" />
        )}

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 md:hidden"
          aria-hidden
        />

        <div
          className="pointer-events-none absolute inset-0 hidden bg-gradient-to-t from-black/50 via-black/20 to-transparent md:block"
          aria-hidden
        />

        {/* Bandeau statuts + prix — mobile sous le header (top-20) */}
        <div className="absolute left-0 right-0 top-20 z-20 flex flex-wrap items-center gap-2 px-3 md:hidden">
          {status === 'live' && (
            <div className="flex items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-white shadow-lg animate-pulse">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
              Direct
            </div>
          )}
          {getPrimaryStatusBadge()}
          {(status === 'scheduled' || status === 'ready' || (status === 'pending' && scheduled_at)) && (price ?? 0) > 0 && (
            <div className="flex items-center gap-1 rounded-full border border-cobalt-500/25 bg-cobalt-500/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cobalt-200 backdrop-blur-md">
              <Flame className="h-3 w-3" />
              Entrée · {price} pts
            </div>
          )}
          {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-200 backdrop-blur-md">
              <Flame className="h-3 w-3 text-orange-500" />
              Suite · {price} pts
            </div>
          )}
        </div>

        {/* Desktop : badge statut + prix en coins */}
        <div className="absolute left-3.5 top-3.5 z-[2] hidden md:block">{getPrimaryStatusBadge()}</div>
        {status === 'live' && (
          <div className="absolute left-4 top-4 z-10 hidden items-center gap-1.5 rounded-full bg-red-600 px-3 py-1 text-[10px] font-black uppercase tracking-tighter text-white shadow-lg animate-pulse md:flex">
            <div className="h-1.5 w-1.5 rounded-full bg-white" />
            Direct
          </div>
        )}
        {(status === 'scheduled' || status === 'ready' || (status === 'pending' && scheduled_at)) && (price ?? 0) > 0 && (
          <div className="absolute right-3.5 top-3.5 z-[2] hidden md:block">
            <div className="flex items-center gap-1 rounded-full border border-cobalt-500/25 bg-cobalt-500/12 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cobalt-200 backdrop-blur-md">
              <Flame className="h-3 w-3" />
              Entrée · {price} pts
            </div>
          </div>
        )}
        {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
          <div className="absolute right-3.5 top-3.5 z-[2] hidden md:block">
            <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-200 backdrop-blur-md">
              <Flame className="h-3 w-3 text-orange-500" />
              Suite · {price} pts
            </div>
          </div>
        )}

        {video_url && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsMuted((m) => !m);
            }}
            className="absolute z-30 max-md:bottom-36 max-md:right-3 max-md:rounded-full max-md:border max-md:border-white/10 max-md:bg-black/50 max-md:p-2 max-md:backdrop-blur-md bottom-3 right-3 rounded-full border border-white/10 bg-black/40 p-2 backdrop-blur-md transition-colors hover:bg-black/60"
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
          </button>
        )}

        {!hasHeroMedia && (
          <div className="pointer-events-none absolute inset-0 z-[1] max-md:hidden flex flex-col justify-end">
            <div className="pointer-events-auto mx-5 mb-10 flex max-h-[calc(100%-2.75rem)] min-h-0 flex-col justify-end gap-1 overflow-hidden pt-2">
              <h4 className="line-clamp-2 shrink-0 font-sans text-base font-bold leading-snug text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                {title}
              </h4>
              {collapsibleDescription}
            </div>
          </div>
        )}

        <div className="absolute bottom-3 left-4 right-4 z-[2] hidden items-center justify-between md:flex">
          {showCountdownTimer && scheduled_at ? (
            <Countdown scheduledAt={scheduled_at} />
          ) : status === 'live' && getTimeDisplay() ? (
            <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/60">
              <Clock className="h-3 w-3" />
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

      {/* BARRE AURA (mobile) — au-dessus de la zone Rejoindre / texte */}
      <div className="absolute bottom-40 right-3 z-20 flex flex-col items-center gap-5 md:hidden">
        <div className="relative flex flex-col items-center gap-1 group">
          <AnimatePresence>
            {floatingAuras.map((aura) => (
              <motion.div
                key={aura.id}
                initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                animate={{ opacity: 0, y: -80, scale: 1.5 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="absolute top-0 z-50 pointer-events-none text-lg font-black text-prestige-gold drop-shadow-[0_0_12px_rgba(212,175,55,0.8)]"
              >
                +1
              </motion.div>
            ))}
          </AnimatePresence>
          <motion.button
            type="button"
            whileTap={{ scale: 0.8 }}
            onClick={(e) => {
              e.stopPropagation();
              const newId = Date.now() + Math.random();
              setFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 30 - 15 }]);
              setTimeout(() => setFloatingAuras((prev) => prev.filter((a) => a.id !== newId)), 1000);
              onAuraClick?.();
            }}
            className="relative flex h-11 w-11 items-center justify-center rounded-full border border-prestige-gold/30 bg-black/60 text-prestige-gold shadow-[0_0_15px_rgba(212,175,55,0.2)] backdrop-blur-md"
          >
            <Sparkles className="h-5 w-5 fill-current" />
          </motion.button>
          <span className="text-[10px] font-black uppercase tracking-widest text-white drop-shadow-md">Aura</span>
        </div>
      </div>

      {/* Contenu sous le visuel */}
      <div className="pointer-events-auto relative z-10 flex max-w-none flex-col max-md:absolute max-md:bottom-0 max-md:left-0 max-md:right-0 max-md:z-10 max-md:px-4 max-md:pb-[max(1rem,env(safe-area-inset-bottom))] max-md:pt-4 md:px-5 md:py-4 max-md:bg-gradient-to-t max-md:from-black max-md:via-black/80 max-md:to-black/5">
        <div className={!hasHeroMedia ? 'max-md:block md:hidden' : 'block'}>
          <div className="mb-3 flex items-center justify-between gap-2 md:hidden">
            {showCountdownTimer && scheduled_at ? (
              <Countdown scheduledAt={scheduled_at} />
            ) : status === 'live' && getTimeDisplay() ? (
              <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/80 drop-shadow-sm">
                <Clock className="h-3 w-3" />
                <span>{getTimeDisplay()}</span>
              </div>
            ) : (
              <span className="text-[10px] text-white/30"> </span>
            )}
            <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-orange-400">
              <Flame className="h-3 w-3 shrink-0" strokeWidth={2.25} />
              <span className="text-white/90">{viewer_count.toLocaleString()}</span>
            </div>
          </div>
          {/* INFO COMPACTE (MOBILE SEULEMENT) REFONTE */}
          <div className="md:hidden flex items-center gap-2 mb-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 border border-white/20 text-[11px] font-bold text-white backdrop-blur-md">
              {(host_name || '?')[0].toUpperCase()}
            </div>
            <div className="flex min-w-0 flex-col">
              <ProfileUserLink
                username={host_username}
                className="inline truncate text-left text-[12px] font-bold text-white drop-shadow-md"
                profileLabel={`Profil de ${host_name || 'Médiateur'}`}
              >
                @{host_name || 'Médiateur'}
              </ProfileUserLink>
              {(challenger_a_name || challenger_b_name) && (
                <span className="truncate text-[10px] font-medium text-white/70 drop-shadow-md">
                  avec{' '}
                  {challenger_a_name ? (
                    <ProfileUserLink
                      username={challenger_a_username}
                      className="inline text-[10px] font-medium text-white/70"
                    >
                      {challenger_a_name}
                    </ProfileUserLink>
                  ) : (
                    '?'
                  )}{' '}
                  &amp;{' '}
                  {challenger_b_name ? (
                    <ProfileUserLink
                      username={challenger_b_username}
                      className="inline text-[10px] font-medium text-white/70"
                    >
                      {challenger_b_name}
                    </ProfileUserLink>
                  ) : (
                    '?'
                  )}
                </span>
              )}
            </div>
          </div>
          <h3 className="mb-1 max-md:mb-2 line-clamp-2 pr-10 font-sans text-[15px] font-bold leading-snug text-white max-md:text-[17px] drop-shadow-2xl transition-colors duration-200 md:group-hover:text-brand-400">
            {title}
          </h3>
          {/* Tags on Mobile */}
          {tags.length > 0 && (
            <div className="md:hidden flex flex-wrap gap-1.5 mb-2 pr-12">
              {tags.slice(0, 3).map((tag, idx) => (
                <span key={idx} className="rounded-full bg-white/10 border border-white/10 px-2 py-0.5 text-[9px] font-bold tracking-wider text-white/80 backdrop-blur-sm">
                  #{tag}
                </span>
              ))}
            </div>
          )}
          {collapsibleDescription ? (
            <div className="mb-3 min-w-0 max-md:hidden">{collapsibleDescription}</div>
          ) : null}
        </div>

        {/* Médiateur — même pastille que les challengers (avatar + nom dans le pill) */}
        <div className="mb-3 max-md:hidden">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">
            {saisirTab && !mediator_name?.trim() ? 'Auteur' : 'Médiateur'}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <div className="flex min-w-0 max-w-[min(100%,18rem)] items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1">
              <div
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${
                  hueBase % 2 === 0 ? 'bg-cobalt-500/30' : 'bg-ember-500/25'
                }`}
              >
                {(host_name || '?')[0].toUpperCase()}
              </div>
              <ProfileUserLink
                username={host_username}
                className="font-sans text-[11px] font-medium text-white/60 truncate max-w-[80px]"
              >
                {host_name}
              </ProfileUserLink>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2">
              {(participants_count ?? 0) > 0 && (
                <div className="flex items-center gap-1 font-mono text-[10px] tracking-wider text-white/35">
                  <Users className="h-3 w-3" />
                  {participants_count}
                </div>
              )}
              {(status === 'scheduled' || status === 'ready') &&
                !liveAudienceAction &&
                !((participants_count ?? 0) > 0) && (
                  <div className="flex items-center gap-0.5 font-sans text-[10px] font-semibold text-cobalt-400">
                    Bientôt <Calendar className="h-3 w-3" />
                  </div>
                )}
            </div>
          </div>
        </div>

        {/* Tags */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 max-md:hidden">
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

        {status === 'scheduled' && onNotifyClick && (
          <div className="mb-3 mt-1">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onNotifyClick();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-amber-500/45 bg-gradient-to-r from-amber-500/25 to-orange-600/20 py-3.5 font-sans text-sm font-black uppercase tracking-wide text-amber-50 shadow-[0_0_28px_rgba(245,158,11,0.3)] transition-all hover:from-amber-500/35 hover:to-orange-600/30"
            >
              <Bell className="h-5 w-5 shrink-0" strokeWidth={2.2} />
              M&apos;alerter
            </button>
          </div>
        )}

        {/* Ring — challengers sur toutes les cartes (le médiateur est déjà la ligne « Hôte » ci-dessus) */}
        {!isManifesto && (challenger_a_name || challenger_b_name) && (
          <div className="mt-3 pt-3 border-t border-white/[0.06] max-md:hidden">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2">
              Challengers
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {challenger_a_name ? (
                <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cobalt-500/30 text-[9px] font-bold text-white">
                    {challenger_a_name[0].toUpperCase()}
                  </div>
                  <ProfileUserLink
                    username={challenger_a_username}
                    className="font-sans text-[11px] font-medium text-white/60"
                  >
                    {challenger_a_name}
                  </ProfileUserLink>
                </div>
              ) : null}
              {challenger_b_name ? (
                <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-500/25 text-[9px] font-bold text-white">
                    {challenger_b_name[0].toUpperCase()}
                  </div>
                  <ProfileUserLink
                    username={challenger_b_username}
                    className="font-sans text-[11px] font-medium text-white/60"
                  >
                    {challenger_b_name}
                  </ProfileUserLink>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {/* Mode Manifeste — slots dynamiques pour les beefs en préparation */}
        {isManifesto && (
          <div className="mt-4 pt-3 border-t border-white/[0.06] max-md:hidden">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] text-white/25 mb-2.5">Participants</p>
            <div className="flex items-center gap-2">
              {/* Challenger A — premier ring (pas le médiateur) */}
              {challenger_a_name ? (
                <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cobalt-500/30 text-[9px] font-bold text-white">
                    {challenger_a_name[0].toUpperCase()}
                  </div>
                  <ProfileUserLink
                    username={challenger_a_username}
                    className="font-sans text-[11px] font-medium text-white/60"
                  >
                    {challenger_a_name}
                  </ProfileUserLink>
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
                <div className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.06] px-2.5 py-1">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cobalt-500/30 text-[9px] font-bold text-white">
                    {challenger_b_name[0].toUpperCase()}
                  </div>
                  <ProfileUserLink
                    username={challenger_b_username}
                    className="font-sans text-[11px] font-medium text-white/60"
                  >
                    {challenger_b_name}
                  </ProfileUserLink>
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

        {/* Actions feed — bas de carte (ne pas confondre pending / scheduled / live) */}
        {(onSaisirAffaire || onPrepareAudience || onSeDesister || liveAudienceAction) && (
          <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4 max-md:mt-2 max-md:mb-2 max-md:border-t-0 max-md:pt-0">
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
              className="absolute inset-0 z-[3] flex items-center justify-center rounded-none bg-black/60 backdrop-blur-sm md:rounded-[2rem]"
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
