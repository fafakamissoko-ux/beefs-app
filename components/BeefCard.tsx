'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { AuraGiversModal } from '@/components/AuraGiversModal';

/** Alias pour éviter le motif `}[` dans `useState<…>(…)` sous SWC/TSX. */
type FloatingAuraChip = { id: number; x: number };

let globalIsMuted = true;

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
  isActiveVideo?: boolean;
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
  isActiveVideo = false,
}: BeefCardProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isMuted, setIsMuted] = useState(globalIsMuted);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaBlockRef = useRef<HTMLDivElement | null>(null);

  const [cardFloatingAuras, setCardFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [teaserFloatingAuras, setTeaserFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [replayHover, setReplayHover] = useState(false);
  const [isTeaserOpen, setIsTeaserOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReminded, setIsReminded] = useState(false);
  const [isBeefAuraModalOpen, setIsBeefAuraModalOpen] = useState(false);
  const [isTeaserAuraModalOpen, setIsTeaserAuraModalOpen] = useState(false);
  const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);
  const localAuraLock = useRef(false);
  const localTeaserAuraLock = useRef(false);

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
    globalIsMuted = nextMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (modalVideoRef.current) {
      modalVideoRef.current.muted = nextMuted;
      modalVideoRef.current.play().catch(() => {});
    }
  };

  function getPrimaryStatusBadge(): React.ReactNode {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/90 md:text-xs">
            EN ATTENTE
          </div>
        );
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
            REPLAY
          </div>
        );
      case 'scheduled':
      case 'ready':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
            <Calendar className="h-3 w-3 shrink-0" /> À VENIR
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 md:text-xs">
            ANNULÉ
          </div>
        );
      default:
        return null;
    }
  }

  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';
  const descText = description?.trim() ?? '';
  const auraTier = engagement_score >= 500 ? 3 : engagement_score >= 50 ? 2 : 1;

  const baseSystem = 'relative flex h-full w-full flex-col overflow-hidden rounded-[1.2rem] transition-all duration-300 md:rounded-[1.5rem] bg-black/20';

  let statusVariant = '';
  if (status === 'live') statusVariant = 'ring-2 ring-cyan-400 border-transparent';
  else if (status === 'pending' || status === 'scheduled' || status === 'ready') statusVariant = 'ring-1 ring-white/10';
  else if (status === 'ended' || status === 'replay' || status === 'completed' || status === 'cancelled') statusVariant = 'opacity-60 saturate-75 hover:opacity-100 hover:saturate-100';

  const auraFX = auraTier === 3 ? 'shadow-[0_0_20px_rgba(223,255,0,0.15)]' : auraTier === 2 ? 'shadow-[0_0_15px_rgba(0,240,255,0.1)]' : '';
  const manifestoStroke = isManifesto ? 'border-dashed border-white/20' : '';

  const beefCardChromeClass = [baseSystem, statusVariant, auraFX, manifestoStroke].filter(Boolean).join(' ');

  const getPendingRefText = () => {
    // Si ce n'est pas un manifeste, le Ref est déjà présent. On attend les combattants.
    if (intent !== 'manifesto') {
      return "En attente des participants…";
    }

    // Logique spécifique aux manifestes
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validation…' : "En attente d'un Ref…";
  };
  const pendingRefText = getPendingRefText();

  return (
    <div className={beefCardChromeClass}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => setIsTeaserOpen(true)}
        onMouseEnter={() => isReplay && setReplayHover(true)}
        onMouseLeave={() => isReplay && setReplayHover(false)}
        className="group relative aspect-[3/4] max-h-[70dvh] w-full shrink-0 cursor-pointer overflow-hidden bg-transparent"
      >
        <div
          ref={mediaBlockRef}
          className="absolute inset-0 z-0 h-full w-full overflow-hidden rounded-[1.2rem] bg-transparent md:rounded-[1.5rem]"
        >
          {isActiveVideo && video_url ? (
            <video
              ref={videoRef}
              src={video_url}
              autoPlay
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
              <div className="flex w-fit items-center gap-1 rounded border border-volt-500/40 bg-volt-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-volt-400">
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
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${isReminded ? 'border-cyan-400 bg-cyan-500 text-white' : 'bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20'}`}
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
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20"
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
                      className="absolute right-0 z-[70] mt-2 w-40 overflow-hidden rounded-xl bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl py-1 md:w-48"
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
                className="rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-1.5 transition-colors hover:bg-white/20"
                aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
              </button>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
            {status === 'scheduled' && scheduled_at && (
              <div
                className="pointer-events-auto origin-bottom-left scale-90 rounded bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2 py-1 [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400"
                aria-live="polite"
              >
                <Countdown scheduledAt={scheduled_at} />
              </div>
            )}
          </div>
        </div>

        {/* OVERLAY D'INFORMATIONS TIKTOK */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-2.5 pt-12 sm:p-4 sm:pt-20">
          <h3 className="mb-1 sm:mb-2 line-clamp-2 font-sans text-[13px] sm:text-[15px] leading-tight font-bold text-white md:text-[17px] drop-shadow-md">
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
              <span className="w-fit rounded-full border border-white/20 bg-black/40 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-gray-200 sm:px-2.5 sm:py-1 sm:text-[10px]">
                REF: <span className="text-white">@{mediator_name}</span>
              </span>
            ) : (
              <span className="w-fit rounded-full border border-prestige-gold/40 bg-prestige-gold/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-prestige-gold sm:px-2.5 sm:py-1 sm:text-[10px]">
                En attente de Ref
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <div
                className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsViewsModalOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                <span>{viewer_count.toLocaleString()}</span>
              </div>
              {onAuraClick ? (
                <div
                  className={`relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg font-mono text-[9px] sm:text-[10px] font-bold ${
                    has_liked_by_user ? 'border-amber-400/50 text-amber-400' : 'border-white/10 text-white'
                  }`}
                >
                  <AnimatePresence>
                    {cardFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                        animate={{ opacity: 0, y: -28, scale: 1.1 }}
                        exit={{ opacity: 0 }}
                        className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-amber-400"
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <button
                    type="button"
                    className={`flex h-full items-center justify-center pl-2.5 pr-1.5 transition-all hover:bg-white/10 active:bg-white/20 ${
                      !has_liked_by_user ? 'hover:text-amber-400' : ''
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_by_user && !localAuraLock.current) {
                        localAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                        setTimeout(() => {
                          setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
                          localAuraLock.current = false;
                        }, 1500);
                      }
                      onAuraClick();
                    }}
                    aria-label={has_liked_by_user ? "Retirer l'Aura" : "Envoyer de l'Aura"}
                  >
                    <Sparkles
                      className={
                        'h-3.5 w-3.5 ' +
                        (has_liked_by_user
                          ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]'
                          : '')
                      }
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              ) : (
                <div className="relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg font-mono text-[9px] sm:text-[10px] font-bold text-white">
                  <div className="flex h-full items-center justify-center pl-2.5 pr-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
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
        {isTeaserOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-black/20 backdrop-blur-[2px] md:flex-row md:items-center md:justify-center md:p-8"
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            setIsTeaserOpen(false);
          }}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-5xl md:flex-row md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setIsTeaserOpen(false)}
              className="absolute right-4 top-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
              aria-label={"Fermer l'aperçu"}
            >
              ✕
            </button>

            <div className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black/20">
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
                    className="absolute bottom-4 right-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
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
                <div
                  className={`absolute right-4 z-[9999] flex flex-col items-center gap-1.5 ${
                    video_url ? 'bottom-24' : 'bottom-4'
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
                        className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 text-sm font-black text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!has_liked_teaser && !localTeaserAuraLock.current) {
                        localTeaserAuraLock.current = true;
                        const newId = Date.now() + Math.random();
                        setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                        setTimeout(() => {
                          setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                          localTeaserAuraLock.current = false;
                        }, 1500);
                      }
                      onTeaserAuraClick();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        onTeaserAuraClick();
                      }
                    }}
                    aria-label="Aura teaser"
                    className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg transition-transform active:scale-90 ${
                      has_liked_teaser
                        ? 'border-amber-400/50 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                        : 'border-white/10 hover:bg-white/20'
                    }`}
                  >
                    <Sparkles
                      className={`h-6 w-6 ${
                        has_liked_teaser
                          ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                          : 'text-white'
                      }`}
                    />
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTeaserAuraModalOpen(true);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsTeaserAuraModalOpen(true);
                      }
                    }}
                    aria-label="Voir les donateurs d'Aura teaser"
                    className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold drop-shadow-md transition-transform active:scale-95 ${
                      has_liked_teaser
                        ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                        : 'text-white'
                    }`}
                  >
                    {(teaser_score || 0).toLocaleString()}
                  </span>
                </div>
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
                    <span key={idx} className="rounded border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-bold text-white/80">
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
                    {liveAudienceAction?.variant === 'return' ? '⚔️ Retourner dans l\'Agora' : '🔴 Rejoindre le Direct'}
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
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                        setIsTeaserOpen(false);
                      }}
                      className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                    >
                      Rejoindre la salle d'attente
                    </button>
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
                    {status === 'pending' && !!mediator_name && !onValiderRef && !onSaisirAffaire && pendingRefText && (
                      <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                        {pendingRefText}
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
        , document.body)}
      </motion.div>

      <AuraGiversModal
        isOpen={isBeefAuraModalOpen}
        onClose={() => setIsBeefAuraModalOpen(false)}
        targetId={id}
        type="beef"
        ownerId={mediator_id || created_by || ''}
      />
      <AuraGiversModal
        isOpen={isTeaserAuraModalOpen}
        onClose={() => setIsTeaserAuraModalOpen(false)}
        targetId={id}
        type="teaser"
        ownerId={created_by || ''}
      />
      <AuraGiversModal
        isOpen={isViewsModalOpen}
        onClose={() => setIsViewsModalOpen(false)}
        targetId={id}
        type="views"
        ownerId={mediator_id || created_by || ''}
      />
    </div>
  );
}
