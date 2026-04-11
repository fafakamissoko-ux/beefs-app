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
import { TimeJogDial } from '@/components/TimeJogDial';

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
  isFocusMode?: boolean;
  onToggleFocus?: () => void;
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
  isFocusMode,
  onToggleFocus,
}: MediatorSidebarProps) {
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [soundboardOpen, setSoundboardOpen] = useState(false);
  const [jogStepSec, setJogStepSec] = useState<5 | 10>(5);
  const [paroleDurationSec, setParoleDurationSec] = useState(60);

  const clampParole = (n: number) => Math.max(15, Math.min(600, n));
  const formatParole = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!open) {
      setVerdictOpen(false);
      setSoundboardOpen(false);
    }
  }, [open]);

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

                {/* ── FOCUS (col-span-2) ── */}
                {onToggleFocus && (
                  <button
                    type="button"
                    onClick={onToggleFocus}
                    className={`${TILE_WIDE} ${isFocusMode ? 'border-blue-400/40 bg-blue-500/10' : ''}`}
                  >
                    <Maximize2 className={`${TILE_ICON} text-blue-400`} strokeWidth={1.2} />
                    <span className={`${TILE_LABEL} text-blue-200`}>{isFocusMode ? 'Split 50/50' : 'Focus 80/20'}</span>
                  </button>
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

              {/* ═══ TIME DIALS ═══ */}
              <section className="mt-5 space-y-4 border-t border-white/[0.06] pt-4">
                {timerActive && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75">Temps débat</h3>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => setJogStepSec(5)}
                        className={`rounded-[2.5rem] px-2 py-0.5 font-mono text-[8px] font-black uppercase ${
                          jogStepSec === 5 ? 'bg-ember-500/35 text-ember-100' : 'border border-white/12 bg-white/5 text-white/85'
                        }`}
                      >
                        5s
                      </button>
                      <button
                        type="button"
                        onClick={() => setJogStepSec(10)}
                        className={`rounded-[2.5rem] px-2 py-0.5 font-mono text-[8px] font-black uppercase ${
                          jogStepSec === 10 ? 'bg-ember-500/35 text-ember-100' : 'border border-white/12 bg-white/5 text-white/85'
                        }`}
                      >
                        10s
                      </button>
                    </div>
                  </div>
                  <TimeJogDial
                    display={beefTimeFormatted}
                    stepSec={jogStepSec}
                    onDelta={onAdjustTime}
                    quickJumps={[
                      { label: '−30s', delta: -30 },
                      { label: '+30s', delta: 30 },
                      { label: '+60s', delta: 60 },
                    ]}
                    ariaLabel="Ajuster le temps restant du débat"
                  />

                  <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75 pt-2">Tour de parole</h3>
                  <TimeJogDial
                    display={formatParole(paroleDurationSec)}
                    subtitle="Durée parole (molette)"
                    stepSec={jogStepSec}
                    onDelta={(d) => setParoleDurationSec((p) => clampParole(p + d))}
                    ariaLabel="Durée du prochain tour de parole"
                  />
                </div>
                )}

                {/* Tour de parole — toujours visible même avant le lancement */}
                {!timerActive && (
                  <div className="space-y-3">
                    <h3 className="font-mono text-[10px] font-semibold tracking-tight text-white/75">Tour de parole</h3>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] text-white/60">Pas molette</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setJogStepSec(5)}
                          className={`rounded-[2.5rem] px-2 py-0.5 font-mono text-[8px] font-black uppercase ${
                            jogStepSec === 5 ? 'bg-ember-500/35 text-ember-100' : 'border border-white/12 bg-white/5 text-white/85'
                          }`}
                        >
                          5s
                        </button>
                        <button
                          type="button"
                          onClick={() => setJogStepSec(10)}
                          className={`rounded-[2.5rem] px-2 py-0.5 font-mono text-[8px] font-black uppercase ${
                            jogStepSec === 10 ? 'bg-ember-500/35 text-ember-100' : 'border border-white/12 bg-white/5 text-white/85'
                          }`}
                        >
                          10s
                        </button>
                      </div>
                    </div>
                    <TimeJogDial
                      display={formatParole(paroleDurationSec)}
                      subtitle="Durée parole (molette)"
                      stepSec={jogStepSec}
                      onDelta={(d) => setParoleDurationSec((p) => clampParole(p + d))}
                      ariaLabel="Durée du prochain tour de parole"
                    />
                  </div>
                )}
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
                              onClick={() => onHotMic(row.slot, paroleDurationSec)}
                              className="flex w-full items-center justify-center rounded-[2.5rem] border border-ember-500/40 bg-ember-500/12 py-2 font-mono text-[10px] font-black uppercase tracking-wide text-ember-50 hover:bg-ember-500/25 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                              Lancer parole · {formatParole(paroleDurationSec)}
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
