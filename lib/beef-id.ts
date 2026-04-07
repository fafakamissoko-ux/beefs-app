/**
 * Normalise un identifiant beef (UUID) pour les requêtes DB et Daily.
 * Les UUID en base sont souvent en minuscules ; une URL en majuscules peut
 * provoquer des 404 côté API alors que le client trouve la ligne.
 */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeBeefId(raw: string | null | undefined): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (!UUID_RE.test(s)) return null;
  return s;
}
