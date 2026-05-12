/**
 * Comparaison d’UUID utilisateur (Supabase Auth vs lignes Postgres/JSON).
 * Évite les échecs silencieux `mediator_id === user.id` quand une source est en MAJ/min mélangée.
 */
export function canonicalUserUuid(s: string | null | undefined): string | null {
  if (s == null || typeof s !== 'string') return null;
  const t = s.trim().toLowerCase();
  return t.length === 0 ? null : t;
}

export function userIdsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = canonicalUserUuid(a);
  const nb = canonicalUserUuid(b);
  return na !== null && na === nb;
}
