'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  Gavel,
  Maximize2,
  MicOff,
  Mic,
  Timer,
  Megaphone,
  Users,
  Music,
  Octagon,
  Play,
  Video,
  VideoOff,
  UserX,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import { MediatorInviteInline } from '@/components/MediatorInviteInline';

export type MediatorRemoteRow = {
  sessionId: string;
  label: string;
  slot: 'A' | 'B';
  debaterId: string | null;
  audioOn: boolean;
};

type MediatorSidebarProps = {
  open: boolean;
  onClose: () => void;
  timerActive: boolean;
  beefTimerPaused: boolean;
  onPauseBeefTimer: () => void;
  onResumeBeefTimer: () => void;
  onResetBeefTimer: () => void;
  startingBeef: boolean;
  onStartBeef: () => void | Promise<void>;
  onVerdict: (kind: 'resolved' | 'closed' | 'rematch') => void;
  remoteRows: MediatorRemoteRow[];
  speakingTurnActive: boolean;
  speakingTurnPaused: boolean;
  hotMicSpeakerSlot: 'A' | 'B' | null;
  onHotMic: (slot: 'A' | 'B', durationSec: number, opts?: { force?: boolean }) => void;
  onStopSpeakingTurn: () => void;
  onPauseSpeakingTurn: () => void;
  onResumeSpeakingTurn: () => void;
  onRestartSpeakingTurn: () => void;
  beefTimeFormatted: string;
  onSetChallengerMuted: (sessionId: string, debaterId: string | null, muted: boolean) => void;
  onEjectParticipant: (sessionId: string) => void | Promise<void>;
  onAdjustTime: (deltaSec: number) => void;
  mediatorMicEnabled?: boolean;
  mediatorCamEnabled?: boolean;
  onMediatorToggleMic?: () => void | Promise<void>;
  onMediatorToggleCam?: () => void | Promise<void>;
  /** null = split 50/50, A ou B = panneau mis en avant 80/20 */
  focusTarget?: null | 'A' | 'B';
  onFocusTargetChange?: (target: null | 'A' | 'B') => void;
  /** Temps restant chrono beef (secondes) — pour la roulette */
  beefRemainingSec: number;
  maxBeefDurationSec: number;
  /** Durée du prochain tour de parole (réglée par roulette) */
  parolePresetSec: number;
  onParolePresetSecChange: (sec: number) => void;
  announcementText: string;
  onPublishAnnouncement: (text: string, durationSec: number) => void;
  onClearAnnouncement: () => void;
  /** Invitations en attente (beef_participants.pending) */
  pendingInvites: Array<{ userId: string; label: string }>;
  onAcceptPendingInvite?: (userId: string) => void;
  onRejectPendingInvite?: (userId: string) => void;
  /** Inviter un co-hôte (recherche inline dans le Command Deck) */
  onInviteParticipant?: (userId: string) => void | Promise<void>;
  /** IDs déjà sur le ring / à exclure de la recherche (dont l’hôte courant) */
  inviteExcludeParticipantIds?: string[];
  inviteCurrentUserId?: string | null;
};

const TILE = 'flex flex-col items-center justify-center gap-1.5 rounded-[2.5rem] border border-white/10 bg-white/5 px-3 py-4 backdrop-blur-3xl transition-all active:scale-[0.97]';
const TILE_WIDE = `${TILE} col-span-2`;
const TILE_ICON = 'h-5 w-5';
const TILE_LABEL = 'font-mono text-[9px] font-bold uppercase tracking-widest';

const SOUNDBOARD_SOUNDS = [
  { emoji: '🔔', label: 'Bell' },
  { emoji: '📢', label: 'Horn' },
  { emoji: '😂', label: 'Laugh' },
  { emoji: '👏', label: 'Clap' },
];

export function MediatorSidebar({
  open,
  onClose,
  timerActive,
  beefTimerPaused,
  onPauseBeefTimer,
  onResumeBeefTimer,
  onResetBeefTimer,
  startingBeef,
  onStartBeef,
  onVerdict,
  remoteRows,
  speakingTurnActive,
  speakingTurnPaused,
  hotMicSpeakerSlot,
  onHotMic,
  onStopSpeakingTurn,
  onPauseSpeakingTurn,
  onResumeSpeakingTurn,
  onRestartSpeakingTurn,
  beefTimeFormatted,
  onSetChallengerMuted,
  onEjectParticipant,
  onAdjustTime,
  mediatorMicEnabled,
  mediatorCamEnabled,
  onMediatorToggleMic,
  onMediatorToggleCam,
  focusTarget = null,
  onFocusTargetChange,
  beefRemainingSec,
  maxBeefDurationSec,
  parolePresetSec,
  onParolePresetSecChange,
  announcementText,
  onPublishAnnouncement,
  onClearAnnouncement,
  pendingInvites,
  onAcceptPendingInvite,
  onRejectPendingInvite,
  onInviteParticipant,
  inviteExcludeParticipantIds = [],
  inviteCurrentUserId = null,
}: MediatorSidebarProps) {
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [announceEditorOpen, setAnnounceEditorOpen] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);
  const [announceDurationSec, setAnnounceDurationSec] = useState(12);
  /** Chrono beef : réglage fin (+15/+30 + roulette) replié par défaut pour libérer le scroll */
  const [beefTimerExpanded, setBeefTimerExpanded] = useState(false);
  const [paroleWheelExpanded, setParoleWheelExpanded] = useState(false);

  const pendingInviteCount = pendingInvites.length;

  const formatParole = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!open) {
      setVerdictOpen(false);
      setSoundboardOpen(false);
      setAnnounceEditorOpen(false);
      setInvitePanelOpen(false);
      setBeefTimerExpanded(false);
      setParoleWheelExpanded(false);
    }
  }, [open]);

  useEffect(() => {
    if (!timerActive) setBeefTimerExpanded(false);
  }, [timerActive]);

  useEffect(() => {
    if (announceEditorOpen) {
      setAnnounceDraft(announcementText);
    }
  }, [announceEditorOpen, announcementText]);

  const deck =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* Backdrop — portail body pour éviter les conflits d’empilement dans l’arène */}
                <motion.button
                  type="button"
                  aria-label="Fermer le command deck"
                  className="fixed inset-0 z-modal-backdrop bg-black/50 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={onClose}
                />

                {/* Bottom Sheet */}
                <motion.aside
                  role="dialog"
                  aria-label="Command Deck"
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 380 }}
                  className="fixed inset-x-0 bottom-0 z-modal mx-auto flex max-h-[min(88dvh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-t-[2.5rem] border-t border-white/10 bg-[#08080A]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_64px_rgba(0,0,0,0.6)] backdrop-blur-3xl"
                >
                  {/* Drag handle */}
                  <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20" />

                  {/* Header */}
                  <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <span className="font-mono text-xs font-bold tracking-tight text-white/90">
                      Command Deck
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="relative z-20 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white shadow-sm backdrop-blur-3xl hover:bg-white/15"
                      aria-label="Fermer"
                    >
                      <X className="h-4 w-4" strokeWidth={1} />
                    </button>
                  </div>

            {/* Launch beef (pre-timer) */}
            {!timerActive && (
              <div className="shrink-0 px-1 pb-3">
                <motion.button
                  type="button"
                  disabled={startingBeef}
                  onClick={() => void onStartBeef()}
                  className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[2.5rem] border border-[#FF4D00]/80 bg-[#FF4D00] py-3.5 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-[0_0_28px_rgba(255,77,0,0.55)] disabled:cursor-wait disabled:opacity-70"
                  animate={
                    startingBeef
                      ? {}
                      : {
                          boxShadow: [
                            '0 0 18px rgba(255,77,0,0.45)',
                            '0 0 32px rgba(255,77,0,0.75)',
                            '0 0 18px rgba(255,77,0,0.45)',
                          ],
                        }
                  }
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <Play className="h-4 w-4 shrink-0 text-black" strokeWidth={1} aria-hidden />
                  {startingBeef ? 'Lancement…' : 'Lancer le beef'}
                </motion.button>
              </div>
            )}

            {/* Scrollable content — chrono beef inclus ici pour permettre le scroll vers Invités / Annonce */}
            <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4 overscroll-contain hide-scrollbar">
              {timerActive && (
                <div className="mb-3 space-y-2 border-b border-white/[0.08] pb-3">
                  <p className="font-mono text-[8px] font-bold uppercase tracking-widest text-white/40">
                    Chrono beef
                  </p>
                  <div className="flex items-stretch gap-2">
                    <button
                      type="button"
                      onClick={beefTimerPaused ? onResumeBeefTimer : onPauseBeefTimer}
                      className={`flex min-h-[4.25rem] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 backdrop-blur-3xl transition-all active:scale-[0.98] ${
                        beefTimerPaused
                          ? 'border-emerald-400/30 bg-emerald-500/10'
                          : 'border-amber-400/30 bg-amber-500/10'
                      }`}
                    >
                      <Timer
                        className={`h-5 w-5 shrink-0 ${beefTimerPaused ? 'text-emerald-400' : 'text-amber-400'}`}
                        strokeWidth={1.2}
                      />
                      <span className="font-mono text-[8px] font-bold uppercase tracking-widest text-white">
                        {beefTimerPaused ? 'Reprendre' : 'Pause'}
                      </span>
                    </button>
                    <div className="flex min-h-[4.25rem] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl border border-white/10 bg-white/[0.05] px-2 py-2 backdrop-blur-3xl">
                      <span className="font-mono text-[7px] font-bold uppercase tracking-widest text-white/45">
                        Restant
                      </span>
                      <span className="font-mono text-base font-black tabular-nums tracking-tight text-white sm:text-lg">
                        {beefTimeFormatted}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBeefTimerExpanded((v) => !v)}
                      aria-expanded={beefTimerExpanded}
                      aria-label={
                        beefTimerExpanded
                          ? 'Replier prolongations et roulette du chrono'
                          : 'Déplier prolongations et roulette du chrono'
                      }
                      className="flex w-11 shrink-0 flex-col items-center justify-center rounded-2xl border border-white/15 bg-white/5 text-white/80 transition-colors hover:bg-white/10"
                    >
                      {beefTimerExpanded ? (
                        <ChevronUp className="h-5 w-5" strokeWidth={2} />
                      ) : (
                        <ChevronDown className="h-5 w-5" strokeWidth={2} />
                      )}
                    </button>
                  </div>
                  <AnimatePresence initial={false}>
                    {beefTimerExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                        className="space-y-2 overflow-hidden"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => onAdjustTime(15 * 60)} className={TILE}>
                            <Timer className={`${TILE_ICON} text-cobalt-400`} strokeWidth={1.2} />
                            <span className={`${TILE_LABEL} text-white/80`}>+15 min</span>
                          </button>
                          <button type="button" onClick={() => onAdjustTime(30 * 60)} className={TILE}>
                            <Timer className={`${TILE_ICON} text-cobalt-400`} strokeWidth={1.2} />
                            <span className={`${TILE_LABEL} text-white/80`}>+30 min</span>
                          </button>
                        </div>
                        <TimeWheelPicker
                          valueSec={beefRemainingSec}
                          minSec={0}
                          maxSec={maxBeefDurationSec}
                          onChange={(sec) => onAdjustTime(sec - beefRemainingSec)}
                          ariaLabel="Temps restant du débat"
                          className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-3"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {/* ═══ TILE GRID ═══ */}
              <div className="grid grid-cols-2 gap-2.5">

                {/* ── VERDICT (col-span-2) ── */}
                <button
                  type="button"
                  onClick={() => setVerdictOpen((v) => !v)}
                  className={`${TILE_WIDE} ${verdictOpen ? 'border-amber-400/40 bg-amber-500/10' : ''}`}
                >
                  <Gavel className={`${TILE_ICON} text-amber-400`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-amber-200`}>Verdict</span>
                </button>

                {/* Verdict options */}
                <AnimatePresence initial={false}>
                  {verdictOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="col-span-2 overflow-hidden"
                    >
                      <div className="grid grid-cols-3 gap-2 pt-1 pb-2">
                        <button
                          type="button"
                          onClick={() => { onVerdict('resolved'); setVerdictOpen(false); onClose(); }}
                          className="rounded-[2.5rem] border border-emerald-400/40 bg-emerald-600/20 py-3 font-mono text-[9px] font-black uppercase tracking-widest text-white hover:bg-emerald-500/35"
                        >
                          Résolu
                        </button>
                        <button
                          type="button"
                          onClick={() => { onVerdict('closed'); setVerdictOpen(false); onClose(); }}
                          className="rounded-[2.5rem] border border-white/15 bg-white/8 py-3 font-mono text-[9px] font-black uppercase tracking-widest text-white hover:bg-white/15"
                        >
                          Clos
                        </button>
                        <button
                          type="button"
                          onClick={() => { onVerdict('rematch'); setVerdictOpen(false); onClose(); }}
                          className="rounded-[2.5rem] border border-ember-500/40 bg-ember-600/20 py-3 font-mono text-[9px] font-black uppercase tracking-widest text-ember-100 hover:bg-ember-500/35"
                        >
                          Rematch
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── INVITÉS ── */}
                <button
                  type="button"
                  onClick={() => setInvitePanelOpen((v) => !v)}
                  className={`${TILE} relative ${invitePanelOpen ? 'border-cobalt-400/35 bg-cobalt-500/10' : ''}`}
                >
                  <Users className={`${TILE_ICON} text-cobalt-300`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-cobalt-100`}>Invités</span>
                  {pendingInviteCount > 0 && (
                    <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-ember-500 px-1 font-mono text-[9px] font-black text-black">
                      {pendingInviteCount > 99 ? '99+' : pendingInviteCount}
                    </span>
                  )}
                </button>

                {/* File invités + recherche : sous la tuile (comme Annonce / Verdict) */}
                <AnimatePresence initial={false}>
                  {invitePanelOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="col-span-2 overflow-hidden"
                    >
                      <div className="flex max-h-[min(52vh,420px)] flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[2rem] border border-white/12 bg-black/50 p-3 backdrop-blur-xl [-webkit-overflow-scrolling:touch] touch-pan-y">
                        <div className="flex shrink-0 items-center justify-between gap-2">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/80">
                            File invités
                          </span>
                          <span className="shrink-0 font-mono text-[9px] text-white/45">Co-hôtes</span>
                        </div>
                        {onInviteParticipant && (
                          <MediatorInviteInline
                            excludeParticipantIds={inviteExcludeParticipantIds}
                            currentUserId={inviteCurrentUserId}
                            onInvite={onInviteParticipant}
                          />
                        )}
                        <ul className="shrink-0 space-y-2 border-t border-white/10 pt-3">
                          {pendingInvites.length === 0 ? (
                            <li className="rounded-2xl border border-dashed border-white/10 px-3 py-4 text-center font-mono text-[10px] text-white/45">
                              Aucune invitation en attente
                            </li>
                          ) : (
                            pendingInvites.map((inv) => (
                              <li
                                key={inv.userId}
                                className="flex items-start justify-between gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                              >
                                <span className="min-w-0 break-words font-mono text-[11px] text-white/85">
                                  {inv.label}
                                </span>
                                <div className="flex shrink-0 items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => onRejectPendingInvite?.(inv.userId)}
                                    className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-red-500/20 hover:text-red-400"
                                    aria-label="Refuser l’invitation"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onAcceptPendingInvite?.(inv.userId)}
                                    className="rounded-full border border-brand-500/30 bg-brand-500/20 px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-brand-400 hover:bg-brand-500/40"
                                  >
                                    Accepter
                                  </button>
                                </div>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── ANNONCE (ticker) ── */}
                <button
                  type="button"
                  onClick={() => setAnnounceEditorOpen((v) => !v)}
                  className={`${TILE} ${announceEditorOpen ? 'border-amber-400/35 bg-amber-500/10' : ''}`}
                >
                  <Megaphone className={`${TILE_ICON} text-amber-300`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-amber-100`}>Annonce</span>
                </button>

                {/* Éditeur d’annonce : juste sous la tuile Annonce */}
                <AnimatePresence initial={false}>
                  {announceEditorOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                      className="col-span-2 overflow-hidden"
                    >
                      <div className="rounded-[2rem] border border-white/12 bg-black/45 p-3 backdrop-blur-xl">
                        <label htmlFor="mediator-announce-input" className="sr-only">
                          Texte de l&apos;annonce
                        </label>
                        <textarea
                          id="mediator-announce-input"
                          value={announceDraft}
                          onChange={(e) => setAnnounceDraft(e.target.value)}
                          rows={2}
                          placeholder="Message du bandeau…"
                          className="mb-2 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-white/35 focus:border-amber-400/40 focus:outline-none"
                        />
                        <p className="mb-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/40">
                          Durée d&apos;affichage
                        </p>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {([5, 10, 15, 30, 60] as const).map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setAnnounceDurationSec(sec)}
                              className={`rounded-full px-2.5 py-1 font-mono text-[8px] font-black uppercase tracking-wide ${
                                announceDurationSec === sec
                                  ? 'bg-amber-500/40 text-amber-50'
                                  : 'border border-white/12 bg-white/5 text-white/65 hover:bg-white/10'
                              }`}
                            >
                              {sec}s
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onPublishAnnouncement(announceDraft.trim(), announceDurationSec);
                              setAnnounceEditorOpen(false);
                            }}
                            className="rounded-[2rem] border border-amber-500/50 bg-amber-500/20 px-4 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-amber-50 hover:bg-amber-500/35"
                          >
                            Publier
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClearAnnouncement();
                              setAnnounceDraft('');
                            }}
                            className="rounded-[2rem] border border-white/15 bg-white/5 px-4 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-white/75 hover:bg-white/10"
                          >
                            Effacer bannière
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ── FOCUS caméra (col-span-2) ── */}
                {onFocusTargetChange && (
                  <div className="col-span-2 rounded-[2.5rem] border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-3xl">
                    <div className="mb-2 flex items-center gap-2 px-1">
                      <Maximize2 className="h-4 w-4 shrink-0 text-blue-400" strokeWidth={1.2} />
                      <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-blue-200/90">
                        Focus vidéo
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      <button
                        type="button"
                        onClick={() => onFocusTargetChange('A')}
                        className={`rounded-[2rem] py-2.5 font-mono text-[8px] font-black uppercase tracking-wide ${
                          focusTarget === 'A'
                            ? 'bg-blue-500/35 text-white'
                            : 'bg-white/5 text-white/65 hover:bg-white/10'
                        }`}
                      >
                        Focus A
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusTargetChange(null)}
                        className={`rounded-[2rem] py-2.5 font-mono text-[8px] font-black uppercase tracking-wide ${
                          focusTarget === null
                            ? 'bg-blue-500/35 text-white'
                            : 'bg-white/5 text-white/65 hover:bg-white/10'
                        }`}
                      >
                        50/50
                      </button>
                      <button
                        type="button"
                        onClick={() => onFocusTargetChange('B')}
                        className={`rounded-[2rem] py-2.5 font-mono text-[8px] font-black uppercase tracking-wide ${
                          focusTarget === 'B'
                            ? 'bg-blue-500/35 text-white'
                            : 'bg-white/5 text-white/65 hover:bg-white/10'
                        }`}
                      >
                        Focus B
                      </button>
                    </div>
                  </div>
                )}

                {/* ── MUTE A/B ── */}
                <button
                  type="button"
                  onClick={() => void onMediatorToggleMic?.()}
                  className={`${TILE} ${mediatorMicEnabled ? '' : 'border-red-500/30 bg-red-500/10'}`}
                >
                  {mediatorMicEnabled ? (
                    <Mic className={`${TILE_ICON} text-white`} strokeWidth={1.2} />
                  ) : (
                    <MicOff className={`${TILE_ICON} text-red-400`} strokeWidth={1.2} />
                  )}
                  <span className={`${TILE_LABEL} text-white/80`}>Mon micro</span>
                </button>

                {/* ── CAM ── */}
                <button
                  type="button"
                  onClick={() => void onMediatorToggleCam?.()}
                  className={`${TILE} ${mediatorCamEnabled ? '' : 'border-red-500/30 bg-red-500/10'}`}
                >
                  {mediatorCamEnabled ? (
                    <Video className={`${TILE_ICON} text-white`} strokeWidth={1.2} />
                  ) : (
                    <VideoOff className={`${TILE_ICON} text-red-400`} strokeWidth={1.2} />
                  )}
                  <span className={`${TILE_LABEL} text-white/80`}>Ma cam</span>
                </button>

                {/* ── SOUNDBOARD ── */}
                <button
                  type="button"
                  onClick={() => setSoundboardOpen((v) => !v)}
                  className={`${TILE} ${soundboardOpen ? 'border-purple-400/30 bg-purple-500/10' : ''}`}
                >
                  <Music className={`${TILE_ICON} text-purple-400`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-white/80`}>Sons</span>
                </button>

                {/* ── FIN DU BEEF ── */}
                <button
                  type="button"
                  onClick={() => setVerdictOpen((v) => !v)}
                  className={`${TILE} border-red-500/20 bg-red-500/5`}
                >
                  <Octagon className={`${TILE_ICON} text-red-500`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-red-300`}>Fin</span>
                </button>
              </div>

              {/* Soundboard expanded */}
              <AnimatePresence initial={false}>
                {soundboardOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="grid grid-cols-4 gap-2 pt-3">
                      {SOUNDBOARD_SOUNDS.map((s) => (
                        <button
                          key={s.label}
                          type="button"
                          className="flex flex-col items-center gap-1 rounded-[2.5rem] border border-white/10 bg-white/5 py-3 backdrop-blur-3xl transition-transform active:scale-90"
                        >
                          <span className="text-xl">{s.emoji}</span>
                          <span className="font-mono text-[7px] font-bold uppercase tracking-wider text-white/60">{s.label}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ═══ ROULETTES TEMPS ═══ */}
              <section className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
                <button
                  type="button"
                  onClick={() => setParoleWheelExpanded((v) => !v)}
                  aria-expanded={paroleWheelExpanded}
                  className="flex w-full items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <div className="min-w-0">
                    <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/80">
                      Tour de parole
                    </h3>
                    <p className="font-mono text-[9px] text-white/45">
                      Durée : {formatParole(parolePresetSec)}
                    </p>
                  </div>
                  {paroleWheelExpanded ? (
                    <ChevronUp className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
                  ) : (
                    <ChevronDown className="h-4 w-4 shrink-0 text-white/50" strokeWidth={2} />
                  )}
                </button>
                <AnimatePresence initial={false}>
                  {paroleWheelExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                      className="overflow-hidden"
                    >
                      <TimeWheelPicker
                        valueSec={parolePresetSec}
                        minSec={15}
                        maxSec={600}
                        onChange={onParolePresetSecChange}
                        ariaLabel="Durée du prochain tour de parole"
                        className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-3"
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </section>

              {/* ═══ CHALLENGERS ═══ */}
              {remoteRows.length > 0 && (
                <section className="mt-5 space-y-3 border-t border-white/[0.06] pt-4">
                  <div className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-white/60" strokeWidth={1.2} />
                    <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75">Challengers</h3>
                  </div>
                  <ul className="space-y-2.5">
                    {remoteRows.map((row) => {
                      const muted = !row.audioOn;
                      const lockedOut =
                        speakingTurnActive &&
                        !!hotMicSpeakerSlot &&
                        hotMicSpeakerSlot !== row.slot;
                      return (
                        <li
                          key={row.sessionId}
                          className="space-y-2 rounded-[2.5rem] border border-white/10 bg-white/5 p-3.5 backdrop-blur-3xl"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 font-mono text-[11px] font-bold text-white">
                              <span className="text-ember-400">{row.slot}</span>
                              <span className="text-white/40"> · </span>
                              <span className="truncate">{row.label}</span>
                            </span>
                          </div>

                          {speakingTurnActive && hotMicSpeakerSlot === row.slot ? (
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={onStopSpeakingTurn}
                                  className="rounded-[2.5rem] border border-white/15 bg-white/8 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white hover:bg-white/15"
                                >
                                  Arrêter
                                </button>
                                <button
                                  type="button"
                                  onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                  className="rounded-[2.5rem] border border-amber-500/40 bg-amber-500/12 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
                                >
                                  {speakingTurnPaused ? 'Reprendre' : 'Pause'}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="w-full rounded-[2.5rem] border border-cobalt-500/40 bg-cobalt-600/15 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white hover:bg-cobalt-500/30"
                              >
                                Relancer le tour
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={speakingTurnActive}
                              onClick={() => onHotMic(row.slot, parolePresetSec)}
                              className="flex w-full items-center justify-center rounded-[2.5rem] border border-ember-500/40 bg-ember-500/12 py-2 font-mono text-[10px] font-black uppercase tracking-wide text-ember-50 hover:bg-ember-500/25 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Lancer parole · {formatParole(parolePresetSec)}
                            </button>
                          )}

                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={lockedOut}
                              onClick={() =>
                                lockedOut ? undefined : onSetChallengerMuted(row.sessionId, row.debaterId, !muted)
                              }
                              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[2.5rem] border px-2 py-2 font-mono text-[10px] font-bold ${
                                lockedOut
                                  ? 'cursor-not-allowed border-white/10 bg-black/50 text-white/45'
                                  : muted
                                    ? 'border-cobalt-500/40 bg-cobalt-600/15 text-white'
                                    : 'border-white/15 bg-white/8 text-white'
                              }`}
                            >
                              {lockedOut ? (
                                <>
                                  <MicOff className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1} />
                                  Attendez
                                </>
                              ) : muted ? (
                                <>
                                  <Mic className="h-3.5 w-3.5 shrink-0" strokeWidth={1} />
                                  Réactiver
                                </>
                              ) : (
                                <>
                                  <MicOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1} />
                                  Couper
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              title="Expulser"
                              onClick={() => void onEjectParticipant(row.sessionId)}
                              className="flex shrink-0 items-center gap-1 rounded-[2.5rem] border border-ember-500/40 bg-ember-500/15 px-3 py-2 font-mono text-[10px] font-bold text-white hover:bg-ember-500/30"
                            >
                              <UserX className="h-3.5 w-3.5" strokeWidth={1} />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>
          </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return <>{deck}</>;
}
