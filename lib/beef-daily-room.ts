/** Nom de salle Daily dérivé du beef (aligné arène + API). */
export function beefDailyRoomName(beefId: string): string {
  return `beef-${beefId.replace(/-/g, '').slice(0, 32)}`;
}
