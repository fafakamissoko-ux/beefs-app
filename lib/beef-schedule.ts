/**
 * Valeur minimale pour <input type="datetime-local" /> en heure **locale**
 * (évite le décalage UTC de toISOString().slice(0,16) sur mobile).
 */
export function minDateTimeLocalValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Convertit une valeur datetime-local en ISO pour Supabase. */
export function scheduledLocalInputToIso(localValue: string): string | null {
  if (!localValue?.trim()) return null;
  const ms = new Date(localValue).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/** True si la date est strictement après maintenant (buffer anti-course avec l’horloge). */
export function isScheduledTimeValid(iso: string, bufferMs = 90_000): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t > Date.now() + bufferMs;
}

/**
 * À l’insertion : la DB peut interdire le statut `scheduled` (CHECK legacy).
 * On utilise `pending` + `scheduled_at` pour les beefs programmés.
 */
export function normalizeScheduledAtForInsert(raw?: string | null): string | undefined {
  if (!raw?.trim()) return undefined;
  const ms = new Date(raw).getTime();
  if (Number.isNaN(ms)) return undefined;
  const iso = new Date(ms).toISOString();
  if (!isScheduledTimeValid(iso)) return undefined;
  return iso;
}
