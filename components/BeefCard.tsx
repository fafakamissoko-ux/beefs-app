'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye, ChevronDown, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';

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
  thumbnail?: string;
  video_url?: string | null;
  duration?: number;
  engagement_score?: number;
  has_liked_by_user?: boolean;
  /** Compteur et like du teaser modal (distinct du feed `engagement_score`). */
  teaser_score?: number;
  has_liked_teaser?: boolean;
  onTeaserAuraClick?: () => void;
  participants_count?: number;
  challenger_a_name?: string | null;
  challenger_b_name?: string | null;
  challenger_a_username?: string | null;
  challenger_b_username?: string | null;
  mediator_name?: string | null;
  mediator_username?: string | null;
  onDelete?: () => void;
  onEdit?: () => void;
  onForfeit?: () => void;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  onApply?: () => void;
  onAuraClick?: () => void;
  /** Onglet feed « À Saisir » : badge ⚖️ EN ATTENTE + CTA médiateur */
  saisirTab?: boolean;
  onSaisirAffaire?: () => void;
  onValiderRef?: () => void;
  onRefuserRef?: () => void;
  /** L'Arène : médiateur manifeste peut se retirer */
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
  thumbnail,
  video_url,
  duration,
  engagement_score = 0,
  has_liked_by_user = false,
  teaser_score = 0,
  has_liked_teaser = false,
  participants_count,
  challenger_a_name,
  challenger_b_name,
  challenger_a_username,
  challenger_b_username,
  mediator_name,
  mediator_username,
  onDelete,
  onEdit,
  onForfeit,
  onClick,
  onTagClick,
  onNotifyClick,
  onApply,
  onAuraClick,
  onTeaserAuraClick,
  saisirTab = false,
  onSaisirAffaire,
  onValiderRef,
  onRefuserRef,
  onSeDesister,
  onPrepareAudience,
  liveAudienceAction,
  intent,
  created_by,
  index,
}: BeefCardProps) {
  const { user } = useAuth();
  const [isMuted, setIsMuted] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaBlockRef = useRef<HTMLDivElement | null>(null);

  const [cardFloatingAuras, setCardFloatingAuras] = useState<{ id: number; x: number }[]>([]);
  const [teaserFloatingAuras, setTeaserFloatingAuras] = useState<{ id: number; x: number }[]>([]);
  const [replayHover, setReplayHover] = useState(false);
  const [isTeaserOpen, setIsTeaserOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isReminded, setIsReminded] = useState(false);

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    // Modification DOM synchrone pour préserver le User Gesture sur iOS
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (modalVideoRef.current) {
      modalVideoRef.current.muted = nextMuted;
      // Force la lecture pour éviter le blocage Safari
      modalVideoRef.current.play().catch(() => {});
    }
  };

  const { toast } = useToast();
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
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border border-cyan-500/20 bg-cyan-500/10 text-xs font-bold tracking-wider text-cyan-400 uppercase">
            ▶ HIGHLIGHTS
          </div>
        );
      case 'scheduled':
      case 'ready':
        return (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-xs font-bold tracking-wider uppercase">
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

  const auraTier = engagement_score >= 500 ? 3 : engagement_score >= 50 ? 2 : 1;

  const dynamicBorderClass =
    auraTier === 3
      ? 'border-volt-500/80 shadow-[0_0_20px_rgba(223,255,0,0.2)] md:border-volt-500/80'
      : auraTier === 2
        ? 'border-plasma-500/60 shadow-[0_0_15px_rgba(162,0,255,0.15)] md:border-plasma-500/60'
        : 'border-white/[0.06] md:border-white/[0.08] md:hover:border-white/20';

  return (
    <div className="relative flex h-auto min-h-0 w-full max-w-full shrink-0 flex-col">
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
      onClick={onClick}
      onMouseEnter={() => isReplay && setReplayHover(true)}
      onMouseLeave={() => isReplay && setReplayHover(false)}
      className={`group relative flex min-h-0 h-full w-full flex-col justify-between cursor-pointer overflow-hidden transition-all duration-300 max-md:rounded-2xl max-md:border md:rounded-[1.5rem] md:border md:bg-[#08080A] ${dynamicBorderClass} ${
        status === 'live'
          ? 'md:shadow-[0_0_0_1px_rgba(162,0,255,0.35)] md:group-hover:shadow-[0_0_24px_rgba(162,0,255,0.55)]'
          : ''
      } ${
        isManifesto
          ? 'md:border-dashed md:border-white/15 md:hover:border-prestige-gold/30'
          : ''
      }`}
    >
      <div
        ref={mediaBlockRef}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsTeaserOpen(true);
        }}
        className={`relative w-full cursor-zoom-in aspect-video overflow-hidden bg-black/20 shrink-0 max-md:rounded-t-2xl md:rounded-t-[1.5rem] ${
          status === 'live'
            ? 'ring-1 ring-inset ring-plasma-500/40 md:group-hover:ring-2 md:group-hover:ring-plasma-500/60'
            : ''
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
          <div className="absolute inset-0 bg-gradient-to-b from-obsidian-900 to-black" />
        )}
        </div>

        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-black/40"
          aria-hidden
        />

        <div className="absolute top-2 left-2 z-20 flex max-w-[min(100%,70%)] flex-col items-start gap-1">
            {status === 'live' && (
              <div className="flex w-fit items-center gap-1 rounded bg-blood-500 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-white shadow-glow-blood animate-pulse">
                <div className="h-1.5 w-1.5 rounded-full bg-white" />
                Live
              </div>
            )}
            {auraTier === 3 && (
              <div className="flex w-fit items-center gap-1 rounded border border-volt-500/40 bg-volt-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-volt-400 shadow-[0_0_10px_rgba(223,255,0,0.3)] backdrop-blur-md">
                <Sparkles className="h-2.5 w-2.5" />
                Trending
              </div>
            )}
            {getPrimaryStatusBadge()}
        </div>

        {(onEdit || onDelete || onForfeit) && (
          <div className="absolute right-2 top-2 z-[60]">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsMenuOpen(!isMenuOpen);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-white/20"
              aria-expanded={isMenuOpen}
              aria-label="Actions sur l&apos;affaire"
            >
              <MoreVertical className="h-4 w-4" aria-hidden />
            </button>
            <AnimatePresence>
              {isMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="absolute right-0 mt-2 w-48 overflow-hidden rounded-xl border border-white/10 bg-obsidian-900 py-1 shadow-2xl"
                >
                  {onEdit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onEdit();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/5 hover:text-white"
                    >
                      <Edit2 className="h-4 w-4 shrink-0" aria-hidden /> Modifier l&apos;affaire
                    </button>
                  )}
                  {onForfeit && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onForfeit();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-prestige-gold transition-colors hover:bg-prestige-gold/10"
                    >
                      <Flag className="h-4 w-4 shrink-0" aria-hidden /> Déclarer Forfait
                    </button>
                  )}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsMenuOpen(false);
                        onDelete();
                      }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-sm font-bold text-blood-400 transition-colors hover:bg-blood-500/10"
                    >
                      <Trash2 className="h-4 w-4 shrink-0" aria-hidden /> Supprimer
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {status === 'scheduled' && scheduled_at ? (
          <div
            className="pointer-events-none absolute bottom-2 left-2 z-10 origin-bottom-left scale-90 rounded-md border border-cyan-500/40 bg-black/70 px-2 py-1 shadow-lg backdrop-blur-md [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400 [&_span.text-white]:text-white [&_span.text-white]:drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
            aria-live="polite"
          >
            <Countdown scheduledAt={scheduled_at} />
          </div>
        ) : null}

        {video_url && (
          <button
            type="button"
            onClick={handleToggleMute}
            className={`absolute z-30 rounded-full border border-white/15 bg-black/50 p-1.5 backdrop-blur-md transition-colors hover:bg-black/70 ${
              status === 'scheduled' && scheduled_at ? 'bottom-14 left-2' : 'bottom-2 left-2'
            }`}
            aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-white" /> : <Volume2 className="h-3.5 w-3.5 text-white" />}
          </button>
        )}

        <div
          className="absolute bottom-2 right-2 z-20 flex max-w-[min(92%,calc(100%-3rem))] flex-wrap items-center justify-end gap-1.5"
          aria-label={`${viewer_count.toLocaleString()} vues`}
        >
          {showCountdownTimer && scheduled_at && status !== 'scheduled' && (
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
          {onAuraClick ? (
            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={(e) => {
                e.stopPropagation();
                if (!has_liked_by_user) {
                  const newId = Date.now() + Math.random();
                  setCardFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 30 - 15 }]);
                  setTimeout(() => setCardFloatingAuras((prev) => prev.filter((a) => a.id !== newId)), 1000);
                }
                onAuraClick();
              }}
              className={`relative flex h-6 shrink-0 items-center justify-center gap-1.5 rounded border bg-black/60 px-2 font-mono text-[10px] font-bold tabular-nums backdrop-blur-sm transition-colors ${
                has_liked_by_user
                  ? 'border-volt-500/50 text-volt-400 shadow-[0_0_8px_rgba(223,255,0,0.3)]'
                  : auraTier === 3
                    ? 'border-volt-500/30 text-volt-400 hover:border-volt-500/50'
                    : auraTier === 2
                      ? 'border-plasma-500/30 text-plasma-400 hover:border-plasma-500/50'
                      : 'border-white/10 text-white/90 hover:border-prestige-gold/60 hover:text-prestige-gold'
              }`}
              aria-label={has_liked_by_user ? "Retirer l'Aura" : "Envoyer de l'Aura"}
            >
              <AnimatePresence>
                {cardFloatingAuras.map((aura) => (
                  <motion.span
                    key={aura.id}
                    initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                    animate={{ opacity: 0, y: -28, scale: 1.1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.65 }}
                    className="pointer-events-none absolute -top-5 left-1/2 z-50 -translate-x-1/2 text-[10px] font-black text-volt-400 drop-shadow-[0_0_8px_rgba(223,255,0,0.8)]"
                  >
                    +1
                  </motion.span>
                ))}
              </AnimatePresence>
              <Sparkles className={`h-3 w-3 ${has_liked_by_user ? 'fill-current' : ''}`} />
              <span>{engagement_score.toLocaleString()}</span>
            </motion.button>
          ) : (
            <div
              className={`flex h-6 shrink-0 items-center justify-center gap-1.5 rounded border bg-black/60 px-2 font-mono text-[10px] font-bold tabular-nums backdrop-blur-sm ${
                auraTier === 3
                  ? 'border-volt-500/30 text-volt-400'
                  : auraTier === 2
                    ? 'border-plasma-500/30 text-plasma-400'
                    : 'border-white/10 text-white/90'
              }`}
            >
              <Sparkles className="h-3 w-3" />
              <span>{engagement_score.toLocaleString()}</span>
            </div>
          )}
        </div>

      </div>

      <div className="relative z-10 flex min-h-0 items-stretch gap-3 bg-[#08080A] p-3 pointer-events-auto md:p-4">
        <div className="flex shrink-0 flex-col pt-0.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 border border-white/20 text-sm font-bold text-white backdrop-blur-md">
            {(host_name || '?')[0].toUpperCase()}
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col">
          <h3 className="line-clamp-2 font-sans text-[15px] md:text-base font-bold leading-snug text-white drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] transition-colors md:group-hover:text-plasma-400">
            {title}
          </h3>
          <div className="mt-1 flex flex-col gap-0.5">
            <ProfileUserLink
              username={host_username}
              className="truncate text-xs font-medium text-gray-300 transition-colors hover:text-white"
              profileLabel={`Profil de ${host_name || 'Médiateur'}`}
            >
              {host_name || 'Médiateur'}
            </ProfileUserLink>
            {(challenger_a_name || challenger_b_name) && (
              <span className="line-clamp-1 truncate text-[11px] font-semibold tracking-tight">
                {challenger_a_name ? (
                  <ProfileUserLink
                    username={challenger_a_username}
                    className="font-semibold text-plasma-300 drop-shadow-[0_0_8px_rgba(162,0,255,0.8)] hover:text-plasma-200"
                  >
                    {challenger_a_name}
                  </ProfileUserLink>
                ) : (
                  <span className="font-semibold text-plasma-300 drop-shadow-[0_0_8px_rgba(162,0,255,0.8)]">?</span>
                )}{' '}
                <span className="font-medium text-gray-300 drop-shadow-[0_0_6px_rgba(0,240,255,0.35)]">vs</span>{' '}
                {challenger_b_name ? (
                  <ProfileUserLink
                    username={challenger_b_username}
                    className="font-semibold text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] hover:text-cyan-200"
                  >
                    {challenger_b_name}
                  </ProfileUserLink>
                ) : (
                  <span className="font-semibold text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)]">?</span>
                )}
              </span>
            )}
            {isManifesto && (mediator_name || host_name) && !challenger_a_name && !challenger_b_name && (
              <span className="text-[10px] font-medium text-prestige-gold/80">Recherche de challengers &amp; médiateur</span>
            )}
          </div>
          {descText ? (
            <div className="mt-1.5 flex flex-col items-start">
              <p
                className={`break-words text-[11px] font-medium text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)] transition-all duration-300 ${
                  isDescExpanded ? '' : 'line-clamp-2'
                }`}
              >
                {descText}
              </p>
              {descText.length > 80 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDescExpanded(!isDescExpanded);
                  }}
                  className="text-[10px] font-bold text-plasma-400 hover:text-plasma-300 mt-1 transition-colors"
                >
                  {isDescExpanded ? 'Réduire' : 'Voir plus'}
                </button>
              )}
            </div>
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
                  className="rounded px-1 text-[9px] font-bold text-white/90 transition-all hover:text-white hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.6)]"
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {((!!scheduled_at && (status === 'scheduled' || status === 'pending') && onNotifyClick) ||
        (status === 'pending' &&
          ((!mediator_name && onSaisirAffaire) ||
            (mediator_name && onValiderRef) ||
            (mediator_name && !onValiderRef && !onSaisirAffaire))) ||
        (status === 'scheduled' && (onPrepareAudience || onSeDesister)) ||
        (status === 'live' && liveAudienceAction) ||
        (isManifesto && onApply)) && (
        <div className="mt-auto space-y-2 bg-[#08080A] px-3 pb-3 pt-1 md:px-4 md:pb-4">
          {isManifesto && onApply && (
            <div className="flex flex-wrap gap-3 border-b border-white/[0.06] pb-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="text-[10px] font-medium text-prestige-gold/90 underline-offset-2 hover:underline"
              >
                + Rôle au ring
              </button>
            </div>
          )}
          {!!scheduled_at && (status === 'scheduled' || status === 'pending') && onNotifyClick && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsReminded(!isReminded);
                onNotifyClick?.();
                toast(!isReminded ? 'Rappel activé' : 'Rappel annulé', 'success');
              }}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-black/40 backdrop-blur-md py-2.5 text-xs font-bold uppercase tracking-wide text-white transition-all hover:bg-white/10"
            >
              <Bell className={isReminded ? 'fill-white' : ''} /> {isReminded ? 'Rappel programmé' : 'Me rappeler'}
            </button>
          )}
          {status === 'pending' && onSaisirAffaire && !mediator_name && (
            <div className="flex w-full flex-col items-center justify-center pt-1">
              <span className="mb-2 text-[10px] font-medium text-gray-400">
                Aucun Ref n&apos;a encore pris cette affaire.
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaisirAffaire();
                }}
                className="w-full rounded-xl bg-white py-3.5 text-center text-xs font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.35)] transition-transform hover:bg-gray-200 hover:scale-[1.02]"
              >
                Devenir le Ref
              </button>
            </div>
          )}
          {status === 'pending' && !!mediator_name && onValiderRef && (
            <div className="flex w-full flex-col items-center justify-center gap-2 pt-1">
              <span className="text-[10px] font-medium text-plasma-400">
                <ProfileUserLink
                  username={mediator_username || mediator_name}
                  className="underline hover:text-plasma-300"
                  profileLabel={mediator_name ? `Profil de @${mediator_name}` : 'Profil du Ref'}
                >
                  @{mediator_name}
                </ProfileUserLink>{' '}
                postule comme Ref.
              </span>
              <div className="flex w-full gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRefuserRef?.();
                  }}
                  className="flex-1 rounded-xl bg-white/10 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/20"
                >
                  Refuser
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onValiderRef();
                  }}
                  className="flex-1 rounded-xl bg-plasma-600 py-2.5 text-xs font-bold text-white shadow-glow-plasma transition-colors hover:bg-plasma-500"
                >
                  Valider
                </button>
              </div>
            </div>
          )}
          {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && (
            <div className="flex w-full flex-col items-center justify-center py-2">
              <span className="text-sm text-center py-4 text-gray-400 font-medium italic">
                {user?.id === created_by
                  ? `En attente de ta validation du Ref (@${mediator_name})…`
                  : `En attente d'un Ref…`}
              </span>
            </div>
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
                  className="w-full py-1.5 text-center text-xs font-medium text-plasma-400/90 transition-colors hover:text-plasma-500"
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
              className="w-full rounded-xl border border-plasma-500/35 bg-plasma-500/15 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-plasma-500/25"
            >
              {liveAudienceAction.variant === 'return'
                ? "Retourner dans l'Agora"
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

      {isTeaserOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col md:flex-row md:items-center md:justify-center bg-obsidian-950 md:bg-obsidian-950/95 md:p-8"
          onClick={(e) => {
            e.stopPropagation();
            setIsTeaserOpen(false);
          }}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-5xl md:flex-row md:rounded-3xl md:border md:border-white/10 md:shadow-glow-plasma bg-obsidian-900"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setIsTeaserOpen(false)}
              className="absolute right-4 top-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-white/20"
              aria-label="Fermer l&apos;aperçu"
            >
              ✕
            </button>

            <div className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black md:aspect-auto">
              {video_url ? (
                <>
                  <video
                    ref={modalVideoRef}
                    src={video_url}
                    autoPlay
                    loop
                    playsInline
                    muted={isMuted}
                    onClick={handleToggleMute}
                    className="h-full w-full object-contain bg-black"
                  />
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="absolute bottom-4 right-4 z-[9999] flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                    aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                  >
                    {isMuted ? <VolumeX className="h-6 w-6" /> : <Volume2 className="h-6 w-6" />}
                  </button>
                </>
              ) : thumbnail ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- lightbox teaser, URL dynamiques */}
                  <img
                    src={thumbnail}
                    alt={title}
                    className="max-h-[50vh] w-full object-contain bg-black md:max-h-none md:h-full"
                  />
                </>
              ) : (
                <div className="text-white/30">Aucun média</div>
              )}
              {status === 'live' && (
                <div className="absolute left-4 top-4 z-20 flex items-center gap-1.5 rounded bg-blood-500 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-white shadow-glow-blood animate-pulse">
                  Live
                </div>
              )}
              {onTeaserAuraClick && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!has_liked_teaser) {
                      const newId = Date.now() + Math.random();
                      setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                      setTimeout(() => setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId)), 1000);
                    }
                    onTeaserAuraClick();
                  }}
                  className={`absolute right-4 z-[60] flex flex-col items-center gap-1.5 transition-transform hover:scale-105 ${
                    video_url ? 'bottom-20' : 'bottom-4'
                  }`}
                >
                  <AnimatePresence>
                    {teaserFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                        animate={{ opacity: 0, y: -40, scale: 1.5 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.65 }}
                        className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 text-sm font-black text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]"
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full border bg-black/60 backdrop-blur-md transition-colors ${
                      has_liked_teaser
                        ? 'border-yellow-400/50 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                        : 'border-white/10 hover:bg-white/20'
                    }`}
                  >
                    <Sparkles
                      className={`h-6 w-6 ${
                        has_liked_teaser
                          ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                          : 'text-white'
                      }`}
                    />
                  </div>
                  <span
                    className={`font-mono text-xs font-bold drop-shadow-md ${
                      has_liked_teaser
                        ? 'text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                        : 'text-white'
                    }`}
                  >
                    {(teaser_score || 0).toLocaleString()}
                  </span>
                </button>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-obsidian-900 p-6 md:p-8">
              <h2 className="mb-4 text-xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] md:text-2xl">
                {title}
              </h2>
              <div className="mb-6 flex items-center rounded-xl border border-white/10 bg-white/5 p-3 text-sm font-bold">
                <ProfileUserLink
                  username={challenger_a_username}
                  className="flex-1 truncate text-center text-plasma-300 drop-shadow-[0_0_8px_rgba(162,0,255,0.8)] transition-colors hover:text-plasma-200"
                >
                  {challenger_a_name || 'Challenger A'}
                </ProfileUserLink>
                <span className="mx-3 font-black italic text-white/30">VS</span>
                <ProfileUserLink
                  username={challenger_b_username}
                  className="flex-1 truncate text-center text-cyan-300 drop-shadow-[0_0_8px_rgba(0,240,255,0.8)] transition-colors hover:text-cyan-200"
                >
                  {challenger_b_name || 'Challenger B'}
                </ProfileUserLink>
              </div>
              <div className="relative mb-6 flex min-h-0 flex-1 flex-col">
                <div className="hide-scrollbar flex-1 overflow-y-auto pr-2 text-sm font-medium leading-relaxed text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.3)] whitespace-pre-wrap">
                  {description?.trim() ||
                    "Aucune description fournie. Rejoignez l'Agora pour découvrir l'enjeu de ce choc."}
                </div>
                {description && description.length > 150 && (
                  <div className="pointer-events-none absolute bottom-0 left-0 right-0 flex h-12 items-end justify-center bg-gradient-to-t from-obsidian-900 to-transparent pb-1">
                    <ChevronDown className="h-5 w-5 animate-bounce text-plasma-400 drop-shadow-[0_0_8px_rgba(162,0,255,0.8)]" />
                  </div>
                )}
              </div>
              <div className="mt-auto pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setIsTeaserOpen(false);
                    onClick();
                  }}
                  className="flex w-full items-center justify-center rounded-xl bg-plasma-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-glow-plasma transition-transform hover:scale-[1.02] hover:bg-plasma-500"
                >
                  Entrer dans l&apos;Agora
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
