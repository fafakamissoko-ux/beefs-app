'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff, Video, VideoOff, PanelRightClose, UserX, Volume2, VolumeX, Clock, Sliders } from 'lucide-react';

export type MediatorDebaterRow = {
  id: string;
  name: string;
  isMuted: boolean;
};

type RemoteKickRow = {
  sessionId: string;
  label: string;
};

type MediatorSidebarProps = {
  open: boolean;
  onClose: () => void;
  micEnabled: boolean;
  camEnabled: boolean;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onOpenFullPanel: () => void;
  debaters: MediatorDebaterRow[];
  onToggleDebaterMute: (debaterId: string) => void;
  remoteKickTargets: RemoteKickRow[];
  onEjectParticipant: (sessionId: string) => void;
  /** Coupe le micro côté Daily (participant distant). */
  onForceMuteDaily?: (sessionId: string) => void;
  timerActive: boolean;
  onAdjustTime: (deltaSec: number) => void;
};

/**
 * Commande médiateur — Frosted Titanium, accents Ember, JetBrains Mono (variables layout).
 * Visible uniquement côté médiateur (isHost géré par le parent).
 */
export function MediatorSidebar({
  open,
  onClose,
  micEnabled,
  camEnabled,
  onToggleMic,
  onToggleCam,
  onOpenFullPanel,
  debaters,
  onToggleDebaterMute,
  remoteKickTargets,
  onEjectParticipant,
  onForceMuteDaily,
  timerActive,
  onAdjustTime,
}: MediatorSidebarProps) {
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
            <div className="flex shrink-0 items-center justify-between border-b border-white/[0.07] px-3 py-2.5">
              <span className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ember-400">
                Commande
              </span>
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/10 bg-black/40 text-white/80 hover:bg-white/10"
                aria-label="Fermer"
              >
                <PanelRightClose className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-3 hide-scrollbar">
              <section>
                <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white/45">
                  Local — micro / cam
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onToggleMic}
                    aria-label={micEnabled ? 'Couper le microphone' : 'Activer le microphone'}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-[2px] border px-2 py-2.5 font-mono text-[11px] font-bold transition-colors ${
                      micEnabled
                        ? 'border-white/12 bg-white/5 text-white'
                        : 'border-ember-500/40 bg-ember-500/15 text-ember-200'
                    }`}
                  >
                    {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    {micEnabled ? 'Micro' : 'Couper'}
                  </button>
                  <button
                    type="button"
                    onClick={onToggleCam}
                    aria-label={camEnabled ? 'Couper la caméra' : 'Activer la caméra'}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-[2px] border px-2 py-2.5 font-mono text-[11px] font-bold transition-colors ${
                      camEnabled
                        ? 'border-white/12 bg-white/5 text-white'
                        : 'border-ember-500/40 bg-ember-500/15 text-ember-200'
                    }`}
                  >
                    {camEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    {camEnabled ? 'Cam' : 'Off'}
                  </button>
                </div>
              </section>

              <section>
                <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white/45">
                  Chrono
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!timerActive}
                    onClick={() => onAdjustTime(-30)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-[2px] border border-cobalt-500/35 bg-cobalt-500/10 py-2 font-mono text-xs font-bold text-cobalt-200 transition-colors hover:bg-cobalt-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Clock className="h-3.5 w-3.5" /> −30s
                  </button>
                  <button
                    type="button"
                    disabled={!timerActive}
                    onClick={() => onAdjustTime(30)}
                    className="flex flex-1 items-center justify-center gap-1 rounded-[2px] border border-ember-500/35 bg-ember-500/10 py-2 font-mono text-xs font-bold text-ember-100 transition-colors hover:bg-ember-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                  >
                    <Clock className="h-3.5 w-3.5" /> +30s
                  </button>
                </div>
              </section>

              {debaters.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white/45">
                    Challengers — mute (signal)
                  </h3>
                  <ul className="space-y-1.5">
                    {debaters.map((d) => (
                      <li
                        key={d.id}
                        className="flex items-center justify-between gap-2 rounded-[2px] border border-white/[0.06] bg-black/30 px-2 py-1.5"
                      >
                        <span className="min-w-0 truncate font-mono text-[11px] font-semibold text-white/90">
                          {d.name}
                        </span>
                        <button
                          type="button"
                          onClick={() => onToggleDebaterMute(d.id)}
                          className={`flex shrink-0 items-center gap-1 rounded-[2px] px-2 py-1 font-mono text-[10px] font-bold ${
                            d.isMuted
                              ? 'bg-cobalt-500/20 text-cobalt-200'
                              : 'bg-white/10 text-white/85'
                          }`}
                        >
                          {d.isMuted ? <VolumeX className="h-3 w-3" /> : <Volume2 className="h-3 w-3" />}
                          {d.isMuted ? 'Réactiver' : 'Mute'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {remoteKickTargets.length > 0 && (
                <section>
                  <h3 className="mb-2 font-mono text-[10px] font-bold uppercase tracking-widest text-white/45">
                    Flux vidéo — expulsion
                  </h3>
                  <ul className="space-y-1.5">
                    {remoteKickTargets.map((t) => (
                      <li
                        key={t.sessionId}
                        className="flex items-center justify-between gap-2 rounded-[2px] border border-white/[0.06] bg-black/30 px-2 py-1.5"
                      >
                        <span className="min-w-0 truncate font-mono text-[11px] text-white/85">{t.label}</span>
                        <div className="flex shrink-0 gap-1">
                          {onForceMuteDaily && (
                            <button
                              type="button"
                              title="Mute micro (Daily)"
                              onClick={() => onForceMuteDaily(t.sessionId)}
                              className="rounded-[2px] border border-cobalt-500/35 bg-cobalt-500/10 p-1.5 text-cobalt-100 hover:bg-cobalt-500/20"
                            >
                              <MicOff className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onEjectParticipant(t.sessionId)}
                            className="flex items-center gap-1 rounded-[2px] border border-ember-500/40 bg-ember-500/15 px-2 py-1 font-mono text-[9px] font-bold text-ember-100 hover:bg-ember-500/25"
                          >
                            <UserX className="h-3.5 w-3.5" />
                            Kick
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <button
                type="button"
                onClick={() => {
                  onOpenFullPanel();
                  onClose();
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[2px] border border-cobalt-500/35 bg-cobalt-500/10 py-2.5 font-mono text-xs font-bold text-cobalt-100 transition-colors hover:bg-cobalt-500/20"
              >
                <Sliders className="h-4 w-4" />
                Panneau complet
              </button>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
