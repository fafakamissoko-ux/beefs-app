'use client';

import React, { useState, useRef, useLayoutEffect } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';

/** Alias pour éviter le motif `}[` dans `useState<…>(…)` sous SWC/TSX. */
type FloatingAuraChip = { id: number; x: number };

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
  challenger_c_name?: string | null;
  challenger_d_name?: string | null;
  challenger_a_username?: string | null;
  challenger_b_username?: string | null;
  challenger_c_username?: string | null;
  challenger_d_username?: string | null;
  challenger_c_avatar?: string | null;
  challenger_d_avatar?: string | null;
  mediator_id?: string | null;
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
  challenger_c_name,
  challenger_d_name,
  challenger_a_username,
  challenger_b_username,
  challenger_c_username,
  challenger_d_username,
  challenger_c_avatar: _challenger_c_avatar,
  challenger_d_avatar: _challenger_d_avatar,
  mediator_id,
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

  const [cardFloatingAuras, setCardFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [teaserFloatingAuras, setTeaserFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [replayHover, setReplayHover] = useState(false);
  const [isTeaserOpen, setIsTeaserOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReminded, setIsReminded] = useState(false);

  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      user.user_metadata?.username === challenger_c_username ||
      user.user_metadata?.username === challenger_d_username ||
      user.user_metadata?.username === host_username
    : false;

  const isWaitingForMe =
    status === 'pending' &&
    Boolean(mediator_id) &&
    user?.id === mediator_id &&
    user?.id !== created_by;

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

  function getPrimaryStatusBadge(): React.ReactNode {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/90 backdrop-blur-md md:text-xs">
            EN ATTENTE
          </div>
        );
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 backdrop-blur-md md:text-xs">
            REPLAY
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
  }

  const getTimeDisplay = () => {
    const now = Date.now();
    const createdTime = new Date(created_at).getTime();
    const minutesAgo = Math.floor((now - createdTime) / 60000);
    if (status === 'live') return minutesAgo < 60 ? `${minutesAgo}m` : `${Math.floor(minutesAgo / 60)}h`;
    return '';
  };

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

  const chromeRelative =
    'relative flex h-full w-full flex-col overflow-hidden rounded-[1.2rem] border bg-black transition-all duration-300 md:rounded-[1.5rem]';
  const liveRing = status === 'live' ? 'shadow-[0_0_0_1px_rgba(162,0,255,0.35)]' : '';
  const manifestoStroke = isManifesto ? 'border-dashed border-white/20' : '';
  const beefCardChromeClass = [chromeRelative, dynamicBorderClass, liveRing, manifestoStroke].filter(Boolean).join(' ');

  return (
    <div className={beefCardChromeClass}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => setIsTeaserOpen(true)}
        onMouseEnter={() => isReplay && setReplayHover(true)}
        onMouseLeave={() => isReplay && setReplayHover(false)}
        className="group relative aspect-[3/4] max-h-[75vh] w-full shrink-0 cursor-pointer overflow-hidden bg-black"
      >
        <div
          ref={mediaBlockRef}
          className="absolute inset-0 z-0 h-full w-full overflow-hidden rounded-[1.2rem] bg-black md:rounded-[1.5rem]"
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
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-[5]" aria-hidden />

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
            {video_url && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute(e);
                }}
                className="rounded-full border border-white/20 bg-black/60 p-1.5 backdrop-blur-md transition-colors hover:bg-black/70"
                aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
              </button>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
            {status === 'scheduled' && scheduled_at && (
              <div
                className="pointer-events-auto origin-bottom-left scale-90 rounded border border-cyan-500/40 bg-black/70 px-2 py-1 shadow-lg backdrop-blur-md [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400"
                aria-live="polite"
              >
                <Countdown scheduledAt={scheduled_at} />
              </div>
            )}
          </div>
        </div>

        {/* OVERLAY D'INFORMATIONS TIKTOK */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-4 pt-20">
          <h3 className="mb-2 line-clamp-2 font-sans text-[15px] font-bold leading-snug text-white md:text-[17px] drop-shadow-md">
            {title}
          </h3>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 font-sans text-[10px] font-black uppercase tracking-widest text-white/90 sm:text-xs drop-shadow-md">
            <span className="italic">{challenger_a_name || 'Challenger 1'}</span>
            <span className="text-brand-400">VS</span>
            <span className="italic">{challenger_b_name || 'Challenger 2'}</span>
            {challenger_c_name && (
              <>
                <span className="text-brand-400">VS</span>
                <span className="italic">{challenger_c_name}</span>
              </>
            )}
            {challenger_d_name && (
              <>
                <span className="text-brand-400">VS</span>
                <span className="italic">{challenger_d_name}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
            {mediator_name ? (
              <span className="w-fit rounded-full border border-white/20 bg-black/40 px-2.5 py-1 text-[9px] font-bold tracking-wide text-gray-200 backdrop-blur-md sm:text-[10px]">
                REF: <span className="text-white">@{mediator_name}</span>
              </span>
            ) : (
              <span className="w-fit rounded-full border border-plasma-500/40 bg-plasma-500/20 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-plasma-300 backdrop-blur-md sm:text-[10px]">
                En attente de Ref
              </span>
            )}

            <div className="flex items-center gap-1.5">
              {status === 'live' && getTimeDisplay() && (
                <div className="flex h-7 items-center gap-1 rounded-full border border-white/20 bg-black/50 px-2 font-mono text-[10px] font-bold text-white/90 backdrop-blur-md">
                  <Clock className="h-3 w-3" aria-hidden /> <span>{getTimeDisplay()}</span>
                </div>
              )}
              <div className="flex h-7 items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 font-mono text-[10px] font-bold text-white backdrop-blur-md">
                <Eye className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />{' '}
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
                  className={`relative flex h-7 items-center gap-1.5 rounded-full border bg-black/50 px-2.5 font-mono text-[10px] font-bold backdrop-blur-md ${
                    has_liked_by_user ? 'border-volt-500/50 text-volt-400' : 'border-white/20 text-white hover:text-volt-400'
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
                  <Sparkles className={`h-3.5 w-3.5 ${has_liked_by_user ? 'fill-current' : ''}`} aria-hidden />
                  <span>{engagement_score.toLocaleString()}</span>
                </motion.button>
              ) : (
                <div className="flex h-7 items-center gap-1.5 rounded-full border border-white/20 bg-black/50 px-2.5 font-mono text-[10px] font-bold text-white backdrop-blur-md">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden /> <span>{engagement_score.toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {isReplay && (
          <AnimatePresence>
            {replayHover && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[40] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <Play className="ml-1 h-5 w-5 fill-white text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
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
              {tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {tags.map((tag, idx) => (
                    <span key={idx} className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-bold text-white/40">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* --- DYNAMIC CTA (Monolith Standard) --- */}
              <div className="mt-auto flex flex-col gap-3 pt-4">
                {isReplay || status === 'cancelled' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsTeaserOpen(false);
                      onClick();
                    }}
                    className="w-full rounded-xl border border-white/20 bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 active:scale-95"
                  >
                    Voir le Verdict & Résumé
                  </button>
                ) : status === 'live' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (liveAudienceAction) {
                        liveAudienceAction.onClick();
                      } else {
                        onClick();
                      }
                      setIsTeaserOpen(false);
                    }}
                    className={`w-full rounded-xl py-4 text-sm font-black uppercase tracking-widest transition-transform hover:scale-[1.02] active:scale-95 ${
                      liveAudienceAction?.variant === 'return'
                        ? 'bg-blood-600 text-white shadow-glow-blood'
                        : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                    }`}
                  >
                    {liveAudienceAction?.variant === 'return' ? '⚔️ Retourner au Front' : '🔴 Rejoindre le Direct'}
                  </button>
                ) : status === 'scheduled' ? (
                  onPrepareAudience ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onPrepareAudience();
                        setIsTeaserOpen(false);
                      }}
                      className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-[1.02] active:scale-95"
                    >
                      🎛️ Préparer la Régie
                    </button>
                  ) : (
                    <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-sm font-bold text-white/50">
                      En attente du direct
                    </div>
                  )
                ) : (
                  /* PENDING & MANIFESTO */
                  <div className="flex flex-col gap-2">
                    {isManifesto && onApply && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onApply?.();
                          setIsTeaserOpen(false);
                        }}
                        className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-3 text-xs font-bold uppercase tracking-widest text-prestige-gold transition-colors hover:bg-prestige-gold/20"
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
                          setIsTeaserOpen(false);
                        }}
                        className="w-full rounded-xl bg-prestige-gold py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(212,175,55,0.5)] transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        Devenir le Ref
                      </button>
                    )}
                    {status === 'pending' && !!mediator_name && onValiderRef && (
                      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <span className="text-center text-[11px] text-gray-300">@{mediator_name} postule.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRefuserRef?.();
                              setIsTeaserOpen(false);
                            }}
                            className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onValiderRef();
                              setIsTeaserOpen(false);
                            }}
                            className="flex-1 rounded-lg bg-prestige-gold py-2.5 text-xs font-bold text-black shadow-[0_0_10px_rgba(212,175,55,0.4)] hover:bg-yellow-500"
                          >
                            Valider
                          </button>
                        </div>
                      </div>
                    )}
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && (
                      <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                        {user?.id === created_by
                          ? user?.id !== mediator_id
                            ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…`
                            : null
                          : isWaitingForMe
                            ? null
                            : "En attente d'un Ref…"}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Secondaire : Désistement */}
                {status === 'scheduled' && onSeDesister && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSeDesister();
                      setIsTeaserOpen(false);
                    }}
                    className="mt-1 w-full text-center text-[11px] font-semibold text-white/40 hover:text-white"
                  >
                    Se désister
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </motion.div>
    </div>
  );
}
