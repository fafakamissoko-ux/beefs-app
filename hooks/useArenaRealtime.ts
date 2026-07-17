'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import {
  type ArenaSupportSlotId,
  type AuraBatchPayload,
  type ChallengerSlotId,
  createZeroAuraBatch,
  isArenaSupportSlotId,
  parseAuraBatchPayload,
  hasAnyAuraBatchDelta,
} from '@/lib/arena-slots';

export type { AuraBatchPayload, ArenaSupportSlotId, ChallengerSlotId } from '@/lib/arena-slots';
export { CHALLENGER_SLOT_IDS, ARENA_CHALLENGER_SLOT_COUNT } from '@/lib/arena-slots';

/** ───────────────── Types identité & payloads broadcast ───────────────── */

export type ArenaRealtimeUserRole = 'mediator' | 'challenger' | 'viewer' | 'spectator';

export type ArenaRealtimeParams = {
  roomId: string;
  userId: string;
  userName: string;
  userRole: ArenaRealtimeUserRole;
  isHost: boolean;
};

export type GlobalTimerBroadcastPayload = {
  active: boolean;
  paused: boolean;
  remainingSec: number;
  endsAtMs: number | null;
};

export type SpeakingTurnBroadcastPayload =
  | {
      action: 'start';
      debaterId: string;
      duration?: number;
      slot?: ChallengerSlotId;
      speakerName?: string;
    }
  | { action: 'pause' }
  | { action: 'resume' }
  | { action: 'stop' };

export type StructuredDebateBroadcastPayload =
  | { enabled: false }
  | { enabled: true; budgetSeconds?: number };

export type BeefVerdictBroadcastKind = 'resolved' | 'closed' | 'rematch';

export type BeefEndedBroadcastPayload = {
  summary?: Record<string, unknown>;
  reason?: string;
};

export type ArenaBigGiftBroadcastPayload = Record<string, unknown>;

/**
 * Callbacks temps réel : mis à jour **à chaque rendu** via `callbacksRef`,
 * sans re-mounter les canaux réseau.
 */
export interface ArenaRealtimeCallbacks {
  /** Boost tiers / points utilisé pour agréger l’aura côté client sur réactions distantes (défaut 1). */
  getAuraBoost?: () => number;

  /** Bruitages arène depuis un broadcast distant. */
  onSfxPlayed?: (soundId: string) => void;

  /**
   * Réaction emoji reçue (broadcast ou polling DB).
   * `supportSlot` est absent lors du fallback polling (`beef_reactions` sans colonne équivalente).
   */
  onReactionReceived?: (emoji: string, supportSlot?: ArenaSupportSlotId, source?: 'broadcast' | 'poll') => void;

  /** Incrémentation d’aura / chaleur distante après une réaction broadcast (boost déjà résolu via `getAuraBoost`). */
  onReactionAurasFromBroadcast?: (
    summary: AuraBatchPayload & { globalHeatDelta?: number },
  ) => void;

  onAuraBatchDeltas?: (deltas: AuraBatchPayload) => void;
  onAuraMasterSync?: (snapshot: AuraBatchPayload) => void;

  onMessageReceived?: (
    userName: string,
    content: string,
    initialLetter: string | undefined,
    messageId: string,
    source: 'broadcast' | 'poll',
    type?: 'text' | 'gift',
  ) => void;

  onMessageDeleted?: (messageId: string) => void;

  onArenaBigGift?: (payload: ArenaBigGiftBroadcastPayload) => void;

  /**
   * `pulse_voice` distant : deltas de « voix » A/B ; le consumer applique aussi l’élévation de
   * chaleur globale attendue (~+2) comme dans `TikTokStyleArena`.
   */
  onPulseVoice?: (dA: number, dB: number) => void;

  /** Bandeau : `text` vide / null = clear. Durée ignorée pour le clear. */
  onAnnouncementBanner?: (payload: { text: string | null | undefined; durationSec?: number | undefined }) => void;

  onGlobalTimerSync?: (payload: GlobalTimerBroadcastPayload) => void;

  onSpeakingTurn?: (payload: SpeakingTurnBroadcastPayload) => void;

  onMediatorFloor?: (active: boolean) => void;

  /** Toast « médiateur » pour les non-médiateurs. */
  onMediationToss?: (firstName: string) => void;

  onStructuredDebate?: (payload: StructuredDebateBroadcastPayload) => void;

  onMediatorMuteChallenger?: (payload: { targetUserId: string; muted: boolean }) => void;

  onBeefVerdict?: (payload: { verdict: BeefVerdictBroadcastKind }) => void;

  onBeefEnded?: (payload: BeefEndedBroadcastPayload | undefined) => void;

  /** Après souscription réussie au canal `live_*` (Drain buffer aura puis outbox côté arène si besoin). */
  onLiveBroadcastSubscribed?: () => void;

  /** Invite spectateur → ligne `beef_participants` acceptée pour l’utilisateur courant (UPDATE Realtime). */
  onSpectatorSelfInviteAccepted?: () => void;

  /** Mutation `beef_participants` pour ce beef (Postgres Changes). Le parent filtre médiateur / refetch invités. */
  onBeefParticipantsTableChanged?: () => void;
}

const BROADCAST_OUTBOX_CAP = 48;

function asRecord(payload: unknown): Record<string, unknown> | null {
  if (payload === null || payload === undefined) return null;
  if (typeof payload === 'object' && !Array.isArray(payload)) return payload as Record<string, unknown>;
  return null;
}

function capAura(n: unknown): number {
  return Math.min(300, Math.max(0, Math.floor(Number(n) || 0)));
}

export interface UseArenaRealtimeResult {
  liveConnected: boolean;
  safeBroadcast: (event: string, payload?: Record<string, unknown>) => void;
  broadcastSfx: (id: string) => void;
  broadcastReaction: (emoji: string, supportSlot?: ArenaSupportSlotId) => void;
  broadcastAuraBatch: (payload: AuraBatchPayload) => void;
  broadcastAuraMasterSync: (snapshot: AuraBatchPayload) => void;
  broadcastMessage: (args: {
    user_name: string;
    content: string;
    initial?: string | null;
    id: string;
    type?: 'text' | 'gift';
  }) => void;
  broadcastDeleteMessage: (messageId: string) => void;
  broadcastArenaBigGift: (payload: ArenaBigGiftBroadcastPayload) => void;
  broadcastPulseVoice: (dA: number, dB: number) => void;
  broadcastAnnouncementBanner: (text: string, durationSec?: number) => void;
  broadcastBeefGlobalTimer: (payload: GlobalTimerBroadcastPayload) => void;
  broadcastSpeakingTurn: (payload: SpeakingTurnBroadcastPayload) => void;
  broadcastMediatorFloor: (active: boolean) => void;
  broadcastMediationToss: (firstSpeakerId: string, firstName: string) => void;
  broadcastStructuredDebate: (payload: StructuredDebateBroadcastPayload) => void;
  broadcastMediatorMuteChallenger: (targetUserId: string, muted: boolean) => void;
  broadcastBeefVerdict: (verdict: BeefVerdictBroadcastKind) => void;
  broadcastBeefEnded: (payload: BeefEndedBroadcastPayload & { summary?: Record<string, unknown> }) => void;
}

/**
 * Phase Phénix — moteur réseau isolé (`live_*` broadcast + Postgres Changes + polling secours DB).
 *
 * Contrat churn : **`callbacks`** est reflété dans **`callbacksRef` à chaque rendu**.
 * Le canal **`live_*`** ne dépend que **`roomId`** (et **`flushBroadcastOutbox` stable**).
 * **`spectator_invite_*`** : deps **`[roomId, userId]`** ; le filtre viewer/spectateur lit **`identityRef.current.userRole`**.
 * **`beef_participants_live_*`** : **`[roomId]`** uniquement.
 * **`live_*` broadcast** : **`[roomId, flushBroadcastOutbox]`** — souscription après debounce (~150 ms Strict Mode),
 * reconnexion silencieuse ~3 s après `CLOSED` / `CHANNEL_ERROR` / `TIMED_OUT`.
 * Le polling secours utilise **`[roomId, userId]`**.
 */
export function useArenaRealtime(
  params: ArenaRealtimeParams,
  callbacks: ArenaRealtimeCallbacks,
): UseArenaRealtimeResult {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const identityRef = useRef(params);
  identityRef.current = params;

  const { roomId, userId } = params;

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /** File d’attente tant que non SUBSCRIBED. */
  const broadcastOutboxRef = useRef<Array<{ event: string; payload: Record<string, unknown> }>>([]);

  const [liveConnected, setLiveConnected] = useState(false);

  const flushBroadcastOutbox = useCallback(() => {
    const ch = channelRef.current;
    if (!ch || broadcastOutboxRef.current.length === 0) return;
    const items = broadcastOutboxRef.current;
    broadcastOutboxRef.current = [];
    for (const { event, payload } of items) {
      void ch.send({ type: 'broadcast', event, payload }).catch((err: unknown) => {
        console.warn(`[Live] Broadcast flush failed: ${event}`, err);
      });
    }
  }, []);

  const safeBroadcast = useCallback((event: string, payload: Record<string, unknown> = {}) => {
    const ch = channelRef.current;
    if (ch) {
      console.log(`[TRACER - ⬆️ ENVOI] [${event}] prêt à partir. Payload:`, payload);
      ch.send({ type: 'broadcast', event, payload })
        .then((status) => {
          console.log(`[TRACER - 📡 REPONSE SERVEUR] [${event}] -> Statut:`, status);
          if (status !== 'ok') {
            console.error(
              `[Live] BROADCAST REJETÉ par le serveur pour l'événement ${event}. Statut: ${status}`,
            );
          }
        })
        .catch((err: unknown) => {
          console.error(`[Live] Erreur réseau inattendue sur ${event}:`, err);
        });
      return;
    }
    console.warn(`[TRACER - ⏳ HORS LIGNE] Canal non connecté. Mise en attente de [${event}]...`);
    if (event === 'announcement_banner') {
      broadcastOutboxRef.current = broadcastOutboxRef.current.filter((x) => x.event !== 'announcement_banner');
    }
    broadcastOutboxRef.current.push({ event, payload });
    while (broadcastOutboxRef.current.length > BROADCAST_OUTBOX_CAP) {
      broadcastOutboxRef.current.shift();
    }
  }, []);

  const broadcastSfx = useCallback((id: string) => safeBroadcast('sfx', { id }), [safeBroadcast]);

  const broadcastReaction = useCallback(
    (emoji: string, supportSlot?: ArenaSupportSlotId) => {
      const p: Record<string, unknown> = { emoji };
      if (supportSlot !== undefined) p.supportSlot = supportSlot;
      safeBroadcast('reaction', p);
    },
    [safeBroadcast],
  );

  const broadcastAuraBatch = useCallback(
    (payload: AuraBatchPayload) => safeBroadcast('aura_batch', { ...payload }),
    [safeBroadcast],
  );

  const broadcastAuraMasterSync = useCallback(
    (snapshot: AuraBatchPayload) => safeBroadcast('aura_master_sync', { ...snapshot }),
    [safeBroadcast],
  );

  const broadcastMessage = useCallback(
    (args: { user_name: string; content: string; initial?: string | null; id: string; type?: 'text' | 'gift' }) => {
      safeBroadcast('message', {
        user_name: args.user_name,
        content: args.content,
        initial: args.initial ?? undefined,
        id: args.id,
        type: args.type,
      });
    },
    [safeBroadcast],
  );

  const broadcastDeleteMessage = useCallback(
    (messageId: string) => safeBroadcast('delete_message', { messageId }),
    [safeBroadcast],
  );

  const broadcastArenaBigGift = useCallback(
    (giftPayload: ArenaBigGiftBroadcastPayload) => safeBroadcast('arena_big_gift', giftPayload),
    [safeBroadcast],
  );

  const broadcastPulseVoice = useCallback(
    (dA: number, dB: number) => safeBroadcast('pulse_voice', { dA, dB }),
    [safeBroadcast],
  );

  const broadcastAnnouncementBanner = useCallback(
    (text: string, durationSec?: number) => {
      safeBroadcast('announcement_banner', { text, durationSec: durationSec ?? 0 });
    },
    [safeBroadcast],
  );

  const broadcastBeefGlobalTimer = useCallback(
    (payload: GlobalTimerBroadcastPayload) => safeBroadcast('beef_global_timer', { ...payload }),
    [safeBroadcast],
  );

  const broadcastSpeakingTurn = useCallback(
    (p: SpeakingTurnBroadcastPayload) => safeBroadcast('speaking_turn', p as unknown as Record<string, unknown>),
    [safeBroadcast],
  );

  const broadcastMediatorFloor = useCallback((active: boolean) => safeBroadcast('mediator_floor', { active }), [safeBroadcast]);

  const broadcastMediationToss = useCallback(
    (firstSpeakerId: string, firstName: string) =>
      safeBroadcast('mediation_toss', { firstSpeakerId, firstName }),
    [safeBroadcast],
  );

  const broadcastStructuredDebate = useCallback(
    (p: StructuredDebateBroadcastPayload) =>
      safeBroadcast('structured_debate', p as unknown as Record<string, unknown>),
    [safeBroadcast],
  );

  const broadcastMediatorMuteChallenger = useCallback(
    (targetUserId: string, muted: boolean) => safeBroadcast('mediator_mute_challenger', { targetUserId, muted }),
    [safeBroadcast],
  );

  const broadcastBeefVerdict = useCallback(
    (verdict: BeefVerdictBroadcastKind) => safeBroadcast('beef_verdict', { verdict }),
    [safeBroadcast],
  );

  const broadcastBeefEnded = useCallback(
    (p: BeefEndedBroadcastPayload & { summary?: Record<string, unknown> }) => safeBroadcast('beef_ended', { ...p }),
    [safeBroadcast],
  );

  /** Reset file d’attente broadcast quand le beef change. */
  useEffect(() => {
    broadcastOutboxRef.current = [];
  }, [roomId]);

  /** Canal spectateur invitation (purifié) */
  useEffect(() => {
    if (!roomId || !userId) return undefined;
    const currentRole = identityRef.current.userRole;
    if (currentRole !== 'viewer' && currentRole !== 'spectator') return undefined;

    let ch: ReturnType<typeof supabase.channel> | null = null;

    const initTimer = window.setTimeout(() => {
      const topic = `spectator_invite_sync_${roomId}_${userId}`;
      ch = supabase
        .channel(topic)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'beef_participants', filter: `beef_id=eq.${roomId}` },
          (payload: { new: Record<string, unknown>; old?: Record<string, unknown> }) => {
            const newRow = payload.new;
            const oldRow = payload.old;
            const rawUid = newRow.user_id;
            const rowUserStr = typeof rawUid === 'string' ? rawUid : rawUid != null ? String(rawUid) : '';
            if (rowUserStr !== String(userId)) return;

            if (newRow.invite_status === 'accepted' && oldRow?.invite_status !== 'accepted') {
              callbacksRef.current.onSpectatorSelfInviteAccepted?.();
            }
          },
        )
        .subscribe((status) => {
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            console.warn('[Live] spectator_invite_sync canal indisponible');
          }
        });
    }, 150);

    return () => {
      window.clearTimeout(initTimer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [roomId, userId]);
  useEffect(() => {
    if (!roomId) return undefined;

    let ch: ReturnType<typeof supabase.channel> | null = null;

    const initTimer = window.setTimeout(() => {
      ch = supabase
        .channel(`beef_participants_live_${roomId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'beef_participants',
            filter: `beef_id=eq.${roomId}`,
          },
          () => {
            callbacksRef.current.onBeefParticipantsTableChanged?.();
          },
        )
        .subscribe();
    }, 150);

    return () => {
      window.clearTimeout(initTimer);
      if (ch) void supabase.removeChannel(ch);
    };
  }, [roomId]);

  /** ── Canal broadcast `live_${roomId}` (Purifié) ── */
  useEffect(() => {
    if (!roomId) {
      channelRef.current = null;
      setLiveConnected(false);
      return undefined;
    }

    let ch: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    let reconnectTimer: number | null = null;

    const connectChannel = () => {
      if (cancelled) return;
      if (ch) {
        void supabase.removeChannel(ch);
        ch = null;
      }

      ch = supabase.channel(`live_${roomId}`, {
        config: { broadcast: { self: false } },
      });

      ch
        .on('broadcast', { event: 'sfx' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const id = o?.id;
          if (typeof id === 'string' && id) callbacksRef.current.onSfxPlayed?.(id);
        })
        .on('broadcast', { event: 'reaction' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (!o || typeof o.emoji !== 'string') return;
          const slotRaw = o.supportSlot;
          const slot =
            typeof slotRaw === 'string' && isArenaSupportSlotId(slotRaw) ? slotRaw : undefined;
          const boost = callbacksRef.current.getAuraBoost?.() ?? 1;
          callbacksRef.current.onReactionReceived?.(o.emoji, slot, 'broadcast');
          if (slot !== undefined) {
            const d = createZeroAuraBatch();
            d[slot === 'M' ? 'M' : slot] = boost;
            callbacksRef.current.onReactionAurasFromBroadcast?.({
              ...d,
              globalHeatDelta: 3,
            });
          }
        })
        .on('broadcast', { event: 'aura_batch' }, ({ payload }: { payload?: unknown }) => {
          console.log('[TRACER - ⬇️ REÇU] Événement [aura_batch]', payload);
          const o = asRecord(payload);
          if (!o) return;
          const deltas = parseAuraBatchPayload(o);
          if (!hasAnyAuraBatchDelta(deltas)) return;
          callbacksRef.current.onAuraBatchDeltas?.(deltas);
        })
        .on('broadcast', { event: 'aura_master_sync' }, ({ payload }: { payload?: unknown }) => {
          if (identityRef.current.isHost) return;
          const o = asRecord(payload);
          if (!o) return;
          callbacksRef.current.onAuraMasterSync?.(parseAuraBatchPayload(o));
        })
        .on('broadcast', { event: 'message' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (
            !o ||
            typeof o.user_name !== 'string' ||
            typeof o.content !== 'string' ||
            typeof o.id !== 'string'
          ) {
            return;
          }
          const ini = typeof o.initial === 'string' ? o.initial : undefined;
          const msgType = o.type === 'gift' ? 'gift' : 'text';
          callbacksRef.current.onMessageReceived?.(o.user_name, o.content, ini, o.id, 'broadcast', msgType);
        })
        .on('broadcast', { event: 'delete_message' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const mid = o?.messageId;
          const idStr = typeof mid === 'string' ? mid : mid != null ? String(mid) : '';
          if (idStr) callbacksRef.current.onMessageDeleted?.(idStr);
        })
        .on('broadcast', { event: 'arena_big_gift' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (!o) return;
          callbacksRef.current.onArenaBigGift?.(o);

          const cost = Number(o.cost) || 0;
          if (cost > 0) {
            const medBoost = Math.min(25, 4 + Math.floor(cost / 40));
            const d = createZeroAuraBatch();
            d.M = medBoost;
            callbacksRef.current.onReactionAurasFromBroadcast?.({
              ...d,
              globalHeatDelta: Math.min(100, 20),
            });
          }
        })
        .on('broadcast', { event: 'pulse_voice' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const dA = Math.max(0, Math.floor(Number(o?.dA) || 0));
          const dB = Math.max(0, Math.floor(Number(o?.dB) || 0));
          if (dA || dB) callbacksRef.current.onPulseVoice?.(dA, dB);
        })
        .on('broadcast', { event: 'announcement_banner' }, ({ payload }: { payload?: unknown }) => {
          console.log('[TRACER - ⬇️ REÇU] Événement [announcement_banner]', payload);
          if (identityRef.current.isHost) return;
          const o = asRecord(payload);
          if (!o) return;
          const rawText =
            typeof o.text === 'string' ? o.text : o.text === null || o.text === undefined ? '' : String(o.text);
          const trimmed = rawText.trim();
          callbacksRef.current.onAnnouncementBanner?.({
            text: trimmed.length > 0 ? trimmed : null,
            durationSec: typeof o.durationSec === 'number' ? o.durationSec : undefined,
          });
        })
        .on('broadcast', { event: 'beef_global_timer' }, ({ payload }: { payload?: unknown }) => {
          if (identityRef.current.isHost) return;
          const o = asRecord(payload);
          if (!o) return;
          const rawEnd = o.endsAtMs;
          const endsAtMs =
            rawEnd != null && Number.isFinite(Number(rawEnd)) ? Number(rawEnd) : null;
          callbacksRef.current.onGlobalTimerSync?.({
            active: !!o.active,
            paused: !!o.paused,
            remainingSec: Math.max(0, Math.floor(Number(o.remainingSec) || 0)),
            endsAtMs,
          });
        })
        .on('broadcast', { event: 'speaking_turn' }, ({ payload }: { payload?: unknown }) => {
          if (identityRef.current.isHost) return;
          const o = asRecord(payload);
          if (!o) return;
          const action = o.action;
          if (action === 'start') {
            callbacksRef.current.onSpeakingTurn?.({
              action: 'start',
              debaterId: typeof o.debaterId === 'string' ? o.debaterId : String(o.debaterId ?? ''),
              duration:
                typeof o.duration === 'number' ? Math.max(0, Math.floor(o.duration)) : undefined,
              slot: o.slot === 'A' || o.slot === 'B' || o.slot === 'C' || o.slot === 'D' ? o.slot : undefined,
              speakerName: typeof o.speakerName === 'string' ? o.speakerName : undefined,
            });
            return;
          }
          if (action === 'pause') {
            callbacksRef.current.onSpeakingTurn?.({ action: 'pause' });
            return;
          }
          if (action === 'resume') {
            callbacksRef.current.onSpeakingTurn?.({ action: 'resume' });
            return;
          }
          if (action === 'stop') {
            callbacksRef.current.onSpeakingTurn?.({ action: 'stop' });
          }
        })
        .on('broadcast', { event: 'mediator_floor' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (typeof o?.active === 'boolean') callbacksRef.current.onMediatorFloor?.(o.active);
        })
        .on('broadcast', { event: 'mediation_toss' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (typeof o?.firstName === 'string' && identityRef.current.userRole !== 'mediator') {
            callbacksRef.current.onMediationToss?.(o.firstName);
          }
        })
        .on('broadcast', { event: 'structured_debate' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          if (!o) return;
          const en = o.enabled;
          if (en === false) {
            callbacksRef.current.onStructuredDebate?.({ enabled: false });
            return;
          }
          if (en === true) {
            callbacksRef.current.onStructuredDebate?.({
              enabled: true,
              budgetSeconds: typeof o.budgetSeconds === 'number' ? o.budgetSeconds : undefined,
            });
          }
        })
        .on('broadcast', { event: 'mediator_mute_challenger' }, ({ payload }: { payload?: unknown }) => {
          const { userRole: ur, userId: uidSelf } = identityRef.current;
          if (ur !== 'challenger') return;
          const o = asRecord(payload);
          const tgt = typeof o?.targetUserId === 'string' ? o.targetUserId : String(o?.targetUserId ?? '');
          if (!tgt || tgt !== uidSelf) return;
          callbacksRef.current.onMediatorMuteChallenger?.({ targetUserId: tgt, muted: !!o?.muted });
        })
        .on('broadcast', { event: 'beef_verdict' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const vRaw = typeof o?.verdict === 'string' ? o.verdict : undefined;
          let v: BeefVerdictBroadcastKind | null = null;
          if (vRaw === 'resolved' || vRaw === 'closed' || vRaw === 'rematch') {
            v = vRaw as BeefVerdictBroadcastKind;
          }
          if (!v) return;
          callbacksRef.current.onBeefVerdict?.({ verdict: v });
        })
        .on('broadcast', { event: 'beef_ended' }, ({ payload }: { payload?: unknown }) => {
          const o = asRecord(payload);
          const reason = typeof o?.reason === 'string' ? o.reason : undefined;
          const summaryRaw = o?.summary;
          const summary =
            summaryRaw !== null &&
            summaryRaw !== undefined &&
            typeof summaryRaw === 'object' &&
            !Array.isArray(summaryRaw)
              ? (summaryRaw as Record<string, unknown>)
              : undefined;

          callbacksRef.current.onBeefEnded?.({
            summary,
            reason,
          });
        })
        .subscribe((status: string) => {
          console.log(`[TRACER - 🔌 CANAL live_${roomId}] Changement d'état:`, status);
          if (status === 'SUBSCRIBED') {
            channelRef.current = ch;
            setLiveConnected(true);
            void supabase.auth.getSession().then(({ data: { session } }) => {
              const tok = session?.access_token;
              if (tok) {
                try {
                  supabase.realtime.setAuth(tok);
                } catch {
                  /* ignore */
                }
              }
            });
            queueMicrotask(() => {
              if (!channelRef.current) return;
              callbacksRef.current.onLiveBroadcastSubscribed?.();
              flushBroadcastOutbox();
            });
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            channelRef.current = null;
            setLiveConnected(false);
            // Reconnexion automatique et silencieuse après 3 secondes
            if (reconnectTimer !== null) {
              window.clearTimeout(reconnectTimer);
            }
            reconnectTimer = window.setTimeout(() => {
              reconnectTimer = null;
              if (roomId) connectChannel();
            }, 3000);
          }
        });
    };

    const initTimer = window.setTimeout(connectChannel, 150);

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      window.clearTimeout(initTimer);
      if (ch) {
        void supabase.removeChannel(ch);
      }
    };
  }, [roomId, flushBroadcastOutbox]);

  /** Fallback polling `beef_messages` (8 s). */
  useEffect(() => {
    if (!roomId || !userId) return undefined;

    let lastTs = new Date().toISOString();

    const poll = async () => {
      try {
        const { data } = await supabase
          .from('beef_messages')
          .select('id, username, display_name, content, user_id, created_at')
          .eq('beef_id', roomId)
          .eq('is_deleted', false)
          .gt('created_at', lastTs)
          .order('created_at', { ascending: true })
          .limit(10);

        if (data && data.length > 0) {
          lastTs = data[data.length - 1].created_at;

          data.forEach((msg) => {
            if (String(msg.user_id) === String(userId)) return;

            callbacksRef.current.onMessageReceived?.(
              String(msg.display_name || msg.username || ''),
              String(msg.content ?? ''),
              undefined,
              String(msg.id),
              'poll',
            );
          });
        }
      } catch {
        /* ignore */
      }
    };

    const interval = window.setInterval(poll, 8000);
    return () => window.clearInterval(interval);
  }, [roomId, userId]);

  /** Fallback polling `beef_reactions` (8 s). */
  useEffect(() => {
    if (!roomId || !userId) return undefined;

    let lastReactionTs = new Date().toISOString();

    const pollReactions = async () => {
      try {
        const { data } = await supabase
          .from('beef_reactions')
          .select('id, emoji, user_id, created_at')
          .eq('beef_id', roomId)
          .gt('created_at', lastReactionTs)
          .order('created_at', { ascending: true })
          .limit(20);

        if (data && data.length > 0) {
          lastReactionTs = data[data.length - 1].created_at;

          data.forEach((r) => {
            if (r.user_id === userId) return;
            callbacksRef.current.onReactionReceived?.(r.emoji, undefined, 'poll');
          });
        }
      } catch {
        /* ignore */
      }
    };

    const interval = window.setInterval(pollReactions, 8000);
    return () => window.clearInterval(interval);
  }, [roomId, userId]);

  return {
    liveConnected,
    safeBroadcast,
    broadcastSfx,
    broadcastReaction,
    broadcastAuraBatch,
    broadcastAuraMasterSync,
    broadcastMessage,
    broadcastDeleteMessage,
    broadcastArenaBigGift,
    broadcastPulseVoice,
    broadcastAnnouncementBanner,
    broadcastBeefGlobalTimer,
    broadcastSpeakingTurn,
    broadcastMediatorFloor,
    broadcastMediationToss,
    broadcastStructuredDebate,
    broadcastMediatorMuteChallenger,
    broadcastBeefVerdict,
    broadcastBeefEnded,
  };
}
