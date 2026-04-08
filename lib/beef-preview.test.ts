import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  DEFAULT_FREE_PREVIEW_MINUTES,
  previewElapsedSeconds,
  viewerNeedsContinuationPay,
} from '@/lib/beef-preview';

/**
 * Règle métier critique : un spectateur doit-il payer des points pour continuer après la prévisualisation ?
 * Miroir de la logique client utilisée dans TikTokStyleArena (paywall).
 */
describe('previewElapsedSeconds', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('retourne null si le direct na pas encore de startedAt', () => {
    expect(previewElapsedSeconds(null)).toBeNull();
  });

  it('retourne 0 si startedAt est dans le futur (horloge)', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const future = new Date('2026-03-30T13:00:00.000Z').toISOString();
    expect(previewElapsedSeconds(future)).toBe(0);
  });

  it('retourne le nombre de secondes écoulées depuis startedAt', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const started = new Date('2026-03-30T11:40:00.000Z').toISOString();
    expect(previewElapsedSeconds(started)).toBe(20 * 60);
  });
});

describe('viewerNeedsContinuationPay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const price = 25;

  it('retourne false si aucun paiement nest requis (prix 0)', () => {
    expect(
      viewerNeedsContinuationPay('2026-03-30T10:00:00.000Z', 10, 0, false),
    ).toBe(false);
  });

  it('retourne false si le spectateur a déjà payé laccès', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const started = new Date('2026-03-30T10:00:00.000Z').toISOString();
    expect(viewerNeedsContinuationPay(started, 10, price, true)).toBe(false);
  });

  it('retourne false si startedAt est absent (pas encore démarré côté horloge client)', () => {
    expect(viewerNeedsContinuationPay(null, 10, price, false)).toBe(false);
  });

  it('retourne false tant que le temps écoulé est dans la fenêtre gratuite (strictement ≤ minutes offertes)', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const freeMinutes = 10;
    const limitSec = freeMinutes * 60;
    const startedJustWithin = new Date(
      Date.now() - limitSec * 1000,
    ).toISOString();
    expect(
      viewerNeedsContinuationPay(startedJustWithin, freeMinutes, price, false),
    ).toBe(false);
  });

  it('retourne true dès que le temps écoulé dépasse la fenêtre gratuite et quun prix est dû', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const freeMinutes = 10;
    const limitSec = freeMinutes * 60;
    const startedAfterWindow = new Date(
      Date.now() - (limitSec + 1) * 1000,
    ).toISOString();
    expect(
      viewerNeedsContinuationPay(startedAfterWindow, freeMinutes, price, false),
    ).toBe(true);
  });

  it('utilise DEFAULT_FREE_PREVIEW_MINUTES comme durée typique (10 min)', () => {
    vi.setSystemTime(new Date('2026-03-30T12:00:00.000Z'));
    const started = new Date(
      Date.now() - (DEFAULT_FREE_PREVIEW_MINUTES * 60 + 1) * 1000,
    ).toISOString();
    expect(
      viewerNeedsContinuationPay(
        started,
        DEFAULT_FREE_PREVIEW_MINUTES,
        price,
        false,
      ),
    ).toBe(true);
  });
});
