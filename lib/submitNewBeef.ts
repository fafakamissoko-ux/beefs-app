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

  // --- VÉRIFICATION BOUCLIER ANTI-SPAM (Mode: Fail-Closed) ---
  const inviteesList = (beefData.participants ?? []).filter((p) => p.user_id !== userId);
  if (inviteesList.length > 0) {
    const inviteeIds = [...new Set(inviteesList.map((i) => i.user_id))];
    const { data: targetUsers, error: targetErr } = await supabase
      .from('users')
      .select('id, display_name, username, invitation_privacy')
      .in('id', inviteeIds);

    if (targetErr) {
      throw new Error("Erreur serveur lors de la vérification de la confidentialité. Opération annulée par sécurité.");
    }

    if (!targetUsers || targetUsers.length !== inviteeIds.length) {
      throw new Error("Impossible de vérifier les paramètres de tous les utilisateurs. Opération annulée.");
    }

    for (const target of targetUsers) {
      const privacy = target.invitation_privacy || 'everyone';
      const targetName = target.display_name || target.username || 'Cet utilisateur';

      if (privacy === 'nobody') {
        throw new Error(`${targetName} n'accepte aucune invitation pour le moment (Mode Ne pas déranger).`);
      }

      if (privacy === 'following') {
        const { data: follows, error: followErr } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', target.id)
          .eq('following_id', userId)
          .maybeSingle();

        if (followErr) {
          throw new Error(`Erreur lors de la vérification des accès pour ${targetName}.`);
        }

        if (!follows) {
          throw new Error(`${targetName} n'accepte les défis que de ses abonnements.`);
        }
      }
    }
  }
  // --- FIN VÉRIFICATION ---

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
      let expiresAt = new Date();
      if (when) {
        expiresAt = new Date(when);
        expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Période de grâce de 10 min
      } else {
        expiresAt.setHours(expiresAt.getHours() + 24);
      }

      const { error: invErr } = await supabase.from('beef_invitations').insert(
        invitees.map((p) => ({
          beef_id: beef.id,
          inviter_id: userId,
          invitee_id: p.user_id,
          status: 'sent',
          expires_at: expiresAt.toISOString(),
        }))
      );
      if (invErr) throw new Error(invErr.message);
    }
  }

  return beef as { id: string };
}
