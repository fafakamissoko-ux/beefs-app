import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';

/** Contexte minimal pour autoriser une action sur un beef (arène / token / fact-check). */
export async function userMayActOnBeef(
  supabaseAdmin: SupabaseClient,
  beefId: string,
  userId: string,
): Promise<{ ok: true; beef: { mediator_id: string | null; status: string } } | { ok: false; status: number; error: string }> {
  const id = normalizeBeefId(beefId);
  if (!id) {
    return { ok: false, status: 400, error: 'beefId invalide' };
  }

  const { data: beef, error: beefErr } = await supabaseAdmin
    .from('beefs')
    .select('id, mediator_id, status')
    .eq('id', id)
    .single();

  if (beefErr || !beef) {
    return { ok: false, status: 404, error: 'Beef introuvable' };
  }

  if (beef.status === 'ended' || beef.status === 'cancelled') {
    return { ok: false, status: 403, error: 'Beef non disponible' };
  }

  if (beef.mediator_id === userId) {
    return { ok: true, beef };
  }

  const { data: part } = await supabaseAdmin
    .from('beef_participants')
    .select('id')
    .eq('beef_id', id)
    .eq('user_id', userId)
    .eq('invite_status', 'accepted')
    .maybeSingle();

  if (part) {
    return { ok: true, beef };
  }

  const canSpectate =
    beef.status === 'pending' || beef.status === 'live' || beef.status === 'scheduled' || beef.status === 'replay';

  if (canSpectate) {
    return { ok: true, beef };
  }

  return { ok: false, status: 403, error: 'Accès refusé' };
}
