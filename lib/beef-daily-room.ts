import { normalizeBeefId } from '@/lib/beef-id';

/** Nom de salle Daily dérivé du beef (aligné arène + API). */
export function beefDailyRoomName(beefId: string): string {
  const id = normalizeBeefId(beefId) ?? beefId.trim().toLowerCase();
  return `beef-${id.replace(/-/g, '').slice(0, 32)}`;
}
