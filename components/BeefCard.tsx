'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';

interface BeefCardProps {
  id: string;
  title: string;
  description?: string;
  host_name: string;
  host_username?: string | null;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready' | 'completed';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  thumbnail?: string;
  video_url?: string | null;
  duration?: number;
  engagement_score?: number;
  has_liked_by_user?: boolean;
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
  saisirTab?: boolean;
  onSaisirAffaire?: () => void;
  onValiderRef?: () => void;
  onRefuserRef?: () => void;
  onSeDesister?: () => void;
  onPrepareAudience?: () => void;
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
  duration: _duration,
  engagement_score = 0,
  has_liked_by_user = false,
  teaser_score = 0,
  has_liked_teaser = false,
  participants_count: _participants_count,
  challenger_a_name,
  challenger_b_name,
  challenger_a_username,
  challenger_b_username,
  mediator_name,
  mediator_username: _mediator_username,
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
  const { toast } = useToast();
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

  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      user.user_metadata?.username === host_username
    : false;

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (modalVideoRef.current) {
      modalVideoRef.current.muted = nextMuted;
      modalVideoRef.current.play().catch(() => {});
    }
  };

  useLayoutEffect(() => {
    if (!video_url?.trim()) return;
    const el = mediaBlockRef.current;
    if (!el) return;
    const v = videoRef.current;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.5) void v?.play().catch(() => {});
          else v?.pause();
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
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/90 backdrop-blur-md md:text-xs">
            ⚖️ EN ATTENTE
          </div>
        );
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 backdrop-blur-md md:text-xs">
            ▶ REPLAY
          </div>
        );
      case 'scheduled':
      case 'ready':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 backdrop-blur-md md:text-xs">
            <Calendar className="h-3 w-3 shrink-0" /> À VENIR
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 backdrop-blur-md md:text-xs">
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
    if (status === 'live') return minutesAgo < 60 ? `${minutesAgo}m` : `${Math.floor(minutesAgo / 60)}h`;
    return '';
  };

  const showCountdownTimer =
    (status === 'scheduled' || status === 'live') && !!scheduled_at && new Date(scheduled_at).getTime() > Date.now();
  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';
  const descText = description?.trim() ?? '';
  const auraTier = engagement_score >= 500 ? 3 : engagement_score >= 50 ? 2 : 1;

  const dynamicBorderClass =
    auraTier === 3
      ? 'border-volt-500/80 shadow-[0_0_20px_rgba(223,255,0,0.15)]'
      : auraTier === 2
        ? 'border-plasma-500/60 shadow-[0_0_15px_rgba(162,0,255,0.1)]'
        : 'border-white/[0.08] hover:border-white/20';

  return (
    <div className="relative flex h-full w-full flex-col">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={onClick}
        onMouseEnter={() => isReplay && setReplayHover(true)}
        onMouseLeave={() => isReplay && setReplayHover(false)}
        className={`group relative flex h-full min-h-[300px] w-full cursor-pointer flex-col overflow-hidden rounded-[1.2rem] border bg-[#08080A] transition-all duration-300 md:rounded-[1.5rem] ${dynamicBorderClass} ${status === 'live' ? 'shadow-[0_0_0_1px_rgba(162,0,255,0.35)]' : ''} ${isManifesto ? 'border-dashed border-white/20' : ''}`}
      >
        <div
          ref={mediaBlockRef}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setIsTeaserOpen(true);
          }}
          className="relative aspect-video w-full shrink-0 cursor-zoom-in overflow-hidden rounded-t-[1.2rem] bg-black/40 md:rounded-t-[1.5rem]"
        >
          {video_url ? (
            <video
              ref={videoRef}
              src={video_url}
              loop
              muted={isMuted}
              playsInline
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : thumbnail ? (
            <Image
              src={thumbnail}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 384px"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-obsidian-900 to-black" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/60" aria-hidden />

          <div className="absolute left-2 top-2 z-20 flex max-w-[60%] flex-col items-start gap-1">
            {status === 'live' && (
              <div className="flex w-fit items-center gap-1.5 rounded bg-blood-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-white shadow-glow-blood animate-pulse md:text-xs">
                <div className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
              </div>
            )}
            {auraTier === 3 && (
              <div className="flex w-fit items-center gap-1 rounded border border-volt-500/40 bg-volt-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-volt-400 backdrop-blur-md">
                <Sparkles className="h-2 w-2" /> Trending
              </div>
            )}
            {getPrimaryStatusBadge()}
          </div>

          <div className="absolute right-2 top-2 z-[60] flex flex-col items-end gap-1.5">
            {!!scheduled_at && (status === 'scheduled' || status === 'pending') && onNotifyClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReminded(!isReminded);
                  onNotifyClick?.();
                  toast(!isReminded ? 'Rappel activé' : 'Rappel annulé', 'success');
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full border backdrop-blur-md transition-all ${isReminded ? 'border-plasma-400 bg-plasma-500 text-white' : 'border-white/20 bg-black/60 text-white hover:bg-white/20'}`}
              >
                <Bell className={`h-3.5 w-3.5 ${isReminded ? 'fill-white' : ''}`} />
              </button>
            )}
            {(onEdit || onDelete || onForfeit) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white backdrop-blur-md hover:bg-white/20"
                  aria-expanded={isMenuOpen}
                  aria-label={"Actions sur l'affaire"}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </button>
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 z-[70] mt-2 w-40 overflow-hidden rounded-xl border border-white/10 bg-obsidian-900 py-1 shadow-2xl md:w-48"
                    >
                      {onEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(false);
                            onEdit();
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-medium text-gray-300 hover:bg-white/5 md:px-4 md:text-sm"
                        >
                          <Edit2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Modifier
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
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-prestige-gold hover:bg-prestige-gold/10 md:px-4 md:text-sm"
                        >
                          <Flag className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Forfait
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
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-blood-400 hover:bg-blood-500/10 md:px-4 md:text-sm"
                        >
                          <Trash2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Supprimer
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="absolute bottom-2 right-2 z-[50] flex max-w-[80%] flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              {showCountdownTimer && scheduled_at && status !== 'scheduled' && (
                <div className="rounded border border-white/20 bg-black/60 px-1.5 py-0.5 backdrop-blur-sm [&_*]:!text-[9px]">
                  <Countdown scheduledAt={scheduled_at} />
                </div>
              )}
              {status === 'live' && getTimeDisplay() && (
                <div className="flex h-6 items-center gap-0.5 rounded border border-white/20 bg-black/60 px-1.5 font-mono text-[10px] font-bold text-white/90 backdrop-blur-sm">
                  <Clock className="h-2.5 w-2.5" aria-hidden /> <span>{getTimeDisplay()}</span>
                </div>
              )}
              <div className="flex h-6 items-center gap-1 rounded border border-white/20 bg-black/60 px-1.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                <Eye className="h-3 w-3 shrink-0" aria-hidden strokeWidth={2.25} />
                <span>{viewer_count.toLocaleString()}</span>
              </div>
              {onAuraClick ? (
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!has_liked_by_user) {
                      const newId = Date.now() + Math.random();
                      setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                      setTimeout(() => setCardFloatingAuras((p) => p.filter((a) => a.id !== newId)), 1000);
                    }
                    onAuraClick();
                  }}
                  className={`relative flex h-6 items-center justify-center gap-1 rounded border bg-black/60 px-1.5 font-mono text-[10px] font-bold backdrop-blur-sm ${
                    has_liked_by_user ? 'border-volt-500/50 text-volt-400' : 'border-white/20 text-white hover:text-prestige-gold'
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
                        className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-volt-400"
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <Sparkles className={`h-2.5 w-2.5 shrink-0 ${has_liked_by_user ? 'fill-current' : ''}`} aria-hidden />
                  <span>{engagement_score.toLocaleString()}</span>
                </motion.button>
              ) : (
                <div className="flex h-6 items-center gap-1 rounded border border-white/20 bg-black/60 px-1.5 font-mono text-[10px] font-bold text-white backdrop-blur-sm">
                  <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden />
                  <span>{engagement_score.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>

          <div className="absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
            {status === 'scheduled' && scheduled_at && (
              <div
                className="origin-bottom-left scale-90 rounded border border-cyan-500/40 bg-black/70 px-2 py-1 shadow-lg backdrop-blur-md [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400"
                aria-live="polite"
              >
                <Countdown scheduledAt={scheduled_at} />
              </div>
            )}
            {video_url && (
              <button
                type="button"
                onClick={handleToggleMute}
                className="rounded-full border border-white/20 bg-black/50 p-1.5 backdrop-blur-md transition-colors hover:bg-black/70"
                aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
              </button>
            )}
          </div>
        </div>

        <div className="relative z-10 flex min-h-0 flex-grow flex-col bg-[#08080A] p-3 md:p-4">
          <h3 className="mb-1 line-clamp-2 font-sans text-[13px] font-bold leading-snug text-white md:text-[15px]">{title}</h3>

          <div className="mb-2 flex flex-col gap-1.5">
            <span className="w-full truncate font-black italic text-[11px] uppercase tracking-widest text-white md:text-[13px]">
              {challenger_a_name || host_name || '?'} <span className="text-plasma-500">VS</span> {challenger_b_name || '?'}
            </span>
            {mediator_name ? (
              <span className="w-fit rounded border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold tracking-wide text-gray-300 md:text-[10px]">
                REF : <span className="text-white">@{mediator_name}</span>
              </span>
            ) : (
              <span className="w-fit rounded border border-plasma-500/30 bg-plasma-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-plasma-400 md:text-[10px]">
                En attente de Ref
              </span>
            )}
          </div>

          {descText ? (
            <div className="mb-2 flex flex-col items-start">
              <p className={`break-words text-[10px] font-medium text-white/60 md:text-[11px] ${isDescExpanded ? '' : 'line-clamp-2'}`}>
                {descText}
              </p>
              {descText.length > 60 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsDescExpanded(!isDescExpanded);
                  }}
                  className="mt-0.5 text-[9px] font-bold text-plasma-400"
                >
                  {isDescExpanded ? 'Réduire' : 'Voir plus'}
                </button>
              )}
            </div>
          ) : null}
          {tags.length > 0 && (
            <div className="mt-auto flex flex-wrap gap-1 pt-2">
              {tags.slice(0, 3).map((tag, idx) =>
                onTagClick ? (
                  <button
                    key={idx}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onTagClick(tag);
                    }}
                    className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[8px] font-bold text-white/40 hover:text-plasma-300 md:text-[9px]"
                  >
                    #{tag}
                  </button>
                ) : (
                  <span
                    key={idx}
                    className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[8px] font-bold text-white/40 md:text-[9px]"
                  >
                    #{tag}
                  </span>
                ),
              )}
            </div>
          )}
        </div>

        {((status === 'pending' &&
          ((!mediator_name && onSaisirAffaire && !isParticipant) || (mediator_name && onValiderRef) || (mediator_name && !onValiderRef && !onSaisirAffaire))) ||
          (status === 'scheduled' && (onPrepareAudience || onSeDesister)) ||
          (status === 'live' && liveAudienceAction) ||
          (isManifesto && onApply)) && (
          <div className="mt-auto bg-[#08080A] px-3 pb-3 pt-0">
            {isManifesto && onApply && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApply?.();
                }}
                className="mb-2 text-[9px] font-medium text-prestige-gold/80 hover:underline"
              >
                + Rôle au ring
              </button>
            )}

            {status === 'pending' && onSaisirAffaire && !mediator_name && !isParticipant && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSaisirAffaire();
                }}
                className="w-full rounded-xl bg-white py-2 text-[10px] font-black uppercase tracking-widest text-black hover:bg-gray-200 md:text-xs"
              >
                Devenir le Ref
              </button>
            )}

            {status === 'pending' && !!mediator_name && onValiderRef && (
              <div className="flex flex-col gap-1.5">
                <span className="text-[9px] text-plasma-400">@{mediator_name} postule.</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRefuserRef?.();
                    }}
                    className="flex-1 rounded-lg bg-white/10 py-1.5 text-[10px] font-bold text-white"
                  >
                    Refuser
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onValiderRef();
                    }}
                    className="flex-1 rounded-lg bg-plasma-600 py-1.5 text-[10px] font-bold text-white"
                  >
                    Valider
                  </button>
                </div>
              </div>
            )}

            {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && (
              <span className="block py-2 text-center text-[10px] italic text-gray-500">
                {user?.id === created_by ? (
                  <>
                    En attente de ta validation du Ref (@{mediator_name})…
                  </>
                ) : (
                  <>En attente d&apos;un Ref…</>
                )}
              </span>
            )}

            {status === 'scheduled' && onPrepareAudience && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPrepareAudience();
                }}
                className="mb-1 w-full rounded-xl border border-white/20 py-2 text-[11px] font-semibold text-white"
              >
                Préparer l&apos;Audience
              </button>
            )}
            {status === 'scheduled' && onSeDesister && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSeDesister();
                }}
                className="w-full text-center text-[10px] text-plasma-400/80"
              >
                Se désister
              </button>
            )}

            {status === 'live' && liveAudienceAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  liveAudienceAction.onClick();
                }}
                className="w-full rounded-xl border border-plasma-500/40 bg-plasma-500/20 py-2 text-[10px] font-bold text-white md:text-xs"
              >
                {liveAudienceAction.variant === 'return' ? "Retourner dans l'Agora" : "Rejoindre l'Audience"}
              </button>
            )}
          </div>
        )}

        {isReplay && (
          <AnimatePresence>
            {replayHover && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[3] flex items-center justify-center rounded-t-[1.2rem] bg-black/60 backdrop-blur-sm md:rounded-t-[1.5rem]"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <Play className="ml-1 h-5 w-5 fill-white text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </motion.div>

      {isTeaserOpen && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-obsidian-950 md:flex-row md:items-center md:justify-center md:bg-obsidian-950/95 md:p-8"
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            setIsTeaserOpen(false);
          }}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden bg-obsidian-900 shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-5xl md:flex-row md:rounded-3xl md:border md:border-white/10"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setIsTeaserOpen(false)}
              className="absolute right-4 top-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-white/20"
              aria-label={"Fermer l'aperçu"}
            >
              ✕
            </button>

            <div className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black">
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
                    className="h-full w-full object-contain"
                  />
                  <button
                    type="button"
                    onClick={handleToggleMute}
                    className="absolute bottom-4 right-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/60 text-white backdrop-blur-md transition-colors hover:bg-white/20"
                    aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                  >
                    {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                  </button>
                </>
              ) : thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- teaser modal pleine page
                <img src={thumbnail} alt={title} className="max-h-[50vh] w-full bg-black object-contain md:h-full md:max-h-none" />
              ) : (
                <div className="text-white/40">Aucun média</div>
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
                  aria-label="Aura teaser"
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

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 md:p-8">
              <h2 className="mb-4 text-xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] md:text-2xl">
                {title}
              </h2>
              <div className="mb-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="hide-scrollbar flex-1 overflow-y-auto pr-2 text-sm font-medium leading-relaxed text-white/80 whitespace-pre-wrap">
                  {descText ||
                    'Aucune description. Rejoignez l\'Agora pour découvrir l\'enjeu de cette affaire.'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsTeaserOpen(false);
                  onClick();
                }}
                className="mt-auto w-full rounded-xl bg-plasma-600 py-4 text-sm font-black uppercase tracking-widest text-white shadow-glow-plasma transition-transform hover:scale-[1.02] hover:bg-plasma-500"
              >
                Entrer dans l&apos;Agora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
