/**
 * Mémorise localement qu’un utilisateur a ouvert l’arène d’un beef (navigateur).
 * Sert à n’afficher « Suite · X pts » sur le feed que si le direct a déjà été entamé sur cet appareil.
 */
const KEY = 'beefs_watch_started_v1';

export function markBeefWatchStarted(beefId: string): void {
  if (typeof window === 'undefined' || !beefId) return;
  try {
    const raw = localStorage.getItem(KEY);
    const o: Record<string, number> = raw ? JSON.parse(raw) : {};
    o[beefId] = Date.now();
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function hasBeefWatchStarted(beefId: string): boolean {
  if (typeof window === 'undefined' || !beefId) return false;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const o = JSON.parse(raw) as Record<string, number>;
    return Boolean(o[beefId]);
  } catch {
    return false;
  }
}
