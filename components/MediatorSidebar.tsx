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
  LogOut,
  Pause,
  RotateCcw,
  Radio,
} from 'lucide-react';
import { MediatorInviteInline } from '@/components/MediatorInviteInline';

export type MediatorRemoteRow = {
  sessionId: string;
  label: string;
  slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F';
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
  hotMicSpeakerSlot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | null;
  onHotMic: (slot: 'A' | 'B' | 'C' | 'D' | 'E' | 'F', durationSec: number, opts?: { force?: boolean }) => void;
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
  'rounded-3xl border border-white/[0.08] bg-white/[0.02] p-4 shadow-[0_8px_32px_rgba(0,0,0,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] backdrop-blur-[60px]';

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
                  className="fixed inset-x-0 bottom-0 z-[9999] flex h-[85dvh] flex-col overflow-hidden rounded-t-[2.5rem] border border-white/10 bg-black/50 shadow-[0_-20px_80px_rgba(0,0,0,0.6)] backdrop-blur-[80px] sm:inset-x-auto sm:inset-y-0 sm:right-0 sm:left-auto sm:ml-0 sm:h-dvh sm:w-[400px] sm:rounded-none sm:border-l sm:border-t-0"
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
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] text-white transition hover:bg-white/[0.14]"
                      aria-label="Fermer"
                    >
                      <X className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  </header>

                  <div className="hide-scrollbar flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain p-4">

                    {/* BLOC 1 — TÉLÉMÉTRIE (CHRONOMÈTRES & PAROLE) */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Télémétrie — Chronos
                      </h3>

                      {/* CHRONOMÈTRE GLOBAL (Charte PRESTIGE) */}
                      <div className="mb-6 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/30 to-black/40 p-5 shadow-[0_0_20px_rgba(245,158,11,0.15)] backdrop-blur-md">
                        <div className="mb-3 flex items-center gap-2 text-amber-200/80">
                          <Timer className="h-4 w-4 text-amber-400" strokeWidth={1.5} />
                          <span className="font-mono text-[10px] font-bold uppercase tracking-wider">
                            Chronomètre global — beef
                          </span>
                        </div>
                        {!timerActive ? (
                          <>
                            <p className="mb-3 text-center text-[11px] text-blue-200/50">
                              Définissez la durée puis lancez le direct.
                            </p>
                            <div className="mb-4 flex justify-center gap-3">
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="4"
                                  value={Math.floor(matchDurationMin / 60)}
                                  onChange={(e) => {
                                    const h = Math.max(0, Math.min(4, Number(e.target.value) || 0));
                                    const m = matchDurationMin % 60;
                                    setMatchDurationMin(h * 60 + m);
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Heures</span>
                              </div>
                              <span className="self-start pt-2 text-xl font-black text-white/30">:</span>
                              <div className="flex flex-col items-center">
                                <input
                                  type="number"
                                  min="0"
                                  max="59"
                                  value={matchDurationMin % 60}
                                  onChange={(e) => {
                                    const h = Math.floor(matchDurationMin / 60);
                                    const m = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                    setMatchDurationMin(Math.max(1, h * 60 + m));
                                  }}
                                  className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-white focus:border-sky-400 focus:outline-none"
                                />
                                <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-white/50">Minutes</span>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={startingBeef}
                              onClick={() => void onStartBeef(matchDurationMin * 60)}
                              className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl bg-white text-xs font-black uppercase tracking-widest text-black shadow-[0_8px_32px_rgba(255,255,255,0.12),inset_0_1px_1px_rgba(255,255,255,0.2)] backdrop-blur-md transition hover:bg-gray-200 active:scale-[0.99] disabled:opacity-45"
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
                                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/20 bg-white/10 font-mono text-[10px] font-bold uppercase text-white hover:bg-white/15"
                                >
                                  <Play className="h-3.5 w-3.5" />
                                  Reprendre
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={onPauseBeefTimer}
                                  className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-amber-500/40 bg-amber-600/15 font-mono text-[10px] font-bold uppercase text-amber-200 hover:bg-amber-600/25"
                                >
                                  <Pause className="h-3.5 w-3.5" />
                                  Pause
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={onResetBeefTimer}
                                className="flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] font-mono text-[10px] font-bold uppercase text-white/85 hover:bg-white/[0.1]"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reset
                              </button>
                            </div>
                          </>
                        )}
                      </div>

                      {/* HOT MIC (Charte TACTIQUE) */}
                      <div className="rounded-xl border border-cyan-500/20 bg-cyan-950/10 p-4 backdrop-blur-sm">
                        <p className="mb-3 text-center font-mono text-[10px] font-bold uppercase tracking-widest text-cyan-200/60">
                          Durée allouée au tour / Hot mic
                        </p>
                        <div className="mx-auto mb-5 flex justify-center gap-3">
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="10"
                              value={Math.floor(speakingTurnSec / 60)}
                              onChange={(e) => {
                                const m = Math.max(0, Math.min(10, Number(e.target.value) || 0));
                                const s = speakingTurnSec % 60;
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Minutes</span>
                          </div>
                          <span className="self-start pt-2 text-xl font-black text-blue-200/30">:</span>
                          <div className="flex flex-col items-center">
                            <input
                              type="number"
                              min="0"
                              max="59"
                              step="15"
                              value={speakingTurnSec % 60}
                              onChange={(e) => {
                                const m = Math.floor(speakingTurnSec / 60);
                                const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                                const total = m * 60 + s;
                                setSpeakingTurnSec(Math.max(15, total));
                                onParolePresetSecChange(Math.max(15, total));
                              }}
                              className="w-16 rounded-xl border border-white/10 bg-black/40 py-2 text-center text-lg font-black text-cyan-400 focus:border-cyan-300 focus:outline-none"
                            />
                            <span className="mt-1 font-mono text-[9px] uppercase tracking-wider text-blue-200/50">Secondes</span>
                          </div>
                        </div>

                        {speakingTurnActive && (
                          <div className="space-y-3">
                            <button
                              type="button"
                              onClick={onStopSpeakingTurn}
                              className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border-2 border-rose-500/60 bg-rose-600 font-mono text-xs font-black uppercase tracking-[0.15em] text-white shadow-[0_0_24px_rgba(225,29,72,0.35)] transition hover:bg-rose-500 active:scale-[0.99]"
                            >
                              Couper le tour de parole immédiatement
                            </button>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={speakingTurnPaused ? onResumeSpeakingTurn : onPauseSpeakingTurn}
                                className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/15 bg-white/[0.08] font-mono text-[10px] font-bold uppercase tracking-wide text-white/90 hover:bg-white/[0.12]"
                              >
                                {speakingTurnPaused ? 'Reprendre timer' : 'Pause timer'}
                              </button>
                              <button
                                type="button"
                                onClick={onRestartSpeakingTurn}
                                className="flex min-h-[44px] items-center justify-center rounded-xl border border-sky-500/35 bg-sky-600/15 font-mono text-[10px] font-bold uppercase tracking-wide text-sky-200 hover:bg-sky-600/25"
                              >
                                Redémarrer le tour
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>

                    {/* BLOC 2 — OUTILS DE PRODUCTION & URGENCE */}
                    <section className={SECTION_SHELL}>
                      <h3 className="mb-4 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-blue-200/65">
                        Outils de production
                      </h3>

                      <div className="mb-5 grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void onMediatorToggleMic?.()}
                          className={`flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 transition ${
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
                          className={`flex min-h-[44px] flex-col items-center justify-center gap-1.5 rounded-2xl border px-3 transition ${
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
                          className="mb-3 w-full resize-none rounded-2xl border border-white/[0.08] bg-black/40 px-4 py-3 font-sans text-sm text-white placeholder-white/30 shadow-[inset_0_2px_10px_rgba(0,0,0,0.5)] focus:border-white/20 focus:bg-black/60 focus:outline-none"
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
                              className={`min-h-[44px] rounded-full px-3 font-mono text-[9px] font-black uppercase ${
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
                            className="flex min-h-[44px] items-center rounded-full bg-amber-500 px-5 font-mono text-[10px] font-black uppercase tracking-wider text-black hover:bg-amber-400"
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
                            className="flex min-h-[44px] items-center rounded-full border border-white/15 px-5 font-mono text-[10px] font-black uppercase tracking-wider text-white/75 hover:bg-white/[0.08]"
                          >
                            Effacer bannière
                          </button>
                        </div>
                      </div>

                      <div className="mt-6 border-t border-rose-500/25 pt-4">
                        <button
                          type="button"
                          onClick={onMuteAll}
                          className="flex min-h-[44px] w-full items-center justify-center gap-3 rounded-2xl border border-rose-500/50 bg-rose-950/40 px-4 font-mono text-[11px] font-black uppercase tracking-widest text-rose-400 shadow-[0_4px_16px_rgba(225,29,72,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md transition hover:bg-rose-900/50 active:scale-[0.98]"
                        >
                          <MicOff className="h-5 w-5 shrink-0" strokeWidth={2} />
                          Silence total (Mute All)
                        </button>
                      </div>
                    </section>

                    {/* BLOC 3 — GESTION DE LA SCÈNE (LE RING) */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/90">
                          L'Agora — Intervenants actifs
                        </h3>
                        <span className="rounded-full border border-amber-500/20 bg-amber-950/40 px-2 py-0.5 font-mono text-[9px] text-amber-200/60 shadow-[0_0_8px_rgba(245,158,11,0.2)]">
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
                                className="flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
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
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onSetChallengerMuted(row.sessionId, row.debaterId, row.audioOn);
                                    }}
                                    className={`flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center rounded-xl border px-2 font-mono text-[10px] font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                                      muted
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                                        : 'border-rose-500/40 bg-rose-950/40 text-rose-400 hover:bg-rose-900/50'
                                    }`}
                                  >
                                    {muted ? (
                                      <><Mic className="mr-1.5 h-3.5 w-3.5 shrink-0" /> ON</>
                                    ) : (
                                      <><MicOff className="mr-1.5 h-3.5 w-3.5 shrink-0" /> OFF</>
                                    )}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => {
                                      if (!row.sessionId) return;
                                      onHotMic(row.slot, speakingTurnSec);
                                    }}
                                    className="flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center gap-1.5 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-2 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-300 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Radio className="h-3.5 w-3.5 shrink-0" /> Hot Mic
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => void onEjectParticipant(row.sessionId)}
                                    className="flex min-h-[44px] flex-[2] min-w-[200px] items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] px-3 font-mono text-[10px] font-black uppercase tracking-wide text-blue-200/60 transition hover:border-rose-500/40 hover:bg-rose-950/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
                                    aria-label="Renvoyer parmi les citoyens"
                                    title="Renvoyer parmi les citoyens"
                                  >
                                    <LogOut className="mr-2 h-4 w-4 shrink-0" /> Renvoyer aux citoyens
                                  </button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <div className="rounded-xl border border-dashed border-white/10 py-8 text-center font-mono text-[11px] uppercase tracking-widest text-blue-200/45">
                          Aucun participant sur scène
                        </div>
                      )}
                    </section>

                    {/* BLOC 4 — LES COULISSES (FILE D'ATTENTE) */}
                    <section className={SECTION_SHELL}>
                      <div className="mb-3 flex items-center justify-between">
                        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/60">
                          Coulisses — Invités en attente
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
                              className="relative group"
                            >
                              {/* HALO LUMINEUX (Pulse) */}
                              <div className="absolute -inset-0.5 rounded-xl bg-amber-500/30 blur-sm animate-pulse" aria-hidden="true" />

                              {/* CARTE CONTENU (Premium Glass) */}
                              <div className="relative flex flex-col gap-2 rounded-xl border border-amber-500/50 bg-slate-950/90 px-3 py-3 shadow-lg backdrop-blur-md">
                                <span className="min-w-0 break-words text-sm font-medium text-white/90">
                                  {inv.label}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onRejectPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center rounded-xl border border-rose-500/45 bg-rose-600/85 font-mono text-[10px] font-black uppercase tracking-wide text-white transition hover:bg-rose-500"
                                  >
                                    Refuser
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onAcceptPendingInvite?.(inv.userId);
                                      onClose();
                                    }}
                                    className="flex min-h-[44px] flex-1 min-w-[110px] items-center justify-center rounded-xl bg-white font-mono text-[10px] font-black uppercase tracking-wide text-black transition hover:bg-gray-200"
                                  >
                                    Accepter
                                  </button>
                                </div>
                              </div>
                            </li>
                          ))
                        )}
                      </ul>
                    </section>

                    {/* BLOC 5 — ZONE CRITIQUE (CLÔTURE) */}
                    <section className="rounded-3xl border border-rose-500/20 bg-rose-950/20 p-4 shadow-lg pb-8">
                      <div className="mb-4 flex items-center gap-2">
                        <span className="rounded border border-rose-500/50 bg-rose-500/20 px-1.5 py-0.5 font-mono text-[8px] font-black uppercase tracking-widest text-rose-300">
                          Zone critique
                        </span>
                        <h3 className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-rose-200/70">
                          Verdict & Clôture
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
                              className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-white/20 bg-white/10 font-mono text-[11px] font-bold uppercase text-white hover:bg-white/15"
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
                              className="flex min-h-[44px] flex-[1.2] items-center justify-center rounded-xl bg-rose-600 font-mono text-[11px] font-black uppercase text-white shadow-[0_0_20px_rgba(225,29,72,0.55)] hover:bg-rose-500"
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
                            className="flex min-h-[44px] w-full items-center justify-center rounded-2xl bg-white font-mono text-[12px] font-black uppercase tracking-widest text-black transition hover:bg-gray-200"
                          >
                            Proclamer la paix
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('rematch')}
                            className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-amber-500/50 bg-amber-600/18 font-mono text-[12px] font-black uppercase tracking-widest text-amber-200 transition hover:bg-amber-600/32"
                          >
                            Ordonner une revanche
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmVerdict('closed')}
                            className="flex min-h-[44px] w-full items-center justify-center rounded-2xl border border-rose-400/55 bg-rose-950/55 font-mono text-[12px] font-black uppercase tracking-widest text-rose-100 transition hover:bg-rose-900/65"
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
