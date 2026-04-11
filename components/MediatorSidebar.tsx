'use client';

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';

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
  onSetAnnouncement: (text: string) => void;
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
  onSetAnnouncement,
}: MediatorSidebarProps) {
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [announceEditorOpen, setAnnounceEditorOpen] = useState(false);
  const [announceDraft, setAnnounceDraft] = useState('');
  const [invitePanelOpen, setInvitePanelOpen] = useState(false);

  const INVITE_QUEUE_STUB_COUNT = 3;

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
    }
  }, [open]);

  useEffect(() => {
    if (announceEditorOpen) {
      setAnnounceDraft(announcementText);
    }
  }, [announceEditorOpen, announcementText]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.button
            type="button"
            aria-label="Fermer le command deck"
            className="fixed inset-0 z-[130] bg-black/50 backdrop-blur-[2px]"
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
            className="fixed inset-x-0 bottom-0 z-[131] mx-auto flex max-h-[70vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2.5rem] border-t border-white/10 bg-[#08080A]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_64px_rgba(0,0,0,0.6)] backdrop-blur-3xl"
          >
            {/* Drag handle */}
            <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20" />

            <AnimatePresence initial={false}>
              {invitePanelOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                  className="mb-3 overflow-hidden rounded-[1.75rem] border border-white/12 bg-black/50 px-3 py-2 backdrop-blur-xl"
                >
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/80">
                      File invités
                    </span>
                    <span className="font-mono text-[9px] text-white/45">Bientôt · co-hôtes</span>
                  </div>
                  <ul className="max-h-40 space-y-2 overflow-y-auto">
                    {Array.from({ length: INVITE_QUEUE_STUB_COUNT }, (_, i) => (
                      <li
                        key={i}
                        className="flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                      >
                        <span className="font-mono text-[11px] text-white/70">Invité {i + 1}</span>
                        <span className="rounded-full bg-white/10 px-2 py-0.5 font-mono text-[8px] uppercase tracking-wider text-white/50">
                          En attente
                        </span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Header */}
            <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
              <span className="font-mono text-xs font-bold tracking-tight text-white/90">
                Command Deck
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2.5rem] border border-white/10 bg-white/5 text-white backdrop-blur-3xl hover:bg-white/10"
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

            {/* Scrollable content */}
            <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-4 hide-scrollbar">
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
                  <span className="absolute right-2 top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-ember-500 px-1 font-mono text-[9px] font-black text-black">
                    {INVITE_QUEUE_STUB_COUNT}
                  </span>
                </button>

                {/* ── ANNONCE (ticker) ── */}
                <button
                  type="button"
                  onClick={() => setAnnounceEditorOpen((v) => !v)}
                  className={`${TILE} ${announceEditorOpen ? 'border-amber-400/35 bg-amber-500/10' : ''}`}
                >
                  <Megaphone className={`${TILE_ICON} text-amber-300`} strokeWidth={1.2} />
                  <span className={`${TILE_LABEL} text-amber-100`}>Annonce</span>
                </button>

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

                {/* ── CHRONO (Timer) ── */}
                {timerActive && (
                  <button
                    type="button"
                    onClick={beefTimerPaused ? onResumeBeefTimer : onPauseBeefTimer}
                    className={`${TILE} ${beefTimerPaused ? 'border-emerald-400/30 bg-emerald-500/10' : 'border-amber-400/30 bg-amber-500/10'}`}
                  >
                    <Timer className={`${TILE_ICON} ${beefTimerPaused ? 'text-emerald-400' : 'text-amber-400'}`} strokeWidth={1.2} />
                    <span className={`${TILE_LABEL} text-white`}>{beefTimerPaused ? 'Reprendre' : 'Pause'}</span>
                    <span className="font-mono text-[11px] font-bold tabular-nums text-white/70">{beefTimeFormatted}</span>
                  </button>
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

                {/* ── TIME ADJUST ── */}
                {timerActive && (
                  <>
                    <button
                      type="button"
                      onClick={() => onAdjustTime(15 * 60)}
                      className={TILE}
                    >
                      <Timer className={`${TILE_ICON} text-cobalt-400`} strokeWidth={1.2} />
                      <span className={`${TILE_LABEL} text-white/80`}>+15 min</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdjustTime(30 * 60)}
                      className={TILE}
                    >
                      <Timer className={`${TILE_ICON} text-cobalt-400`} strokeWidth={1.2} />
                      <span className={`${TILE_LABEL} text-white/80`}>+30 min</span>
                    </button>
                  </>
                )}

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

              <AnimatePresence initial={false}>
                {announceEditorOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
                    className="mb-3 overflow-hidden"
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
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onSetAnnouncement(announceDraft.trim());
                            setAnnounceEditorOpen(false);
                          }}
                          className="rounded-[2rem] border border-amber-500/50 bg-amber-500/20 px-4 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-amber-50 hover:bg-amber-500/35"
                        >
                          Publier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onSetAnnouncement('');
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
              <section className="mt-5 space-y-4 border-t border-white/[0.06] pt-4">
                {timerActive && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75">
                        Temps débat
                      </h3>
                      <span className="font-mono text-[10px] font-bold tabular-nums text-white/50">
                        {beefTimeFormatted}
                      </span>
                    </div>
                    <TimeWheelPicker
                      valueSec={beefRemainingSec}
                      minSec={0}
                      maxSec={maxBeefDurationSec}
                      onChange={(sec) => onAdjustTime(sec - beefRemainingSec)}
                      ariaLabel="Temps restant du débat"
                      className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-3"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75">
                    Tour de parole
                  </h3>
                  <p className="font-mono text-[9px] text-white/45">Réglage : {formatParole(parolePresetSec)}</p>
                  <TimeWheelPicker
                    valueSec={parolePresetSec}
                    minSec={15}
                    maxSec={600}
                    onChange={onParolePresetSecChange}
                    ariaLabel="Durée du prochain tour de parole"
                    className="rounded-2xl border border-white/[0.06] bg-white/[0.02] py-3"
                  />
                </div>
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
    </AnimatePresence>
  );
}
