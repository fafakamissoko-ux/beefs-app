# Rapport d'audit — Phase K.0 (Refonte Command Deck / sémantique régie)

- **Date :** 2026-07-22
- **Commit ref :** `ad77be7`
- **Contrainte :** zéro modification du dépôt — lecture seule
- **Objectif cible :** réorganiser la régie médiateur par groupes logiques (Télémétrie, Outils, Scène, Coulisses, Clôture), standardiser les boutons, remplacer le vocabulaire punitif (« expulser ») par un vocabulaire de production (« renvoyer dans le public »).

---

## Synthèse — cartographie actuelle vs cible

### Structure JSX actuelle (`MediatorSidebar.tsx`)

| Bloc actuel | Lignes approx. | Contenu | Groupe cible suggéré |
|-------------|----------------|---------|----------------------|
| Header | L.187–217 | Titre « Command Deck », indicateur réseau Live sync | **Télémétrie** |
| Bloc 1 — Urgence | L.220–233 | Silence total (mute all) | **Scène** / Urgence |
| Bloc 2 — Participants | L.235–326 | Ring, mute/hot mic/eject par challenger | **Scène** |
| Bloc 3 — Chronos & parole | L.328–500 | Chrono global, hot mic, tour de parole | **Outils** / Scène |
| Bloc 4 — Production | L.502–663 | Mic/cam Ref, bannière, invités en attente | **Coulisses** |
| Bloc 5 — Verdict | L.665–739 | Proclamer paix / revanche / sceller | **Clôture** |

### Incohérences CSS boutons repérées

| Élément | Classes | Taille |
|---------|---------|--------|
| Silence total | `min-h-[3.5rem] w-full py-4` | grand, pleine largeur |
| Mute challenger ON/OFF | `min-h-[44px] min-w-[5.5rem]` | 44px |
| Hot mic | `min-h-[44px]` | 44px |
| Eject (UserX) | `h-11 w-11` (44px carré) | icône seule |
| Refuser / Accepter invite | `min-h-[44px]` | 44px |
| Verdict buttons | `py-3.5` sans min-h explicite | variable |
| Démarrer chrono LIVE | `py-4 w-full` | grand |

### Vocabulaire punitif repéré

| Fichier | Ligne | Texte actuel |
|---------|-------|--------------|
| `MediatorSidebar.tsx` | L.311–312 | `aria-label="Expulser le participant"`, `title="Expulser"` |
| `TikTokStyleArena.tsx` | L.3574 | `toast('Participant expulsé', 'success')` |
| `TikTokStyleArena.tsx` | L.3577 | `toast('Expulsion impossible.', 'error')` |
| `TikTokStyleArena.tsx` | L.799 | `toast('Vous avez été renvoyé dans les gradins par la régie.', 'error')` |

**Note :** le message challenger L.799 utilise déjà « gradins » (vocabulaire public) ; les toasts médiateur L.3574–3577 et l'UI L.311–312 restent « expuls* ».

---

# 1. Extraction — Régie actuelle (`MediatorSidebar.tsx`)

**Fichier :** `components/MediatorSidebar.tsx`  
**Lignes :** 751 (source intégral)

```tsx
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
                    {/* Bloc 1 — Urgence */}
                    <section className={`${SECTION_SHELL} border-rose-500/25 bg-gradient-to-b from-rose-950/40 to-transparent`}>
                      <p className="mb-3 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-rose-400/90">
                        Contrôle urgence
                      </p>
                      <button
                        type="button"
                        onClick={onMuteAll}
                        className="flex min-h-[3.5rem] w-full items-center justify-center gap-3 rounded-2xl border border-rose-500/50 bg-rose-950/40 px-4 py-4 text-sm font-black uppercase tracking-widest text-rose-400 shadow-[0_4px_16px_rgba(225,29,72,0.3),inset_0_1px_1px_rgba(255,255,255,0.15)] backdrop-blur-md transition hover:bg-rose-900/50 active:scale-[0.98]"
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
                                className="flex flex-col gap-3 rounded-2xl border border-white/[0.05] bg-black/20 p-3 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] sm:flex-row sm:items-center sm:justify-between"
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
                                    className={`flex min-h-[44px] min-w-[5.5rem] items-center justify-center rounded-xl border px-3 font-mono text-[10px] font-black uppercase tracking-wide transition disabled:cursor-not-allowed disabled:opacity-35 ${
                                      muted
                                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 shadow-[0_0_10px_rgba(16,185,129,0.2),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-emerald-500/20'
                                        : 'border-rose-500/40 bg-rose-950/40 text-rose-400 shadow-[0_0_10px_rgba(225,29,72,0.3),inset_0_1px_1px_rgba(255,255,255,0.1)] hover:bg-rose-900/50'
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
                                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 font-mono text-[10px] font-black uppercase tracking-wide text-cyan-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                                  >
                                    <Radio className="h-3.5 w-3.5" />
                                    Hot mic
                                  </button>
                                  <button
                                    type="button"
                                    disabled={!row.sessionId}
                                    onClick={() => void onEjectParticipant(row.sessionId)}
                                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-blue-200/55 transition hover:border-rose-500/40 hover:bg-rose-950/40 hover:text-rose-300 disabled:cursor-not-allowed disabled:opacity-35"
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
                      {/* ... voir fichier source L.334–500 intégral ... */}
                    </section>

                    {/* Bloc 4 — Production — L.502–663 intégral dans le dépôt */}
                    {/* Bloc 5 — Verdict — L.665–739 intégral dans le dépôt */}
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
```

> **Source intégrale :** le fichier disque `components/MediatorSidebar.tsx` contient **751 lignes** sans troncature. Les blocs 3–5 (chrono global, hot mic, bannière, invités, verdict) sont reproduits verbatim dans le dépôt aux lignes 328–739. Ce rapport inclut le header, l'urgence, le ring participants (avec bouton eject L.306–315) et la structure props/imports complète.

**Import inutilisé repéré :** `TimeWheelPicker` (L.19) — importé mais non utilisé dans le JSX actuel.

---

# 2. Extraction — Sémantique notifications / retrait participant (`TikTokStyleArena.tsx`)

## 2.1 `handleAcceptPendingInvite` / `handleRejectPendingInvite`

**Lignes :** 629–656

```tsx
  const handleAcceptPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'ACCEPT_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
      });
      if (!r.ok) return;
      toast('Challenger accepté !', 'success');
      void fetchPendingInvites();
    },
    [roomId, toast, fetchPendingInvites, runBeefManage],
  );

  /** Refus : UPDATE → declined (pas de DELETE RLS médiateur sur beef_participants). */
  const handleRejectPendingInvite = useCallback(
    async (inviteUserId: string) => {
      const r = await runBeefManage({
        action: 'REMOVE_PARTICIPANT',
        beefId: roomId,
        participantId: inviteUserId,
        removeKind: 'decline',
      });
      if (!r.ok) return;
      void fetchPendingInvites();
    },
    [roomId, fetchPendingInvites, runBeefManage],
  );
```

---

## 2.2 `onEjectParticipant` — expulsion ring (Daily + API purge)

**Lignes :** 3555–3579 (prop passée à `<MediatorSidebar>`)

```tsx
          onEjectParticipant={async (sid) => {
            const ok = await ejectRemoteParticipant(sid);
            if (ok) {
              const target = remoteParticipants.find((p) => p.sessionId === sid);
              if (target?.arenaUserId) {
                await runBeefManage({
                  action: 'REMOVE_PARTICIPANT',
                  removeKind: 'kick',
                  beefId: roomId,
                  participantId: target.arenaUserId,
                });
                setDebaters((prev) => prev.filter((d) => d.id !== target.arenaUserId));
                setParticipantRoles((prev) => {
                  const next = { ...prev };
                  delete next[target.arenaUserId!];
                  return next;
                });
                setParticipantUidOrder((prev) => prev.filter((id) => id !== target.arenaUserId));
              }
              toast('Participant expulsé', 'success');
              void fetchPendingInvites();
            } else {
              toast('Expulsion impossible.', 'error');
            }
          }}
```

**Chaîne technique :**
1. `ejectRemoteParticipant(sid)` — éjection WebRTC Daily
2. `runBeefManage({ action: 'REMOVE_PARTICIPANT', removeKind: 'kick' })` — DELETE `beef_participants` côté API
3. Nettoyage état local (`debaters`, `participantRoles`, `participantUidOrder`)
4. Toasts « Participant expulsé » / « Expulsion impossible. »

---

## 2.3 `removeDebater` — retrait liste locale (legacy UI)

**Lignes :** 2309–2311

```tsx
  const removeDebater = (debaterId: string) => {
    setDebaters(debaters.filter(d => d.id !== debaterId));
  };
```

> Pas de toast associé — mutation UI locale uniquement.

---

## 2.4 Détecteur d'expulsion — `loadParticipants` (polling DB)

**Lignes :** 789–861 (extrait ciblé L.789–804)

```tsx
  const loadParticipants = useCallback(async () => {
    const { data } = await supabase
      .from('beef_participants')
      .select('user_id, role, is_main, invite_status, created_at')
      .eq('beef_id', roomId);

    // --- DÉTECTEUR D'EXPULSION (LIMBO FIX) ---
    if (!isViewer && !isHost && data) {
      const amIStillHere = data.some((p: { user_id: string }) => p.user_id === userId);
      if (!amIStillHere) {
        toast('Vous avez été renvoyé dans les gradins par la régie.', 'error');
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
    }
    // -----------------------------------------

    if (!data?.length) {
      setParticipantRoles({});
      setParticipantUidOrder([]);
      return;
    }
    // ... suite tri + setParticipantRoles ...
  }, [roomId, userId, isViewer, isHost, toast]);

  useEffect(() => {
    void loadParticipants();
  }, [loadParticipants]);
```

**Déclenchement Realtime :** callback `onBeefParticipantsTableChanged` (L.2934–2937) :

```tsx
    onBeefParticipantsTableChanged: () => {
      if (isHost) void fetchPendingInvites();
      void loadParticipants();
    },
```

Branché via `useArenaRealtime` (L.2940–2943) — toute mutation `beef_participants` relance `loadParticipants`, ce qui peut afficher le toast « gradins » au challenger expulsé.

---

## 2.5 Inventaire complet des toasts liés au retrait / expulsion

| Ligne | Message | Contexte |
|-------|---------|----------|
| L.637 | `'Challenger accepté !'` | Accept invitation (success) |
| L.799 | `'Vous avez été renvoyé dans les gradins par la régie.'` | Challenger plus dans `beef_participants` |
| L.3574 | `'Participant expulsé'` | Médiateur — eject OK |
| L.3577 | `'Expulsion impossible.'` | Médiateur — eject Daily échoué |
| L.4070 | `'Convocation déclinée'` | Spectateur refuse convocation Ref (adjacent, pas kick ring) |

---

## 2.6 Actions API `REMOVE_PARTICIPANT` — sémantique serveur (référence)

**Fichier :** `app/api/beef/manage/route.ts` L.182–221

| `removeKind` | Comportement serveur |
|--------------|---------------------|
| `'decline'` (défaut) | UPDATE `invite_status: 'declined'` WHERE `pending` |
| `'purge'` / `'kick'` | DELETE `beef_invitations` + DELETE `beef_participants` |

Le front utilise `'kick'` pour l'eject ring et `'decline'` pour le refus d'invitation en attente.

---

# 3. Fichiers consultés

| Fichier | Rôle |
|---------|------|
| `components/MediatorSidebar.tsx` | UI Command Deck (751 lignes) |
| `components/TikTokStyleArena.tsx` | Handlers régie, eject, loadParticipants, Realtime |
| `app/api/beef/manage/route.ts` | Sémantique REMOVE_PARTICIPANT (référence) |

---

*Fin du rapport Phase K.0 — extraction uniquement, aucune modification applicative.*
