'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelRightClose, UserX, Mic, MicOff, Play, Video, VideoOff } from 'lucide-react';
import { TimeJogDial } from '@/components/TimeJogDial';

export type MediatorRemoteRow = {
  sessionId: string;
  label: string;
  slot: 'A' | 'B';
  /** UUID arène — sync broadcast + état signal */
  debaterId: string | null;
  audioOn: boolean;
};

type MediatorSidebarProps = {
  open: boolean;
  onClose: () => void;
  timerActive: boolean;
  /** Chrono global du beef (pas le tour de parole). */
  beefTimerPaused: boolean;
  onPauseBeefTimer: () => void;
  onResumeBeefTimer: () => void;
  /** Remet le compte à rebours au plafond (ex. 4 h). */
  onResetBeefTimer: () => void;
  onEndBeefByMediator: () => void | Promise<void>;
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
  /** Temps restant du chrono global (affichage molette) */
  beefTimeFormatted: string;
  /** muted = micro coupé (Daily + signal si debaterId) */
  onSetChallengerMuted: (sessionId: string, debaterId: string | null, muted: boolean) => void;
  onEjectParticipant: (sessionId: string) => void | Promise<void>;
  onAdjustTime: (deltaSec: number) => void;
  /** Contrôles perso médiateur (récupération cam/micro) */
  mediatorMicEnabled?: boolean;
  mediatorCamEnabled?: boolean;
  onMediatorToggleMic?: () => void | Promise<void>;
  onMediatorToggleCam?: () => void | Promise<void>;
};

/**
 * Régie médiateur — Obsidian / Ember, JetBrains Mono.
 */
export function MediatorSidebar({
  open,
  onClose,
  timerActive,
  beefTimerPaused,
  onPauseBeefTimer,
  onResumeBeefTimer,
  onResetBeefTimer,
  onEndBeefByMediator,
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
}: MediatorSidebarProps) {
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [jogStepSec, setJogStepSec] = useState<5 | 10>(5);
  const [paroleDurationSec, setParoleDurationSec] = useState(60);

  const clampParole = (n: number) => Math.max(15, Math.min(600, n));
  const formatParole = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    if (!open) setVerdictOpen(false);
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            type="button"
            aria-label="Fermer la barre de commande"
            className="fixed inset-0 z-[57] bg-black/45 backdrop-blur-[1px] md:bg-black/25"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-label="Commande médiateur"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 340 }}
            className="fixed right-0 top-0 z-[58] flex h-[100dvh] w-[min(100vw,17.5rem)] flex-col border-l border-white/[0.09] frosted-titanium sm:w-72"
          >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.07] px-3 py-2.5">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ember-400">
                Régie
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-white/10 bg-black/40 text-white hover:bg-white/10"
                aria-label="Fermer"
              >
                <PanelRightClose className="h-4 w-4" strokeWidth={1} />
              </button>
            </div>

            <div className="shrink-0 border-b border-white/[0.06] px-3 py-3">
              {!timerActive ? (
                <motion.button
                  type="button"
                  disabled={startingBeef}
                  onClick={() => void onStartBeef()}
                  className="relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-[2px] border border-[#FF4D00]/80 bg-[#FF4D00] py-3 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-black shadow-[0_0_28px_rgba(255,77,0,0.55)] disabled:cursor-wait disabled:opacity-70"
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
              ) : (
                <div className="space-y-2">
                  <div className="rounded-[2px] border border-white/10 bg-black/35 py-2 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-white/90">
                    Chrono actif
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={beefTimerPaused ? onResumeBeefTimer : onPauseBeefTimer}
                      className={`rounded-[2px] border py-2 font-mono text-[9px] font-black uppercase tracking-wide ${
                        beefTimerPaused
                          ? 'border-emerald-500/45 bg-emerald-600/20 text-emerald-100 hover:bg-emerald-500/30'
                          : 'border-amber-500/45 bg-amber-500/15 text-amber-100 hover:bg-amber-500/28'
                      }`}
                    >
                      {beefTimerPaused ? 'Reprendre' : 'Pause'}
                    </button>
                    <button
                      type="button"
                      onClick={onResetBeefTimer}
                      className="rounded-[2px] border border-white/18 bg-white/10 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white hover:bg-white/16"
                    >
                      Reset chrono
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onAdjustTime(15 * 60)}
                      className="rounded-[2px] border border-cobalt-500/40 bg-cobalt-600/20 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white hover:bg-cobalt-500/35"
                    >
                      +15 min
                    </button>
                    <button
                      type="button"
                      onClick={() => onAdjustTime(30 * 60)}
                      className="rounded-[2px] border border-cobalt-500/40 bg-cobalt-600/20 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white hover:bg-cobalt-500/35"
                    >
                      +30 min
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void onEndBeefByMediator()}
                    className="w-full rounded-[2px] border border-red-500/45 bg-red-600/25 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-red-100 hover:bg-red-500/40"
                  >
                    Terminer le direct
                  </button>
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4 hide-scrollbar">
              {onMediatorToggleMic && onMediatorToggleCam && (
                <section className="space-y-2 border-b border-white/[0.07] pb-4">
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white">
                    Ta régie (cam / micro)
                  </h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={onMediatorToggleMic}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-[2px] border py-2.5 font-mono text-[10px] font-bold ${
                        mediatorMicEnabled
                          ? 'border-white/20 bg-white/12 text-white'
                          : 'border-red-500/45 bg-red-500/20 text-red-100'
                      }`}
                    >
                      {mediatorMicEnabled ? (
                        <Mic className="h-3.5 w-3.5" strokeWidth={1} />
                      ) : (
                        <MicOff className="h-3.5 w-3.5" strokeWidth={1} />
                      )}
                      Micro
                    </button>
                    <button
                      type="button"
                      onClick={onMediatorToggleCam}
                      className={`flex flex-1 items-center justify-center gap-1.5 rounded-[2px] border py-2.5 font-mono text-[10px] font-bold ${
                        mediatorCamEnabled
                          ? 'border-white/20 bg-white/12 text-white'
                          : 'border-red-500/45 bg-red-500/20 text-red-100'
                      }`}
                    >
                      {mediatorCamEnabled ? (
                        <Video className="h-3.5 w-3.5" strokeWidth={1} />
                      ) : (
                        <VideoOff className="h-3.5 w-3.5" strokeWidth={1} />
                      )}
                      Cam
                    </button>
                  </div>
                </section>
              )}
              <section className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white">
                    Chrono global
                  </h3>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setJogStepSec(5)}
                      className={`rounded-[2px] px-1.5 py-0.5 font-mono text-[8px] font-black uppercase ${
                        jogStepSec === 5 ? 'bg-ember-500/35 text-ember-100' : 'bg-white/10 text-white/55'
                      }`}
                    >
                      5s
                    </button>
                    <button
                      type="button"
                      onClick={() => setJogStepSec(10)}
                      className={`rounded-[2px] px-1.5 py-0.5 font-mono text-[8px] font-black uppercase ${
                        jogStepSec === 10 ? 'bg-ember-500/35 text-ember-100' : 'bg-white/10 text-white/55'
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
              </section>

              <section className="space-y-2 border-t border-white/[0.06] pt-4">
                <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white">
                  Durée parole (tour suivant)
                </h3>
                <TimeJogDial
                  display={formatParole(paroleDurationSec)}
                  subtitle="Durée parole (molette · pas libre)"
                  stepSec={jogStepSec}
                  onDelta={(d) => setParoleDurationSec((p) => clampParole(p + d))}
                  ariaLabel="Durée du prochain tour de parole"
                />
              </section>

              {remoteRows.length > 0 && (
                <section className="space-y-2">
                  <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/80">
                    Challengers
                  </h3>
                  <ul className="space-y-3">
                    {remoteRows.map((row) => {
                      const muted = !row.audioOn;
                      const lockedOut =
                        speakingTurnActive &&
                        !!hotMicSpeakerSlot &&
                        hotMicSpeakerSlot !== row.slot;
                      return (
                        <li
                          key={row.sessionId}
                          className="space-y-2 rounded-[2px] border border-white/[0.12] bg-black/40 p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 font-mono text-[11px] font-bold text-white">
                              <span className="text-ember-400">{row.slot}</span>
                              <span className="text-white/40"> · </span>
                              <span className="truncate">{row.label}</span>
                            </span>
                          </div>

                          <div className="flex gap-1.5 pt-0.5">
                            <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-white/55">
                              Parole
                            </span>
                          </div>
                          {speakingTurnActive && hotMicSpeakerSlot === row.slot ? (
                            <div className="space-y-1.5">
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={onStopSpeakingTurn}
                                  className="rounded-[2px] border border-white/20 bg-white/10 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white transition-colors hover:bg-white/18"
                                >
                                  Arrêter
                                </button>
                                <button
                                  type="button"
                                  onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                  className="rounded-[2px] border border-amber-500/45 bg-amber-500/15 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-amber-100 transition-colors hover:bg-amber-500/28"
                                >
                                  {speakingTurnPaused ? 'Reprendre' : 'Pause'}
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="w-full rounded-[2px] border border-cobalt-500/45 bg-cobalt-600/20 py-2 font-mono text-[9px] font-black uppercase tracking-wide text-white transition-colors hover:bg-cobalt-500/35"
                              >
                                Relancer le tour
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              disabled={speakingTurnActive}
                              onClick={() => onHotMic(row.slot, paroleDurationSec)}
                              className="flex w-full items-center justify-center rounded-[2px] border border-ember-500/40 bg-ember-500/15 py-2 font-mono text-[10px] font-black uppercase tracking-wide text-ember-50 transition-colors hover:bg-ember-500/28 disabled:cursor-not-allowed disabled:opacity-35"
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
                              className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[2px] border px-2 py-2 font-mono text-[10px] font-bold ${
                                lockedOut
                                  ? 'cursor-not-allowed border-white/10 bg-black/50 text-white/45'
                                  : muted
                                    ? 'border-cobalt-500/50 bg-cobalt-600/25 text-white'
                                    : 'border-white/18 bg-white/12 text-white'
                              }`}
                            >
                              {lockedOut ? (
                                <>
                                  <MicOff className="h-3.5 w-3.5 shrink-0 opacity-60" strokeWidth={1} />
                                  Attendez votre tour
                                </>
                              ) : muted ? (
                                <>
                                  <Mic className="h-3.5 w-3.5 shrink-0" strokeWidth={1} />
                                  Réactiver micro
                                </>
                              ) : (
                                <>
                                  <MicOff className="h-3.5 w-3.5 shrink-0" strokeWidth={1} />
                                  Couper micro
                                </>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onEjectParticipant(row.sessionId)}
                              className="flex shrink-0 items-center gap-1 rounded-[2px] border border-ember-500/50 bg-ember-500/25 px-2.5 py-2 font-mono text-[10px] font-bold text-white hover:bg-ember-500/40"
                            >
                              <UserX className="h-3.5 w-3.5" strokeWidth={1} />
                              Kick
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              )}
            </div>

            <div className="shrink-0 space-y-2 border-t border-white/[0.12] bg-black/35 px-3 py-3">
              <button
                type="button"
                onClick={() => setVerdictOpen((v) => !v)}
                className="w-full rounded-[2px] border border-white/22 bg-white/12 py-2.5 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-white transition-colors hover:bg-white/18"
              >
                Clore le débat
              </button>
              <AnimatePresence initial={false}>
                {verdictOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
                    className="overflow-hidden"
                  >
                    <div className="flex flex-col gap-1.5 pt-1 font-mono">
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('resolved');
                          setVerdictOpen(false);
                          onClose();
                        }}
                        className="rounded-[2px] border border-emerald-400/55 bg-emerald-600/35 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-emerald-500/50"
                      >
                        Résolu
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('closed');
                          setVerdictOpen(false);
                          onClose();
                        }}
                        className="rounded-[2px] border border-white/25 bg-white/14 py-2.5 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/22"
                      >
                        Clos
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('rematch');
                          setVerdictOpen(false);
                          onClose();
                        }}
                        className="rounded-[2px] border border-ember-500/60 bg-ember-600/30 py-2.5 text-[10px] font-black uppercase tracking-widest text-ember-100 hover:bg-ember-500/45"
                      >
                        Rematch
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
