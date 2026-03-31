import type { SupabaseClient } from '@supabase/supabase-js';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';

/**
 * Crée un beef + participants / invitations (même logique que le feed).
 */
export async function submitNewBeef(
  supabase: SupabaseClient,
  userId: string,
  beefData: {
    title: string;
    description?: string;
    tags?: string[];
    scheduled_at?: string;
    participants?: { user_id: string; role?: string; is_main?: boolean }[];
  }
) {
  const { count } = await supabase
    .from('beefs')
    .select('*', { count: 'exact', head: true })
    .eq('mediator_id', userId)
    .eq('resolution_status', 'resolved');

  const price = continuationPriceFromResolvedCount(count ?? 0);
  const insertData: Record<string, unknown> = {
    title: beefData.title,
    subject: beefData.title,
    description: beefData.description || '',
    mediator_id: userId,
    status: 'pending',
    is_premium: false,
    price,
    tags: beefData.tags || [],
  };

  if (beefData.scheduled_at) {
    insertData.scheduled_at = beefData.scheduled_at;
    insertData.status = 'scheduled';
  }

  const { data: beef, error } = await supabase.from('beefs').insert(insertData).select().single();
  if (error) throw new Error(error.message);

  if (beefData.participants?.length) {
    await supabase.from('beef_participants').insert(
      beefData.participants.map((p) => ({
        beef_id: beef.id,
        user_id: p.user_id,
        role: p.role || 'participant',
        is_main: p.is_main || false,
        invite_status: 'pending',
      }))
    );
    await supabase.from('beef_invitations').insert(
      beefData.participants.map((p) => ({
        beef_id: beef.id,
        inviter_id: userId,
        invitee_id: p.user_id,
        status: 'sent',
      }))
    );
  }

  return beef as { id: string };
}
