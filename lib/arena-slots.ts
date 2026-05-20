/** Slots challengers arène (Phase 0 — jusqu'à 6 participants). */
export const CHALLENGER_SLOT_IDS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

export type ChallengerSlotId = (typeof CHALLENGER_SLOT_IDS)[number];

export type ArenaSupportSlotId = ChallengerSlotId | 'M';

export const ARENA_CHALLENGER_SLOT_COUNT = CHALLENGER_SLOT_IDS.length;

export const AURA_DISPLAY_CAP = 300;

export type AuraBatchPayload = {
  A: number;
  B: number;
  C: number;
  D: number;
  E: number;
  F: number;
  M: number;
};

export function createZeroAuraBatch(): AuraBatchPayload {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, M: 0 };
}

export function createEmptyChallengerAuras(): Record<ChallengerSlotId, number> {
  return { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0 };
}

export function indexToChallengerSlot(index: number): ChallengerSlotId {
  return CHALLENGER_SLOT_IDS[Math.min(Math.max(0, index), ARENA_CHALLENGER_SLOT_COUNT - 1)] ?? 'F';
}

export function challengerSlotToIndex(slot: ChallengerSlotId): number {
  const i = CHALLENGER_SLOT_IDS.indexOf(slot);
  return i >= 0 ? i : 0;
}

export function isChallengerSlotId(value: string): value is ChallengerSlotId {
  return (CHALLENGER_SLOT_IDS as readonly string[]).includes(value);
}

export function isArenaSupportSlotId(value: string): value is ArenaSupportSlotId {
  return value === 'M' || isChallengerSlotId(value);
}

export function capAuraValue(n: number): number {
  return Math.min(AURA_DISPLAY_CAP, Math.max(0, Math.floor(n)));
}

export function parseAuraBatchPayload(o: Record<string, unknown>): AuraBatchPayload {
  return {
    A: capAuraValue(Number(o.A) || 0),
    B: capAuraValue(Number(o.B) || 0),
    C: capAuraValue(Number(o.C) || 0),
    D: capAuraValue(Number(o.D) || 0),
    E: capAuraValue(Number(o.E) || 0),
    F: capAuraValue(Number(o.F) || 0),
    M: capAuraValue(Number(o.M) || 0),
  };
}

export function hasAnyAuraBatchDelta(batch: AuraBatchPayload): boolean {
  return CHALLENGER_SLOT_IDS.some((id) => batch[id] > 0) || batch.M > 0;
}

export function addAuraBatchToRecord(
  prev: Record<ChallengerSlotId, number>,
  batch: AuraBatchPayload,
): Record<ChallengerSlotId, number> {
  const next = { ...prev };
  for (const id of CHALLENGER_SLOT_IDS) {
    if (batch[id]) next[id] = capAuraValue(prev[id] + batch[id]);
  }
  return next;
}

export function snapshotToChallengerAuras(batch: AuraBatchPayload): Record<ChallengerSlotId, number> {
  return {
    A: capAuraValue(batch.A),
    B: capAuraValue(batch.B),
    C: capAuraValue(batch.C),
    D: capAuraValue(batch.D),
    E: capAuraValue(batch.E),
    F: capAuraValue(batch.F),
  };
}
