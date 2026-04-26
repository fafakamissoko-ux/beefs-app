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
} from 'lucide-react';
import { TimeWheelPicker } from '@/components/TimeWheelPicker';
import { MediatorInviteInline } from '@/components/MediatorInviteInline';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/Tabs';

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
  onStartBeef: (durationSec: number) => void | Promise<void>;
  onMuteAll: () => void;
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
  /** Acceptation / refus : le parent doit appeler POST /api/beef/manage (RLS — pas d’UPDATE client). */
  onAcceptPendingInvite?: (userId: string) => void;
  onRejectPendingInvite?: (userId: string) => void;
  /** Inviter un co-hôte (recherche inline dans le tableau de bord) */
  onInviteParticipant?: (userId: string) => void | Promise<void>;
  /** IDs déjà sur le ring / à exclure de la recherche (dont l’hôte courant) */
  inviteExcludeParticipantIds?: string[];
  inviteCurrentUserId?: string | null;
};

const TOOLS_GLASS_CARD =
  'flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 mb-4 backdrop-blur-xl shadow-lg';

const VERDICT_BTN_RESOLVED =
  'w-full rounded-[1.5rem] border border-emerald-500/40 bg-emerald-500/10 py-3 text-[11px] font-black uppercase tracking-widest text-emerald-400 transition-colors hover:bg-emerald-500/20';
const VERDICT_BTN_CLOSED =
  'w-full rounded-[1.5rem] border border-white/20 bg-white/5 py-3 text-[11px] font-black uppercase tracking-widest text-white/90 transition-colors hover:bg-white/10';
const VERDICT_BTN_REMATCH =
  'w-full rounded-[1.5rem] border border-amber-500/40 bg-amber-500/10 py-3 text-[11px] font-black uppercase tracking-widest text-amber-400 transition-colors hover:bg-amber-500/20';
const TILE = 'flex flex-col items-center justify-center gap-1.5 rounded-[2.5rem] border border-white/10 bg-white/5 px-3 py-4 backdrop-blur-3xl transition-all active:scale-[0.97]';
const TILE_WIDE = `${TILE} col-span-2`;
const TILE_ICON = 'h-5 w-5';
const TILE_LABEL = 'font-mono text-[9px] font-bold uppercase tracking-widest';

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
  onAdjustTime,
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
}: MediatorSidebarProps) {
  const [announceDraft, setAnnounceDraft] = useState('');
  const [announceDurationSec, setAnnounceDurationSec] = useState(120);
  const [speakingTurnSec, setSpeakingTurnSec] = useState(60);
  const [matchDurationMin, setMatchDurationMin] = useState(30);

  const pendingInviteCount = pendingInvites.length;

  useEffect(() => {
    if (!open) {
      return;
    }
    setAnnounceDraft(announcementText);
    setSpeakingTurnSec(parolePresetSec);
  }, [open, announcementText, parolePresetSec]);

  const deck =
    typeof document !== 'undefined'
      ? createPortal(
          <AnimatePresence>
            {open && (
              <>
                {/* Backdrop — portail body pour éviter les conflits d’empilement dans l’arène */}
                <motion.button
                  type="button"
                  aria-label="Fermer le tableau de bord"
                  className="fixed inset-0 z-[9998] cursor-default bg-black/50 backdrop-blur-[2px]"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => onClose()}
                />

                {/* Bottom Sheet — stopPropagation : ne pas laisser le clic remonter au reste de l’app */}
                <motion.aside
                  data-mediator-regie-sheet
                  role="dialog"
                  aria-label="Tableau de bord"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  initial={{ y: '100%' }}
                  animate={{ y: 0 }}
                  exit={{ y: '100%' }}
                  transition={{ type: 'spring', damping: 32, stiffness: 380 }}
                  className="fixed inset-x-0 bottom-0 z-[9999] mx-auto flex max-h-[min(88dvh,720px)] w-full max-w-lg min-h-0 flex-col overflow-hidden rounded-t-[2.5rem] border-t border-white/10 bg-[#08080A]/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-24px_64px_rgba(0,0,0,0.6)] backdrop-blur-3xl"
                >
                  {/* Drag handle */}
                  <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20" />

                  {/* Header */}
                  <div className="relative z-10 flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
                    <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 font-mono text-xs font-bold tracking-tight text-white/90">
                      Tableau de bord
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                      }}
                      className="relative z-20 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/10 text-white shadow-sm backdrop-blur-3xl hover:bg-white/15"
                      aria-label="Fermer"
                    >
                      <X className="h-4 w-4" strokeWidth={1} />
                    </button>
                  </div>

            <Tabs defaultValue="debate" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              <div className="mb-2 flex shrink-0 justify-center px-0.5">
                <TabsList className="w-full max-w-md justify-stretch">
                  <TabsTrigger value="debate">
                    <span className="flex flex-col items-center gap-0.5 text-center">
                      <span className="leading-tight">⚔️ Débat</span>
                      <span className="text-[7px] font-semibold uppercase tracking-wider text-white/40">Chrono · Parole</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="guests">
                    <span className="inline-flex flex-col items-center justify-center gap-0.5 text-center">
                      <span className="inline-flex items-center justify-center gap-1.5 leading-tight">
                        👥 Invités
                        {pendingInviteCount > 0 && (
                          <span className="flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-ember-500 px-1 font-mono text-[8px] font-black leading-none text-black">
                            {pendingInviteCount > 99 ? "99+" : pendingInviteCount}
                          </span>
                        )}
                      </span>
                      <span className="text-[7px] font-semibold uppercase tracking-wider text-white/40">File d&apos;attente</span>
                    </span>
                  </TabsTrigger>
                  <TabsTrigger value="tools">
                    <span className="flex flex-col items-center gap-0.5 text-center">
                      <span className="leading-tight">🛠️ Outils</span>
                      <span className="text-[7px] font-semibold uppercase tracking-wider text-white/40">Annonce · Verdict</span>
                    </span>
                  </TabsTrigger>
                </TabsList>
              </div>
              <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-1 pb-4 overscroll-contain hide-scrollbar">
                <TabsContent value="debate" className="flex min-h-0 flex-1 overflow-y-auto p-4 hide-scrollbar">

                  {/* BLOC 1 : STATUT & LANCEMENT */}
                  <section className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-xl">
                    {!timerActive ? (
                      <div className="flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                          <Play className="h-4 w-4 text-brand-400" />
                          <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/60">
                            Configuration du Match
                          </h3>
                        </div>
                        <div className="flex flex-col items-center justify-center py-2">
                          <span className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Durée (Minutes)</span>
                          <TimeWheelPicker
                            valueSec={matchDurationMin * 60}
                            minSec={60}
                            maxSec={maxBeefDurationSec}
                            onChange={(sec) =>
                              setMatchDurationMin(Math.max(1, Math.min(Math.floor(maxBeefDurationSec / 60), Math.floor(sec / 60))))
                            }
                            ariaLabel="Durée du match en minutes"
                            className="rounded-3xl border border-white/[0.06] bg-white/[0.02] py-2 w-full max-w-[200px] mx-auto"
                          />
                        </div>
                        <button
                          type="button"
                          disabled={startingBeef}
                          onClick={() => {
                            void onStartBeef(matchDurationMin * 60);
                            onClose();
                          }}
                          className="w-full rounded-[1.5rem] bg-gradient-to-r from-purple-600 to-emerald-600 py-4 text-xs font-black uppercase tracking-widest text-white shadow-lg transition-transform active:scale-95 disabled:opacity-50"
                        >
                          {startingBeef ? 'Lancement...' : 'DÉMARRER LE CLASH'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-2">
                        <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white/40">
                          Chronomètre Global
                        </h3>
                        <div
                          className={`font-mono text-4xl font-black ${
                            beefTimerPaused ? 'animate-pulse text-amber-500' : 'text-white'
                          }`}
                        >
                          {Math.floor(beefRemainingSec / 60)}:{(beefRemainingSec % 60).toString().padStart(2, '0')}
                        </div>
                        <div className="mt-4 flex w-full gap-2">
                          {beefTimerPaused ? (
                            <button
                              type="button"
                              onClick={onResumeBeefTimer}
                              className="flex-1 rounded-xl bg-emerald-500/20 py-2 text-[10px] font-bold uppercase text-emerald-400 hover:bg-emerald-500/30"
                            >
                              Reprendre
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={onPauseBeefTimer}
                              className="flex-1 rounded-xl bg-amber-500/20 py-2 text-[10px] font-bold uppercase text-amber-400 hover:bg-amber-500/30"
                            >
                              Pause
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={onResetBeefTimer}
                            className="flex-1 rounded-xl bg-white/5 py-2 text-[10px] font-bold uppercase text-white/60 hover:bg-white/10"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* BLOC 2 : HOT MIC (Tours de parole) */}
                  <section className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-xl">
                    <div className="flex items-center gap-2">
                      <Timer className="h-4 w-4 text-orange-400" />
                      <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/60">
                        Tours de Parole
                      </h3>
                    </div>

                    <div className="flex flex-col gap-4">
                      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-black/20 p-3">
                        <span className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-white/40">Durée allouée</span>
                        <TimeWheelPicker
                          valueSec={speakingTurnSec}
                          minSec={15}
                          maxSec={600}
                          onChange={(sec) => {
                            setSpeakingTurnSec(sec);
                            onParolePresetSecChange(sec);
                          }}
                          ariaLabel="Durée allouée au tour de parole"
                          className="rounded-3xl border border-white/[0.06] bg-white/[0.02] py-2 w-full max-w-[200px]"
                        />
                      </div>

                      <div className="flex w-full gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onHotMic('A', speakingTurnSec);
                            onClose();
                          }}
                          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.5rem] border border-red-500/30 bg-red-500/10 py-4 transition-all hover:bg-red-500/20 active:scale-95"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest text-red-400">Challenger 1</span>
                          <span className="text-2xl" aria-hidden>
                            🔴
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onHotMic('B', speakingTurnSec);
                            onClose();
                          }}
                          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-[1.5rem] border border-emerald-500/30 bg-emerald-500/10 py-4 transition-all hover:bg-emerald-500/20 active:scale-95"
                        >
                          <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Challenger 2</span>
                          <span className="text-2xl" aria-hidden>
                            🟢
                          </span>
                        </button>
                      </div>

                      {speakingTurnActive && (
                        <button
                          type="button"
                          onClick={onStopSpeakingTurn}
                          className="w-full rounded-xl bg-white/5 py-3 text-[10px] font-bold uppercase tracking-widest text-white/60 hover:bg-white/10"
                        >
                          Interrompre le tour
                        </button>
                      )}
                    </div>
                  </section>

                  {/* BLOC 3 : CONTRÔLE DE LA SALLE */}
                  <section className="mb-4 flex flex-col gap-4 rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-lg backdrop-blur-xl">
                    <div className="mb-2 flex items-center gap-2">
                      <MicOff className="h-4 w-4 text-red-400" />
                      <h3 className="font-mono text-[11px] font-bold uppercase tracking-widest text-white/60">
                        Contrôle Vocal
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={onMuteAll}
                      className="flex w-full items-center justify-center gap-2 rounded-[1rem] border border-red-500/50 bg-red-500/15 py-3 text-xs font-black uppercase tracking-widest text-red-400 transition-colors hover:bg-red-500/30 active:scale-95"
                    >
                      <MicOff className="h-4 w-4" />
                      Silence Total
                    </button>

                    {remoteRows.length > 0 ? (
                      <ul className="mt-2 flex flex-col gap-2">
                        {remoteRows.map((row) => {
                          const muted = !row.audioOn;
                          return (
                            <li
                              key={row.sessionId}
                              className="flex items-center justify-between rounded-2xl border border-white/5 bg-black/20 p-3"
                            >
                              <span className="max-w-[100px] truncate font-mono text-[11px] font-bold text-white">@{row.label}</span>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => void onSetChallengerMuted(row.sessionId, row.debaterId, row.audioOn)}
                                  className={`flex w-[80px] items-center justify-center gap-1 rounded-xl border py-2 font-mono text-[9px] font-bold uppercase transition-colors ${
                                    muted
                                      ? 'border-brand-500/40 bg-brand-500/10 text-brand-400'
                                      : 'border-white/10 bg-white/5 text-white/60'
                                  }`}
                                >
                                  {muted ? 'Réactiver' : 'Couper'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void onEjectParticipant(row.sessionId)}
                                  className="flex items-center justify-center rounded-xl border border-ember-500/30 bg-ember-500/10 px-3 py-2 text-ember-400 hover:bg-ember-500/20"
                                >
                                  <UserX className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <div className="py-2 text-center font-mono text-[10px] uppercase tracking-widest text-white/30">
                        Aucun participant
                      </div>
                    )}
                  </section>
                </TabsContent>
                <TabsContent value="guests" className="mt-0 space-y-3">
                  <div className="flex max-h-[min(52vh,420px)] flex-col gap-3 overflow-y-auto overflow-x-hidden overscroll-contain rounded-[2.5rem] border border-white/12 bg-black/50 p-3 backdrop-blur-xl [-webkit-overflow-scrolling:touch] touch-pan-y">
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
                        <li className="rounded-3xl border border-dashed border-white/10 px-3 py-4 text-center font-mono text-[10px] text-white/45">
                          Aucune invitation en attente
                        </li>
                      ) : (
                        pendingInvites.map((inv) => (
                          <li
                            key={inv.userId}
                            className="flex items-start justify-between gap-2 rounded-3xl border border-white/[0.08] bg-white/[0.04] px-3 py-2.5"
                          >
                            <span className="min-w-0 break-words font-mono text-[11px] text-white/85">
                              {inv.label}
                            </span>
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  onRejectPendingInvite?.(inv.userId);
                                  onClose();
                                }}
                                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white/50 hover:bg-red-500/20 hover:text-red-400"
                                aria-label="Refuser l’invitation"
                              >
                                <X className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  onAcceptPendingInvite?.(inv.userId);
                                  onClose();
                                }}
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
                </TabsContent>
                <TabsContent value="tools" className="mt-0">
                  {/* BLOC ANNONCE */}
                  <div className={TOOLS_GLASS_CARD}>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/55">Bannière d&apos;annonce</h3>
                    <div className="rounded-[1.5rem] border border-white/12 bg-black/25 p-3 backdrop-blur-xl">
                      <label htmlFor="mediator-announce-input" className="sr-only">
                        Texte de l&apos;annonce
                      </label>
                      <textarea
                        id="mediator-announce-input"
                        value={announceDraft}
                        onChange={(e) => setAnnounceDraft(e.target.value)}
                        rows={2}
                        placeholder="Message du bandeau…"
                        className="mb-2 w-full resize-none rounded-3xl border border-white/10 bg-white/5 px-3 py-2 font-mono text-xs text-white placeholder-white/35 focus:border-amber-400/40 focus:outline-none"
                      />
                      <p className="mb-1.5 font-mono text-[8px] font-bold uppercase tracking-wider text-white/40">
                        Durée d&apos;affichage
                      </p>
                      <div className="mb-3 flex flex-wrap gap-1.5">
                        {([60, 120, 300, 600] as const).map((sec) => (
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
                            {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
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
                          className="rounded-full border border-amber-500/50 bg-amber-500/20 px-4 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-amber-50 hover:bg-amber-500/35"
                        >
                          Publier
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onClearAnnouncement();
                            setAnnounceDraft('');
                            onClose();
                          }}
                          className="rounded-full border border-white/15 bg-white/5 px-4 py-2 font-mono text-[9px] font-black uppercase tracking-widest text-white/75 hover:bg-white/10"
                        >
                          Effacer bannière
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* BLOC PARAMÈTRES — micro, cam, durée limite (tour de parole) */}
                  <div className={TOOLS_GLASS_CARD}>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/55">Paramètres</h3>
                    <div className="grid grid-cols-2 gap-2.5">
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
                    </div>
                    <div className="mt-3 flex flex-col items-center justify-center space-y-2">
                      <p className="text-center font-mono text-[9px] font-bold uppercase tracking-widest text-white/40">
                        Prochain tour de parole
                      </p>
                      <TimeWheelPicker
                        valueSec={parolePresetSec}
                        minSec={15}
                        maxSec={600}
                        onChange={onParolePresetSecChange}
                        ariaLabel="Durée limite du prochain tour de parole"
                        className="rounded-3xl border border-white/[0.06] bg-white/[0.02] py-2 w-full max-w-[200px]"
                      />
                    </div>
                  </div>

                  {/* BLOC VERDICT & FIN */}
                  <div className={TOOLS_GLASS_CARD}>
                    <h3 className="font-mono text-[10px] font-bold uppercase tracking-widest text-white/55">Verdict &amp; fin</h3>
                    <div className="flex flex-col gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('resolved');
                          onClose();
                        }}
                        className={VERDICT_BTN_RESOLVED}
                      >
                        Résolu
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('closed');
                          onClose();
                        }}
                        className={VERDICT_BTN_CLOSED}
                      >
                        Clôture
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onVerdict('rematch');
                          onClose();
                        }}
                        className={VERDICT_BTN_REMATCH}
                      >
                        Rematch
                      </button>
                    </div>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          </motion.aside>
              </>
            )}
          </AnimatePresence>,
          document.body,
        )
      : null;

  return <>{deck}</>;
}
