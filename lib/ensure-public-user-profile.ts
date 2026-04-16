import type { User, SupabaseClient } from '@supabase/supabase-js';

const inFlight = new Map<string, Promise<void>>();

function slugUsername(raw: string, userId: string): string {
  let s = raw
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
    .slice(0, 28);
  if (s.length < 3) s = `u_${userId.replace(/-/g, '').slice(0, 12)}`;
  return s;
}

/**
 * Crée une ligne `public.users` si absente (OAuth Google / Apple, etc. ne passent pas par signUp() client).
 */
export async function ensurePublicUserProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const existing = inFlight.get(user.id);
  if (existing) return existing;

  const run = (async () => {
    const { data: row } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
    if (row) return;

    const email = (user.email ?? '').trim();
    if (!email) {
      console.warn('[ensurePublicUserProfile] Identité incomplète — création du profil public reportée');
      return;
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof meta[k] === 'string' ? String(meta[k]).trim() : '');
    let username = str('username') || str('preferred_username') || slugUsername(email.split('@')[0] || '', user.id);
    const display_name =
      str('display_name') || str('full_name') || str('name') || username;

    const { data: available, error: availErr } = await supabase.rpc('check_username_available', {
      p_username: username,
    });
    if (availErr) {
      console.warn('[ensurePublicUserProfile] check_username_available', availErr.message);
    }
    if (available !== true) username = `${username.slice(0, 20)}_${user.id.slice(0, 6)}`;

    const { error } = await supabase.from('users').insert({
      id: user.id,
      email,
      username,
      display_name,
      points: 0,
      is_verified: !!user.email_confirmed_at,
      needs_arena_username: true,
    });

    if (error) {
      const { data: again } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
      if (again) return;
      const fallbackUser = `u_${user.id.replace(/-/g, '').slice(0, 14)}`;
      const { error: e2 } = await supabase.from('users').insert({
        id: user.id,
        email,
        username: fallbackUser,
        display_name,
        points: 0,
        is_verified: !!user.email_confirmed_at,
        needs_arena_username: true,
      });
      if (e2) console.error('[ensurePublicUserProfile] insert échoué');
    }
  })();

  inFlight.set(user.id, run);
  try {
    await run;
  } finally {
    inFlight.delete(user.id);
  }
}
