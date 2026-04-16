import type { SupabaseClient } from '@supabase/supabase-js';

/** Ligne typique pour affichage (sous-ensemble de `user_public_profile`). */
export type UserPublicProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url?: string | null;
  bio?: string | null;
  created_at?: string;
  points?: number | null;
  banner_url?: string | null;
};

const DEFAULT_COLS = 'id, username, display_name, avatar_url';

/**
 * Charge les profils publics par IDs (vue `user_public_profile`, session authentifiée).
 */
export async function fetchUserPublicByIds(
  supabase: SupabaseClient,
  ids: string[],
  columns: string = DEFAULT_COLS,
): Promise<Map<string, UserPublicProfileRow>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, UserPublicProfileRow>();
  if (unique.length === 0) return map;

  const { data, error } = await supabase.from('user_public_profile').select(columns).in('id', unique);

  if (error) {
    console.error('[fetchUserPublicByIds] erreur');
    return map;
  }

  for (const row of data || []) {
    if (!row || typeof row !== 'object' || !('id' in row) || !('username' in row)) continue;
    const r = row as unknown as UserPublicProfileRow;
    if (r.id) map.set(r.id, r);
  }
  return map;
}

export function displayNameFromPublicRow(
  row: UserPublicProfileRow | undefined,
  fallback = '',
): string {
  if (!row) return fallback;
  const dn = row.display_name?.trim();
  if (dn) return dn;
  const un = row.username?.trim();
  if (un) return un;
  return fallback;
}
