'use client';

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Play, Sparkles, Volume2, VolumeX, MessageCircle } from 'lucide-react';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';

type FloatingAuraChip = { id: number; x: number };

type BeefStatus = 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready' | 'completed';

interface BeefTeaserModalProps {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  videoUrl?: string | null;
  tags: string[];
  status: BeefStatus;
  isMuted: boolean;
  onToggleMute: (e: React.MouseEvent) => void;
  modalVideoRef: React.Ref<HTMLVideoElement>;
  teaserScore: number;
  hasLikedTeaser: boolean;
  onTeaserAuraClick?: () => void;
  onCommentClick?: () => void;
  onClose: () => void;
  onClick: () => void;
  createdBy?: string | null;
  isManifesto: boolean;
  onApply?: () => void;
  onSaisirAffaire?: () => void;
  mediatorName?: string | null;
  onValiderRef?: () => void;
  onRefuserRef?: () => void;
  onSeDesister?: () => void;
  onPrepareAudience?: () => void;
  liveAudienceAction?: { variant: 'join' | 'return'; onClick: () => void };
  userInviteStatus?: string | null;
  isParticipant: boolean;
  pendingRefText: string | null;
  onTeaserAuraModalOpen: () => void;
}

export function BeefTeaserModal({
  id,
  title,
  description,
  thumbnail,
  videoUrl,
  tags,
  status,
  isMuted,
  onToggleMute,
  modalVideoRef,
  teaserScore,
  hasLikedTeaser,
  onTeaserAuraClick,
  onCommentClick,
  onClose,
  onClick,
  createdBy,
  isManifesto,
  onApply,
  onSaisirAffaire,
  mediatorName,
  onValiderRef,
  onRefuserRef,
  onSeDesister,
  onPrepareAudience,
  liveAudienceAction,
  userInviteStatus,
  isParticipant,
  pendingRefText,
  onTeaserAuraModalOpen,
}: BeefTeaserModalProps) {
  const [floatingAuras, setFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const descText = description?.trim() ?? '';

  const fireAura = () => {
    if (!hasLikedTeaser) {
      const newId = Date.now() + Math.random();
      setFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
      setTimeout(() => {
        setFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
      }, 800);
    }
    onTeaserAuraClick?.();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex flex-col bg-black/20 backdrop-blur-[2px] md:flex-row md:items-center md:justify-center md:p-8"
      role="presentation"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
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
          onClick={onClose}
          className="absolute right-4 top-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
          aria-label={"Fermer l'aperçu"}
        >
          ✕
        </button>

        {/* --- MEDIA --- */}
        <div className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black overflow-hidden">
          {thumbnail && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30 blur-2xl scale-110 pointer-events-none" />
          )}

          {videoUrl ? (
            <video
              ref={modalVideoRef}
              src={videoUrl}
              autoPlay
              loop
              playsInline
              muted={isMuted}
              onClick={onToggleMute}
              className="relative z-10 h-full w-full object-contain"
            />
          ) : thumbnail ? (
            // eslint-disable-next-line @next/next/no-img-element -- teaser modal pleine page
            <img src={thumbnail} alt={title} className="relative z-10 max-h-[50vh] w-full object-contain md:h-full md:max-h-none" />
          ) : (
            <div className="relative z-10 text-white/40">Aucun média</div>
          )}

          {(videoUrl || onTeaserAuraClick) && (
            <div className="absolute bottom-4 right-4 z-[9999] flex flex-col-reverse items-center gap-3">
              {videoUrl && (
                <button
                  type="button"
                  onClick={onToggleMute}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
                  aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                >
                  {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                </button>
              )}

              {onTeaserAuraClick && (
                <div className="relative flex flex-col items-center gap-1.5">
                  <AnimatePresence>
                    {floatingAuras.map((aura) => (
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
                  <div className="flex items-center gap-1.5">
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); fireAura(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); fireAura(); } }}
                      aria-label="Aura teaser"
                      className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg transition-transform active:scale-90 ${
                        hasLikedTeaser
                          ? 'border-amber-400/50 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                          : 'border-white/10 hover:bg-white/20'
                      }`}
                    >
                      <Sparkles
                        className={`h-6 w-6 ${
                          hasLikedTeaser
                            ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                            : 'text-white'
                        }`}
                      />
                    </div>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCommentClick?.(); }}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onCommentClick?.(); } }}
                      aria-label="Voir les commentaires"
                      className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-slate-900/40 shadow-lg backdrop-blur-sm text-white transition-all hover:bg-white/10 active:scale-95"
                    >
                      <MessageCircle className="h-6 w-6" strokeWidth={2.25} />
                    </div>
                  </div>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); onTeaserAuraModalOpen(); }}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onTeaserAuraModalOpen(); } }}
                    aria-label="Voir les donateurs d'Aura teaser"
                    className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold drop-shadow-md transition-transform active:scale-95 ${
                      hasLikedTeaser
                        ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                        : 'text-white'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <InlineAuraGivers targetId={id} type="teaser" ownerId={createdBy || ''} />
                      <span>{(teaserScore || 0).toLocaleString()}</span>
                    </div>
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* --- CONTENU + CTA --- */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 md:p-8">
          <h2 className="mb-4 text-xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] md:text-2xl">
            {title}
          </h2>
          <div className="mb-4 flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="hide-scrollbar flex-1 overflow-y-auto pr-2 text-sm font-medium leading-relaxed text-white/80 whitespace-pre-wrap">
              {descText || 'Aucune description. Rejoignez l\'Agora pour découvrir l\'enjeu de cette affaire.'}
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

          <div className="mt-auto flex flex-col gap-3 pt-4">
            {status === 'replay' ? (
              <button
                type="button"
                onClick={() => { onClose(); onClick(); }}
                className="w-full rounded-xl border border-cyan-500/50 bg-cyan-500/20 py-4 text-sm font-bold uppercase tracking-widest text-cyan-300 shadow-[0_0_15px_rgba(0,240,255,0.2)] transition-all hover:bg-cyan-500/30 active:scale-95 flex items-center justify-center gap-2"
              >
                <Play className="w-5 h-5 fill-current" /> Regarder le Replay
              </button>
            ) : status === 'ended' || status === 'completed' || status === 'cancelled' ? (
              <button
                type="button"
                onClick={() => { onClose(); onClick(); }}
                className="w-full rounded-xl border border-white/20 bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 active:scale-95"
              >
                Voir le Verdict & Résumé
              </button>
            ) : status === 'live' ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (liveAudienceAction) liveAudienceAction.onClick();
                  else onClick();
                  onClose();
                }}
                className={`w-full rounded-xl py-4 text-sm font-black uppercase tracking-widest transition-transform hover:scale-[1.02] active:scale-95 ${
                  liveAudienceAction?.variant === 'return'
                    ? 'bg-blood-600 text-white shadow-glow-blood'
                    : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                }`}
              >
                {liveAudienceAction?.variant === 'return' ? '⚔️ Retourner dans l\'Agora' : '🔴 Rejoindre l\'Agora'}
              </button>
            ) : status === 'scheduled' || status === 'pending' || status === 'ready' ? (
              <div className="flex flex-col gap-2">
                {onPrepareAudience ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onPrepareAudience(); onClose(); }}
                    className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    🎛️ Préparer la Régie
                  </button>
                ) : (
                  <>
                    {isManifesto && onApply && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onApply?.(); onClose(); }}
                        className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-3 text-xs font-bold uppercase tracking-widest text-prestige-gold transition-colors hover:bg-prestige-gold/20"
                      >
                        + Rôle au ring
                      </button>
                    )}
                    {status === 'pending' && onSaisirAffaire && !mediatorName && !isParticipant && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSaisirAffaire(); onClose(); }}
                        className="w-full rounded-xl bg-prestige-gold py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(212,175,55,0.5)] transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        Devenir le Ref
                      </button>
                    )}
                    {status === 'pending' && !!mediatorName && onValiderRef && (
                      <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                        <span className="text-center text-[11px] text-gray-300">@{mediatorName} postule.</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onRefuserRef?.(); onClose(); }}
                            className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onValiderRef(); onClose(); }}
                            className="flex-1 rounded-lg bg-prestige-gold py-2.5 text-xs font-bold text-black shadow-[0_0_10px_rgba(212,175,55,0.4)] hover:bg-yellow-500"
                          >
                            Valider
                          </button>
                        </div>
                      </div>
                    )}

                    {(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef)) && (
                      <>
                        {userInviteStatus === 'pending' ? (
                          <div className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-4 text-center text-sm font-bold text-prestige-gold">
                            ⚠️ Convocation en attente
                          </div>
                        ) : userInviteStatus === 'declined' ? (
                          <div className="w-full rounded-xl border border-blood-500/40 bg-blood-500/10 py-4 text-center text-sm font-bold text-blood-400">
                            ❌ Convocation refusée
                          </div>
                        ) : userInviteStatus === 'accepted' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
                            className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                          >
                            Salle d'attente Combattant
                          </button>
                        ) : status === 'ready' ? (
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onClick(); onClose(); }}
                            className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                          >
                            Rejoindre le sas public
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled
                            className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-white/5 py-4 text-sm font-bold uppercase tracking-widest text-white/30"
                          >
                            Ouverture prochaine...
                          </button>
                        )}

                        {status === 'pending' && pendingRefText && userInviteStatus !== 'pending' && (
                          <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                            {pendingRefText}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {status === 'scheduled' && onSeDesister && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onSeDesister(); onClose(); }}
                    className="mt-1 w-full text-center text-[11px] font-semibold text-white/40 hover:text-white"
                  >
                    Se désister
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
