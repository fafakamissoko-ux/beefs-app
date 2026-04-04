import { POINT_PACKS } from '@/lib/stripe/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUserId(userId: string | undefined): userId is string {
  return typeof userId === 'string' && UUID_RE.test(userId.trim());
}

/** Vérifie que pack + points correspondent au catalogue serveur (anti-tampering metadata). */
export function validatePointPackFromMetadata(
  packId: string | undefined,
  pointsAmountRaw: string | undefined,
): { ok: true; points: number; packId: string } | { ok: false; reason: string } {
  if (!packId || typeof packId !== 'string') {
    return { ok: false, reason: 'pack_id manquant' };
  }
  const pack = POINT_PACKS.find((p) => p.id === packId.trim());
  if (!pack) {
    return { ok: false, reason: 'pack_id inconnu' };
  }
  const parsed = parseInt(pointsAmountRaw || '0', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { ok: false, reason: 'points_amount invalide' };
  }
  if (parsed !== pack.points) {
    return { ok: false, reason: 'points_amount ne correspond pas au pack' };
  }
  return { ok: true, points: parsed, packId: pack.id };
}
