'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  MicOff,
  Mic,
  Timer,
  Play,
  Video,
  VideoOff,
  UserX,
  Pause,
  RotateCcw,
  Radio,
} from 'lucide-react';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import { MediatorInviteInline } from '@/components/MediatorInviteInline';

export type MediatorRemoteRow = {
  sessionId: string;
  label: string;
  slot: 'A' | 'B' | 'C' | 'D';
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
  onStartBeef: (durationSec: number) => void | Promise<void>;
  onMuteAll: () => void;
  onVerdict: (kind: 'resolved' | 'closed' | 'rematch') => void;
  remoteRows: MediatorRemoteRow[];
  speakingTurnActive: boolean;
  speakingTurnPaused: boolean;
  hotMicSpeakerSlot: 'A' | 'B' | 'C' | 'D' | null;
  onHotMic: (slot: 'A' | 'B' | 'C' | 'D', durationSec: number, opts?: { force?: boolean }) => void;
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
  beefRemainingSec: number;
  maxBeefDurationSec: number;
  parolePresetSec: number;
  onParolePresetSecChange: (sec: number) => void;
  announcementText: string;
  onPublishAnnouncement: (text: string, durationSec: number) => void;
  onClearAnnouncement: () => void;
  pendingInvites: Array<{ userId: string; label: string }>;
  onAcceptPendingInvite?: (userId: string) => void;
  onRejectPendingInvite?: (userId: string) => void;
  onInviteParticipant?: (userId: string) => void | Promise<void>;
  inviteExcludeParticipantIds?: string[];
  inviteCurrentUserId?: string | null;
  networkHealthy?: boolean;
};

const SECTION_SHELL =
  'rounded-2xl border border-white/10 bg-slate-900/60 p-4 shadow-[0_8px_40px_rgba(0,0,0,0.45)] backdrop-blur-xl';

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
  onMuteAll,
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
  onAdjustTime: _onAdjustTime,
  mediatorMicEnabled,
  mediatorCamEnabled,
  onMediatorToggleMic,
  onMediatorToggleCam,
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
  networkHealthy,
}: MediatorSidebarProps) {
  void _onAdjustTime;
  const [confirmVerdict, setConfirmVerdict] = useState<'resolved' | 'closed' | 'rematch' | null>(
    null,
  );
  useEffect(() => {
    if (!open) setConfirmVerdict(null);
  }, [open]);

  const [announceDraft, setAnnounceDraft] = useState('');
  const [announceDurationSec, setAnnounceDurationSec] = useState(120);
  const [speakingTurnSec, setSpeakingTurnSec] = useState(60);
  const [matchDurationMin, setMatchDurationMin] = useState(30);
  const [isSmPanel, setIsSmPanel] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(min-width: 640px)');
    const apply = () => setIsSmPanel(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    setAnnounceDraft(announcementText);
    setSpeakingTurnSec(parolePresetSec);
  }, [open, announcementText, parolePresetSec]);

  const globalChronoDisplay =
    beefTimeFormatted ||
    `${Math.floor(beefRemainingSec / 60)}:${(beefRemainingSec % 60).toString().padStart(2, '0')}`;

  const deck =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <>
                <motion.button
                  type="button"
                  aria-label="Fermer le tableau de bord"
                  className="fixed inset-0 z-[9998] cursor-default bg-black/55 backdrop-blur-[3px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onClose()}
                />

                <motion.aside
                  data-mediator-regie-sheet
                  role="dialog"
                  aria-label="Command Deck"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  initial={isSmPanel ? { x: '100%', y: 0 } : { y: '100%', x: 0 }}
                  animate={{ x: 0, y: 0 }}
                  exit={isSmPanel ? { x: '100%', y: 0 } : { y: '100%', x: 0 }}
                  transition={{ type: 'spring', damping: 34, stiffness: 400 }}
                  className="fixed inset-x-0 bottom-0 z-[9999] flex h-[85dvh] flex-col overflow-hidden rounded-t-[2rem] border-t border-white/10 bg-[#0A0E17]/90 shadow-2xl backdrop-blur-3xl sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:left-auto sm:ml-0 sm:h-dvh sm:w-[400px] sm:rounded-none sm:border-l sm:border-t-0"
                >
                  <div className="mx-auto mt-3 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" />

                  <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <h2 className="truncate font-mono text-sm font-black uppercase tracking-[0.2em] text-white">
                        Command Deck
                      </h2>
                      {networkHealthy !== undefined && (
                        <div
                          className="flex w-fit shrink-0 items-center gap-2 rounded-full border border-white/10 bg-slate-950/50 px-2.5 py-1"
                          title={networkHealthy ? 'Signal realtime OK' : 'Signal faible ou perdu'}
                        >
                          <div
                            className={`h-2 w-2 rounded-full ${networkHealthy ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.85)]' : 'animate-pulse bg-rose-500 shadow-[0_0_10px_rgba(225,29,72,0.85)]'}`}
                          />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-blue-200/70">
                            {networkHealthy ? 'Live sync' : 'Hors ligne'}
                          </span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
                      aria-label="Fermer"
                    >
                      <X className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  </header>

                  <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4">
                    {/* Bloc 1 — Urgence */}
                    <section className={`${SECTION_SHELL} border-rose-500/25 bg-gradient-to-b from-rose-950/40 to-transparent`}>
                      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400/90">
                        Contrôle urgence
                      </p>
                      <button
                        type="button"
                        onClick={onMuteAll}
                        className="flex min-h-[3.5rem] w-full items-center justify-center gap-3 rounded-2xl border-2 border-rose-500/60 bg-rose-600/90 px-4 py-4 text-sm font-black uppercase tracking-widest text-white shadow-[0_0_32px_rgba(225,29,72,0.45)] transition hover:bg-rose-500 active:scale-[0.98]"
                      >
                        <MicOff className="h-6 w-6 shrink-0" strokeWidth={2} />
                        Silence total — couper tous les micros
                      </button>
                    </section>

                    {/* Bloc 2 — Participants */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                          Ring — participants
                        </h3>
                        <span className="rounded-full border border-white/10 bg-slate-950/40 px-2 py-0.5 font-mono text-[9px] text-blue-200/50">
                          {remoteRows.length} lien(s)
                        </span>
                      </div>
                      {remoteRows.length > 0 ? (
                        <ul className="flex flex-col gap-3">
                          {remoteRows.map((row) => {
                            const muted = !row.audioOn;
                            const hotThis = speakingTurnActive && hotMicSpeakerSlot === row.slot;
                            return (
                              <li
                                key={row.sessionId || row.slot}
                                className="flex flex-col gap-3 rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <div className="min-w-0">
                                  <p className="truncate font-semibold text-white">
                                    @{row.label}{' '}
                                    <span className="font-mono text-[11px] font-bold text-brand-400">
                                      ({row.slot})
                                    </span>
                                  </p>
                                  {hotThis && (
                                    <p className="mt-1 font-mono text-[10px] font-bold uppercase tracking-wider text-emerald-400/90">
                                      ● Hot mic actif
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onSetChallengerMuted(row.sessionId, row.debaterId, row.audioOn);
                                    }}
                                    className={`flex min-h-[40px] min-w-[5.5rem] items-center justify-center rounded-xl border px-3 font-mono text-[10px] font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                                      muted
                                        ? 'border-emerald-500/50 bg-emerald-600/25 text-emerald-200 hover:bg-emerald-600/35'
                                        : 'border-rose-500/55 bg-rose-600/25 text-rose-100 hover:bg-rose-600/35'
                                    }`}
                                  >
                                    {muted ? (
                                      <>
                                        <Mic className="mr-1.5 h-3.5 w-3.5" />
                                        ON — ouvrir
                                      </>
                                    ) : (
                                      <>
                                        <MicOff className="mr-1.5 h-3.5 w-3.5" />
                                        OFF — couper
                                      </>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onHotMic(row.slot, speakingTurnSec);
                                    }}
                                    className="inline-flex min-h-[40px] items-center gap-2 rounded-xl border border-cyan-500/45 bg-cyan-500/15 px-3 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-200 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Radio className="h-3.5 w-3.5" />
                                    Hot mic
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => void onEjectParticipant(row.sessionId)}
                                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-blue-200/55 transition hover:border-rose-500/40 hover:bg-rose-950/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Expulser le participant"
                                    title="Expulser"
                                  >
                                    <UserX className="h-4 w-4" />
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 py-10 text-center font-mono text-[11px] uppercase tracking-widest text-blue-200/45">
                          Aucun challenger connecté sur la grille
                        </div>
                      )}
                    </section>

                    {/* Bloc 3 — Chronos & parole */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Chronomètres &amp; parole
                      </h3>

                      <div className="mb-6 rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <div className="mb-3 flex items-center gap-2 text-blue-200/55">
                          <Timer className="h-4 w-4 text-sky-400" strokeWidth={1.5} />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                            Chronomètre global — beef
                          </span>
                        </div>
                        {!timerActive ? (
                          <>
                            <p className="mb-3 text-center text-[11px] text-blue-200/50">
                              Définissez la durée puis lancez le direct.
                            </p>
                            <div className="mb-4 flex justify-center">
                              <TimeWheelPicker
                                valueSec={matchDurationMin * 60}
                                minSec={60}
                                maxSec={maxBeefDurationSec}
                                onChange={(sec) =>
                                  setMatchDurationMin(
                                    Math.max(
                                      1,
                                      Math.min(
                                        Math.floor(maxBeefDurationSec / 60),
                                        Math.floor(sec / 60),
                                      ),
                                    ),
                                  )
                                }
                                ariaLabel="Durée du match en minutes"
                                className="w-full max-w-[220px] rounded-3xl border border-white/12 bg-white/[0.06] py-3"
                              />
                            </div>
                            <button
                              type="button"
                              disabled={startingBeef}
                              onClick={() => void onStartBeef(matchDurationMin * 60)}
                              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition hover:brightness-110 active:scale-[0.99] disabled:opacity-45"
                            >
                              <Play className="h-4 w-4 fill-current" />
                              {startingBeef ? 'Ouverture…' : 'Démarrer le chrono LIVE'}
                            </button>
                          </>
                        ) : (
                          <>
                            <div
                              className={`font-mono text-center text-[2.85rem] font-black tabular-nums leading-none tracking-tighter ${beefTimerPaused ? 'animate-pulse text-amber-400' : 'text-white'}`}
                            >
                              {globalChronoDisplay}
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                              {beefTimerPaused ? (
                                <button
                                  type="button"
                                  onClick={onResumeBeefTimer}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-600/20 py-3 font-mono text-[10px] font-bold uppercase text-emerald-200 hover:bg-emerald-600/30"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Reprendre
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPauseBeefTimer}
                                  className="flex items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/15 py-3 font-mono text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-600/25"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                  Pause
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={onResetBeefTimer}
                                className="flex items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-3 font-mono text-[10px] font-bold uppercase text-white/85 hover:bg-white/[0.1]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/50">
                          Durée allouée au tour / Hot mic (TimeWheelPicker)
                        </p>
                        <TimeWheelPicker
                          valueSec={speakingTurnSec}
                          minSec={15}
                          maxSec={600}
                          onChange={(sec) => {
                            setSpeakingTurnSec(sec);
                            onParolePresetSecChange(sec);
                          }}
                          ariaLabel="Durée du prochain tour de parole"
                          className="mx-auto mb-5 w-full max-w-[240px] rounded-3xl border border-white/[0.1] bg-white/[0.04] py-3"
                        />

                        {speakingTurnActive && (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={onStopSpeakingTurn}
                              className="w-full rounded-2xl border-2 border-rose-500/60 bg-rose-600 py-4 font-mono text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition hover:bg-rose-500 active:scale-[0.99]"
                            >
                              Couper le tour de parole immédiatement
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                className="rounded-xl border border-white/15 bg-white/[0.08] py-2.5 font-mono text-[10px] font-bold uppercase tracking-wide text-white/90 hover:bg-white/[0.12]"
                              >
                                {speakingTurnPaused ? 'Reprendre timer' : 'Pause timer'}
                              </button>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="rounded-xl border border-sky-500/35 bg-sky-600/15 py-2.5 font-mono text-[10px] font-bold uppercase tracking-wide text-sky-200 hover:bg-sky-600/25"
                              >
                                Redémarrer le tour
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* Bloc 4 — Production */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Outils de production
                      </h3>

                      <div className="mb-5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void onMediatorToggleMic?.()}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition ${
                            mediatorMicEnabled
                              ? 'border-white/12 bg-white/[0.07]'
                              : 'border-rose-500/35 bg-rose-950/30'
                          }`}
                        >
                          {mediatorMicEnabled ? (
                            <Mic className="h-5 w-5 text-white" strokeWidth={1.5} />
                          ) : (
                            <MicOff className="h-5 w-5 text-rose-400" strokeWidth={1.5} />
                          )}
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/60">
                            Mon micro
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void onMediatorToggleCam?.()}
                          className={`flex flex-col items-center gap-1.5 rounded-2xl border px-3 py-3 transition ${
                            mediatorCamEnabled
                              ? 'border-white/12 bg-white/[0.07]'
                              : 'border-rose-500/35 bg-rose-950/30'
                          }`}
                        >
                          {mediatorCamEnabled ? (
                            <Video className="h-5 w-5 text-white" strokeWidth={1.5} />
                          ) : (
                            <VideoOff className="h-5 w-5 text-rose-400" strokeWidth={1.5} />
                          )}
                          <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/60">
                            Ma caméra
                          </span>
                        </button>
                      </div>

                      <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3">
                        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-200/55">
                          Bannière — message public
                        </p>
                        <label htmlFor="mediator-announce-input" className="sr-only">
                          Texte de la bannière
                        </label>
                        <textarea
                          id="mediator-announce-input"
                          value={announceDraft}
                          onChange={(e) => setAnnounceDraft(e.target.value)}
                          rows={3}
                          placeholder="Message affiché sur l’arène…"
                          className="mb-3 w-full resize-none rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-3 font-sans text-sm text-white placeholder-blue-200/35 focus:border-amber-400/35 focus:outline-none"
                        />
                        <p className="mb-2 font-mono text-[9px] font-bold uppercase tracking-wider text-blue-200/45">
                          Durée d’affichage
                        </p>
                        <div className="mb-3 flex flex-wrap gap-1.5">
                          {([60, 120, 300, 600] as const).map((sec) => (
                            <button
                              key={sec}
                              type="button"
                              onClick={() => setAnnounceDurationSec(sec)}
                              className={`rounded-full px-3 py-1.5 font-mono text-[9px] font-black uppercase ${
                                announceDurationSec === sec
                                  ? 'bg-amber-500/45 text-black'
                                  : 'border border-white/12 bg-white/[0.06] text-white/70 hover:bg-white/[0.1]'
                              }`}
                            >
                              {sec >= 60 ? `${sec / 60} min` : `${sec}s`}
                            </button>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onPublishAnnouncement(announceDraft.trim(), announceDurationSec);
                              onClose();
                            }}
                            className="rounded-full bg-amber-500 px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-black hover:bg-amber-400"
                          >
                            Publier la bannière
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onClearAnnouncement();
                              setAnnounceDraft('');
                              onClose();
                            }}
                            className="rounded-full border border-white/15 px-5 py-2.5 font-mono text-[10px] font-black uppercase tracking-wider text-white/75 hover:bg-white/[0.08]"
                          >
                            Effacer bannière
                          </button>
                        </div>
                      </div>

                      <div className="my-6 border-t border-white/10 pt-5">
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/60">
                            Invités en attente
                          </span>
                          <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 font-mono text-[9px] text-blue-200/65">
                            {pendingInvites.length}
                          </span>
                        </div>
                        {onInviteParticipant && (
                          <MediatorInviteInline
                            excludeParticipantIds={inviteExcludeParticipantIds}
                            currentUserId={inviteCurrentUserId}
                            onInvite={onInviteParticipant}
                          />
                        )}
                        <ul className="mt-4 space-y-2">
                          {pendingInvites.length === 0 ? (
                            <li className="rounded-xl border border-dashed border-white/10 py-6 text-center font-mono text-[10px] text-blue-200/45">
                              Aucune invitation en attente
                            </li>
                          ) : (
                            pendingInvites.map((inv) => (
                              <li
                                key={inv.userId}
                                className="flex flex-col gap-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                              >
                                <span className="min-w-0 break-words text-sm font-medium text-white/90">
                                  {inv.label}
                                </span>
                                <div className="flex shrink-0 gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onRejectPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex-1 rounded-xl border border-rose-500/45 bg-rose-600/85 py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-white hover:bg-rose-500 sm:flex-initial sm:px-6"
                                  >
                                    Refuser
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAcceptPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex-1 rounded-xl border border-emerald-400/55 bg-emerald-600 py-2.5 font-mono text-[10px] font-black uppercase tracking-wide text-white hover:bg-emerald-500 sm:flex-initial sm:px-6"
                                  >
                                    Accepter
                                  </button>
                                </div>
                              </li>
                            ))
                          )}
                        </ul>
                      </div>
                    </section>

                    {/* Bloc 5 — Verdict (danger) */}
                    <section
                      className={`${SECTION_SHELL} border-rose-500/30 bg-gradient-to-b from-rose-950/25 to-transparent pb-8`}
                    >
                      <div className="mb-4 flex items-center gap-2">
                        <span className="rounded bg-rose-600/85 px-2 py-0.5 font-mono text-[9px] font-black uppercase text-white">
                          Zone critique
                        </span>
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-rose-400/95">
                          Verdict &amp; clôture
                        </h3>
                      </div>

                      {confirmVerdict ? (
                        <div
                          role="alert"
                          className="space-y-4 rounded-xl border-2 border-rose-500 bg-rose-950/65 p-4 shadow-[inset_0_0_0_1px_rgba(225,29,72,0.35)]"
                        >
                          <p className="text-center font-mono text-[10px] font-black uppercase tracking-widest text-rose-200">
                            Confirmation requise
                          </p>
                          <p className="text-center text-[13px] leading-snug text-rose-50/95">
                            {confirmVerdict === 'resolved'
                              ? 'Proclamer la paix terminera ou marquera le dénouement officiel.'
                              : confirmVerdict === 'rematch'
                                ? 'Une revanche restructure le flux — vérifiez avant d’ordonner.'
                                : 'Sceller définitivement met fin au broadcast pour tous les participants.'}
                          </p>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmVerdict(null)}
                              className="flex-1 rounded-xl border border-white/20 bg-white/10 py-3 font-mono text-[11px] font-bold uppercase text-white hover:bg-white/15"
                            >
                              Annuler
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                onVerdict(confirmVerdict);
                                setConfirmVerdict(null);
                                onClose();
                              }}
                              className="flex-[1.2] rounded-xl bg-rose-600 py-3 font-mono text-[11px] font-black uppercase text-white shadow-[0_0_20px_rgba(225,29,72,0.55)] hover:bg-rose-500"
                            >
                              Exécuter le verdict
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2.5">
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('resolved')}
                            className="w-full rounded-2xl border border-emerald-500/55 bg-emerald-600/20 py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-emerald-200 transition hover:bg-emerald-600/35"
                          >
                            Proclamer la paix
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('rematch')}
                            className="w-full rounded-2xl border border-amber-500/50 bg-amber-600/18 py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-600/32"
                          >
                            Ordonner une revanche
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('closed')}
                            className="w-full rounded-2xl border border-rose-400/55 bg-rose-950/55 py-3.5 font-mono text-[12px] font-black uppercase tracking-widest text-rose-100 transition hover:bg-rose-900/65"
                          >
                            Sceller l’arène
                          </button>
                        </div>
                      )}
                    </section>
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
