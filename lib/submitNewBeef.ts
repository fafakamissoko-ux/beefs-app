import type { SupabaseClient } from '@supabase/supabase-js';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import { normalizeScheduledAtForInsert } from '@/lib/beef-schedule';

export type BeefCreationIntent = 'manifesto' | 'mediation';
export type BeefEventType = 'standard' | 'prestige';

/** Payload aligné avec CreateBeefForm → insertion Supabase */
export interface SubmitBeefPayload {
  intent: BeefCreationIntent;
  event_type: BeefEventType;
  title: string;
  description?: string;
  tags?: string[];
  scheduled_at?: string;
  participants?: { user_id: string; role?: string; is_main?: boolean }[];
  teaser_file?: File | null;
}

/**
 * Crée un beef + participants / invitations.
 * — Les lignes `beef_participants` et invitations suivent exactement la liste envoyée par le front
 *   (`invite_status` accepted pour auth.uid(), pending pour les autres).
 */
export async function submitNewBeef(
  supabase: SupabaseClient,
  userId: string,
  beefData: SubmitBeefPayload
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
    mediator_id: beefData.intent === 'mediation' ? userId : null,
    created_by: userId,
    intent: beefData.intent,
    event_type: beefData.event_type,
    status: 'pending',
    is_premium: false,
    price,
    tags: beefData.tags || [],
  };

  const when = normalizeScheduledAtForInsert(beefData.scheduled_at);
  if (when) insertData.scheduled_at = when;

  if (beefData.teaser_file) {
    const fileExt = beefData.teaser_file.name.split('.').pop();
    const fileName = `${userId}_${Date.now()}.${fileExt}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('teasers')
      .upload(fileName, beefData.teaser_file);

    if (!uploadError && uploadData) {
      const { data: publicUrlData } = supabase.storage.from('teasers').getPublicUrl(fileName);
      const isVideo = beefData.teaser_file.type.startsWith('video/');
      if (isVideo) insertData.video_url = publicUrlData.publicUrl;
      else insertData.thumbnail = publicUrlData.publicUrl;
    }
  }

  const { data: beef, error } = await supabase.from('beefs').insert(insertData).select().single();
  if (error) throw new Error(error.message);

  const participantRows = (beefData.participants ?? []).map((p) => ({
    beef_id: beef.id,
    user_id: p.user_id,
    role: p.role || 'participant',
    is_main: Boolean(p.is_main),
    invite_status: p.user_id === userId ? 'accepted' : 'pending',
  }));

  if (participantRows.length > 0) {
    const { error: pErr } = await supabase.from('beef_participants').insert(participantRows);
    if (pErr) throw new Error(pErr.message);

    const invitees = (beefData.participants ?? []).filter((p) => p.user_id !== userId);

    if (invitees.length > 0) {
      const { error: invErr } = await supabase.from('beef_invitations').insert(
        invitees.map((p) => ({
          beef_id: beef.id,
          inviter_id: userId,
          invitee_id: p.user_id,
          status: 'sent',
        }))
      );
      if (invErr) throw new Error(invErr.message);
    }
  }

  return beef as { id: string };
}
