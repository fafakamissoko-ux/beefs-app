'use client';

import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Users, Flame, Play, Calendar, User, Sparkles, Volume2, VolumeX, Bell, Eye } from 'lucide-react';
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
    <div className="relative flex h-full min-h-0 w-full max-w-full shrink-0 flex-col">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => isReplay && setReplayHover(false)}
      className={`group relative flex h-full w-full min-h-0 flex-1 flex-col cursor-pointer overflow-hidden transition-all duration-300 max-md:flex-1 max-md:rounded-none max-md:border-none md:rounded-[2rem] md:border md:border-white/[0.08] md:bg-white/[0.04] md:backdrop-blur-2xl md:hover:border-white/20 md:hover:bg-white/[0.06] ${
        status === 'live' ? 'md:shadow-[0_0_0_1px_rgba(239,68,68,0.25)] md:group-hover:shadow-[0_0_24px_rgba(239,68,68,0.45)]' : ''
      } ${
        isManifesto
          ? 'md:border-dashed md:border-white/15 md:hover:border-prestige-gold/30'
          : ''
      }`}
    >
      {/* Média 16:9 — overlays (LIVE, stats) */}
      <div
        ref={mediaBlockRef}
        className={`relative z-0 w-full shrink-0 overflow-hidden bg-black md:rounded-t-[2rem] aspect-video ${
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
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/50"
          aria-hidden
        />

        {/* Badges statut (haut-gauche) + prix (haut-droite si planifié) */}
        <div className="absolute left-3 top-3 z-20 flex max-w-[min(100%,14rem)] flex-col gap-1.5 sm:max-w-[70%]">
            {status === 'live' && (
              <div className="flex w-fit items-center gap-1.5 rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-black uppercase tracking-tighter text-white shadow-lg animate-pulse">
                <div className="h-1.5 w-1.5 rounded-full bg-white" />
                Live
              </div>
            )}
            {getPrimaryStatusBadge()}
        </div>
        <div className="absolute right-3 top-3 z-20 flex max-w-[45%] flex-col items-end gap-1.5">
            {(status === 'scheduled' || status === 'ready' || (status === 'pending' && scheduled_at)) && (price ?? 0) > 0 && (
              <div className="flex w-fit items-center gap-1 rounded-md border border-cobalt-500/30 bg-cobalt-500/20 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-cobalt-100 backdrop-blur-md">
                <Flame className="h-3 w-3" />
                Entrée · {price} pts
              </div>
            )}
            {status === 'live' && (price ?? 0) > 0 && hasOpenedArena && (
              <div className="flex w-fit items-center gap-1 rounded-md border border-white/20 bg-black/50 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-brand-100 backdrop-blur-md">
                <Flame className="h-3 w-3 text-orange-400" />
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
            className="absolute right-3 top-12 z-30 rounded-full border border-white/15 bg-black/50 p-2 backdrop-blur-md shadow-lg transition-colors hover:bg-black/70 md:top-14"
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="h-4 w-4 text-white" /> : <Volume2 className="h-4 w-4 text-white" />}
          </button>
        )}

        {/* Compte à rebours / durée (bas-gauche) */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-20 max-w-[60%]">
          {showCountdownTimer && scheduled_at ? (
            <span className="pointer-events-auto inline-block">
              <Countdown scheduledAt={scheduled_at} />
            </span>
          ) : status === 'live' && getTimeDisplay() ? (
            <div className="flex items-center gap-1 rounded-md bg-black/55 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-white/90 backdrop-blur-md">
              <Clock className="h-3 w-3" />
              <span>{getTimeDisplay()}</span>
            </div>
          ) : null}
        </div>

        {/* Vues + Aura (bas-droite) */}
        <div
          className="absolute bottom-3 right-3 z-20 flex max-w-[calc(100%-0.5rem)] items-center gap-1.5 rounded-md border border-white/10 bg-black/60 px-2 py-1.5 text-white/95 shadow-lg backdrop-blur-md"
          aria-label={`${viewer_count.toLocaleString()} vues`}
        >
          <div className="flex shrink-0 items-center gap-1 font-mono text-[10px] font-bold tabular-nums tracking-wider">
            <Eye className="h-3.5 w-3.5 text-white/90" strokeWidth={2.25} aria-hidden />
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
              className="relative -mr-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-prestige-gold/30 bg-black/30 text-prestige-gold transition-colors hover:bg-prestige-gold/15"
              aria-label="Envoyer de l'Aura"
            >
              <AnimatePresence>
                {floatingAuras.map((aura) => (
                  <motion.span
                    key={aura.id}
                    initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                    animate={{ opacity: 0, y: -40, scale: 1.2 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7 }}
                    className="absolute -top-6 left-1/2 z-50 -translate-x-1/2 pointer-events-none text-xs font-black text-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.9)]"
                  >
                    +1
                  </motion.span>
                ))}
              </AnimatePresence>
              <Sparkles className="h-4 w-4 fill-current" />
            </motion.button>
          )}
        </div>

        {!hasHeroMedia && (
          <div className="pointer-events-none absolute inset-0 z-[1] max-md:hidden flex flex-col justify-end">
            <div className="pointer-events-auto mx-4 mb-8 flex max-h-[calc(100%-2.75rem)] min-h-0 flex-col justify-end gap-1 overflow-hidden pt-2">
              <h4 className="line-clamp-2 font-black text-lg leading-tight uppercase text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                {title}
              </h4>
              {collapsibleDescription}
            </div>
          </div>
        )}

      </div>

      {/* Contenu compact sous le 16:9 */}
      <div className="pointer-events-auto relative z-10 flex w-full min-w-0 flex-col bg-transparent px-3 py-2 md:px-4 md:py-2.5">
        <div className={!hasHeroMedia ? 'max-md:block md:hidden' : 'block'}>
          {(showCountdownTimer && scheduled_at) || (status === 'live' && getTimeDisplay()) ? (
            <div className="mb-1.5 flex items-center gap-2 md:hidden">
              {showCountdownTimer && scheduled_at ? (
                <Countdown scheduledAt={scheduled_at} />
              ) : (
                <div className="flex items-center gap-1 font-mono text-[10px] font-bold tracking-wider text-white/80">
                  <Clock className="h-3 w-3" />
                  <span>{getTimeDisplay()}</span>
                </div>
              )}
            </div>
          ) : null}
          <h3 className="line-clamp-2 pr-1 font-black text-lg leading-tight uppercase tracking-tight text-white transition-colors duration-200 md:group-hover:text-brand-300">
            {title}
          </h3>

          {/* Auteurs / ring — avatars + noms (style co-auteurs) */}
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] md:gap-x-2.5">
            <span className="inline-flex min-w-0 max-w-full items-center gap-1.5">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ring-1 ring-white/10 ${
                  hueBase % 2 === 0 ? 'bg-cobalt-500/40' : 'bg-ember-500/30'
                }`}
              >
                {(host_name || '?')[0].toUpperCase()}
              </span>
              <ProfileUserLink
                username={host_username}
                className="truncate font-sans font-medium text-white/75 hover:text-white"
                profileLabel={`Profil de ${host_name || 'Médiateur'}`}
              >
                {host_name || 'Médiateur'}
              </ProfileUserLink>
            </span>
            {(!isManifesto && (challenger_a_name || challenger_b_name)) && (
              <>
                <span className="text-white/25" aria-hidden>
                  ·
                </span>
                {challenger_a_name ? (
                  <span className="inline-flex min-w-0 max-w-[45%] items-center gap-1.5 sm:max-w-none">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-cobalt-500/35 text-[10px] font-bold text-white ring-1 ring-white/10">
                      {challenger_a_name[0].toUpperCase()}
                    </span>
                    <ProfileUserLink
                      username={challenger_a_username}
                      className="truncate font-sans font-medium text-white/60 hover:text-white/90"
                    >
                      {challenger_a_name}
                    </ProfileUserLink>
                  </span>
                ) : null}
                {challenger_a_name && challenger_b_name ? (
                  <span className="text-white/25" aria-hidden>
                    ·
                  </span>
                ) : null}
                {challenger_b_name ? (
                  <span className="inline-flex min-w-0 max-w-[45%] items-center gap-1.5 sm:max-w-none">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ember-500/30 text-[10px] font-bold text-white ring-1 ring-white/10">
                      {challenger_b_name[0].toUpperCase()}
                    </span>
                    <ProfileUserLink
                      username={challenger_b_username}
                      className="truncate font-sans font-medium text-white/60 hover:text-white/90"
                    >
                      {challenger_b_name}
                    </ProfileUserLink>
                  </span>
                ) : null}
              </>
            )}
            {!isManifesto && mediator_name?.trim() && mediator_name !== host_name && (challenger_a_name || challenger_b_name) && (
              <>
                <span className="text-white/25" aria-hidden>
                  ·
                </span>
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-prestige-gold/25 text-[10px] font-bold text-prestige-gold ring-1 ring-prestige-gold/20">
                    {mediator_name[0].toUpperCase()}
                  </span>
                  <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/30">Méd.</span>
                  <ProfileUserLink
                    username={host_username}
                    className="truncate font-sans font-medium text-prestige-gold/80"
                  >
                    {mediator_name}
                  </ProfileUserLink>
                </span>
              </>
            )}
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-white/35">
              {(participants_count ?? 0) > 0 && (
                <span className="inline-flex items-center gap-0.5 font-mono text-[9px] tracking-wide">
                  <Users className="h-3 w-3" />
                  {participants_count}
                </span>
              )}
              {(status === 'scheduled' || status === 'ready') && !liveAudienceAction && (participants_count ?? 0) === 0 && (
                <span className="inline-flex items-center gap-0.5 text-[9px] font-semibold text-cobalt-400/90">
                  Bientôt <Calendar className="h-3 w-3" />
                </span>
              )}
            </span>
          </div>

          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {tags.slice(0, 3).map((tag, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag);
                  }}
                  className="rounded bg-white/[0.06] px-1.5 py-0.5 font-sans text-[9px] font-semibold text-white/45 transition-colors hover:text-brand-300 md:cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
              {tags.length > 3 && <span className="self-center font-mono text-[9px] text-white/20">+{tags.length - 3}</span>}
            </div>
          )}
          {collapsibleDescription ? <div className="mt-1.5 min-w-0 max-md:hidden">{collapsibleDescription}</div> : null}
        </div>

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

        {isManifesto && (
          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-1.5 text-[10px] md:gap-x-2.5">
            <span className="font-mono text-[8px] font-bold uppercase tracking-[0.15em] text-white/30">Places</span>
            {challenger_a_name ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-cobalt-500/35 text-[9px] font-bold text-white">
                  {challenger_a_name[0].toUpperCase()}
                </span>
                <ProfileUserLink username={challenger_a_username} className="truncate font-sans font-medium text-white/65">
                  {challenger_a_name}
                </ProfileUserLink>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="inline-flex items-center gap-1 text-white/45 transition-colors hover:text-brand-300"
              >
                <User className="h-3.5 w-3.5 opacity-50" />
                <span className="font-sans">Ch. A</span>
              </button>
            )}
            <span className="text-white/20" aria-hidden>
              ·
            </span>
            {challenger_b_name ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px] text-white/70">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ember-500/30 text-[9px] font-bold text-white">
                  {challenger_b_name[0].toUpperCase()}
                </span>
                <ProfileUserLink username={challenger_b_username} className="truncate font-sans font-medium text-white/65">
                  {challenger_b_name}
                </ProfileUserLink>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="inline-flex items-center gap-1 text-white/45 transition-colors hover:text-brand-300"
              >
                <User className="h-3.5 w-3.5 opacity-50" />
                <span className="font-sans">Ch. B</span>
              </button>
            )}
            <span className="text-white/20" aria-hidden>
              ·
            </span>
            {mediatorSlotName ? (
              <span className="inline-flex min-w-0 items-center gap-1.5 text-[11px]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-prestige-gold/30 text-[9px] font-bold text-prestige-gold">
                  {mediatorSlotName[0].toUpperCase()}
                </span>
                <ProfileUserLink
                  username={host_username}
                  className="truncate font-sans font-medium text-prestige-gold/75"
                >
                  {mediator_name?.trim() ? mediator_name : host_name}
                </ProfileUserLink>
              </span>
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="inline-flex items-center gap-1 text-prestige-gold/50 transition-colors hover:text-prestige-gold/90"
              >
                <User className="h-3.5 w-3.5 opacity-50" />
                <span className="font-sans">Médiateur</span>
              </button>
            )}
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
