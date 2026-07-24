import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';
import { continuationPriceFromResolvedCount } from '@/lib/mediator-pricing';
import { sanitize } from '@/lib/security';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;

  try {
    // Extraction explicite de la chaîne du token
    const token = authHeader.replace('Bearer ', '').trim();

    // Initialisation neutre du client (sans dépendre des headers globaux)
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );

    // Injection directe et stricte du token
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser(token);

    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

function isMediatorOfBeef(
  beef: { mediator_id: string | null; created_by: string | null },
  userId: string,
): boolean {
  if (beef.mediator_id === userId) return true;
  if (beef.mediator_id == null && beef.created_by === userId) return true;
  return false;
}

function resolutionFromEndReason(reason: string): 'resolved' | 'unresolved' | 'abandoned' {
  const resolutionMap: Record<string, 'resolved' | 'unresolved' | 'abandoned'> = {
    'Terminé par le médiateur': 'resolved',
    'Le médiateur a mis fin au beef': 'resolved',
    'Temps écoulé': 'resolved',
    'Temps écoulé (60 min)': 'resolved',
    'Verdict : résolu': 'resolved',
    'Tous les challengers ont quitté': 'unresolved',
    'Clos par le médiateur': 'unresolved',
    'Rematch demandé': 'unresolved',
    'Médiateur déconnecté': 'abandoned',
    'Le médiateur a quitté': 'abandoned',
  };
  return resolutionMap[reason] ?? 'abandoned';
}

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = (await request.json()) as {
      action?: string;
      beefId?: string;
      participantId?: string;
      removeKind?: 'decline' | 'purge' | 'kick';
      toggle?: string;
      endReason?: string;
      mediationSummary?: string;
      summary?: Record<string, unknown>;
    };

    const rawBeefId = typeof body.beefId === 'string' ? body.beefId : '';
    const beefId = normalizeBeefId(rawBeefId.trim());
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide' }, { status: 400 });
    }

    const action = body.action;

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, created_by, status')
      .eq('id', beefId)
      .maybeSingle();

    if (beefErr?.code === 'PGRST116' || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }

    if (action === 'CLAIM_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: user.id })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .is('mediator_id', null)
        .neq('created_by', user.id);
      if (error) return NextResponse.json({ error: 'Candidature impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'APPROVE_MANIFESTO') {
      const { data: manifestoBeef } = await supabaseAdmin
        .from('beefs')
        .select('title, mediator_id')
        .eq('id', beefId)
        .single();

      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ status: 'scheduled' })
        .eq('id', beefId)
        .eq('created_by', user.id)
        .eq('intent', 'manifesto')
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: 'Validation impossible' }, { status: 500 });

      if (manifestoBeef?.mediator_id) {
        const msg = `Tu as été choisi comme médiateur pour l'affaire : ${manifestoBeef.title ?? ''}`;
        await supabaseAdmin.from('notifications').insert({
          user_id: manifestoBeef.mediator_id,
          type: 'system',
          title: 'Candidature validée !',
          body: msg,
          link: `/arena/${beefId}`,
          metadata: { subtype: 'manifesto_approved', related_id: beefId },
        });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'REJECT_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: null })
        .eq('id', beefId)
        .eq('created_by', user.id)
        .eq('intent', 'manifesto')
        .eq('status', 'pending');
      if (error) return NextResponse.json({ error: 'Refus impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (action === 'WITHDRAW_MANIFESTO') {
      const { error } = await supabaseAdmin
        .from('beefs')
        .update({ mediator_id: null, status: 'pending' })
        .eq('id', beefId)
        .eq('intent', 'manifesto')
        .eq('mediator_id', user.id);
      if (error) return NextResponse.json({ error: 'Désistement impossible' }, { status: 500 });
      return NextResponse.json({ success: true });
    }

    if (!isMediatorOfBeef(beef, user.id)) {
      return NextResponse.json({ error: 'Réservé au médiateur de ce beef' }, { status: 403 });
    }

    if (action === 'ACCEPT_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin
        .from('beef_participants')
        .update({
          role: 'participant',
          invite_status: 'accepted',
          responded_at: now,
        })
        .eq('beef_id', beefId)
        .eq('user_id', participantId);
      if (error) {
        return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'REMOVE_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const kind =
        body.removeKind === 'purge' || body.removeKind === 'kick' ? 'purge' : 'decline';
      if (kind === 'purge') {
        const { error: delInv } = await supabaseAdmin
          .from('beef_invitations')
          .delete()
          .eq('beef_id', beefId)
          .eq('invitee_id', participantId);
        if (delInv) {
          /* non bloquant */
        }
        const { error } = await supabaseAdmin
          .from('beef_participants')
          .delete()
          .eq('beef_id', beefId)
          .eq('user_id', participantId);
        if (error) {
          return NextResponse.json({ error: 'Suppression impossible' }, { status: 500 });
        }
      } else {
        const now = new Date().toISOString();
        const { error } = await supabaseAdmin
          .from('beef_participants')
          .update({
            invite_status: 'declined',
            responded_at: now,
          })
          .eq('beef_id', beefId)
          .eq('user_id', participantId)
          .eq('invite_status', 'pending');
        if (error) {
          return NextResponse.json({ error: 'Refus impossible' }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'INVITE_PARTICIPANT') {
      const participantId = typeof body.participantId === 'string' ? body.participantId.trim() : '';
      if (!participantId) {
        return NextResponse.json({ error: 'participantId requis' }, { status: 400 });
      }
      const { error: upErr } = await supabaseAdmin.from('beef_participants').upsert(
        {
          beef_id: beefId,
          user_id: participantId,
          role: 'participant',
          is_main: false,
          invite_status: 'pending',
        },
        { onConflict: 'beef_id,user_id' },
      );
      if (upErr) {
        return NextResponse.json({ error: 'Invitation participant impossible' }, { status: 500 });
      }
      const { data: existingInv } = await supabaseAdmin
        .from('beef_invitations')
        .select('id')
        .eq('beef_id', beefId)
        .eq('invitee_id', participantId)
        .maybeSingle();
      if (!existingInv) {
        const { error: invErr } = await supabaseAdmin.from('beef_invitations').insert({
          beef_id: beefId,
          inviter_id: user.id,
          invitee_id: participantId,
          status: 'sent',
        });
        if (invErr) {
          return NextResponse.json({ error: 'Enregistrement invitation impossible' }, { status: 500 });
        }
      }
      return NextResponse.json({ success: true });
    }

    if (action === 'TOGGLE_STATUS') {
      const toggle = body.toggle;
      if (toggle === 'START_LIVE_SESSION') {
        const mediatorId = beef.mediator_id ?? user.id;
        const { count, error: cErr } = await supabaseAdmin
          .from('beefs')
          .select('*', { count: 'exact', head: true })
          .eq('mediator_id', mediatorId)
          .eq('resolution_status', 'resolved')
          .neq('id', beefId);
        if (cErr) {
          return NextResponse.json({ error: 'Lecture tarif impossible' }, { status: 500 });
        }
        const price = continuationPriceFromResolvedCount(count ?? 0);
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({
            status: 'live',
            started_at: new Date().toISOString(),
            price,
            is_premium: false,
          })
          .eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Démarrage live impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'SYNC_LIVE') {
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({ status: 'live' })
          .eq('id', beefId)
          .in('status', ['pending', 'ready']);
        if (error) {
          return NextResponse.json({ error: 'Sync statut impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'REMATCH_MEDIATION_SUMMARY') {
        const summary = sanitize(
        String(body.mediationSummary || '').trim().slice(0, 500),
      ) || 'Rematch demandé — Round 2 à planifier avec les challengers.';
        const { error } = await supabaseAdmin
          .from('beefs')
          .update({ mediation_summary: summary })
          .eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Mise à jour résumé impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      if (toggle === 'END_BEEF') {
        const reason = sanitize(
          String(body.endReason || '').trim().slice(0, 500),
        ) || 'Terminé par le médiateur';
        const resolution = resolutionFromEndReason(reason);
        const updatePayload: {
          status: 'ended';
          ended_at: string;
          resolution_status: 'resolved' | 'unresolved' | 'abandoned';
          live_summary?: Record<string, unknown>;
        } = {
          status: 'ended',
          ended_at: new Date().toISOString(),
          resolution_status: resolution,
        };
        if (body.summary && typeof body.summary === 'object' && !Array.isArray(body.summary)) {
          updatePayload.live_summary = body.summary;
        }
        const { error } = await supabaseAdmin.from('beefs').update(updatePayload).eq('id', beefId);
        if (error) {
          return NextResponse.json({ error: 'Fin de beef impossible' }, { status: 500 });
        }
        return NextResponse.json({ success: true });
      }

      return NextResponse.json({ error: 'toggle invalide' }, { status: 400 });
    }

    return NextResponse.json({ error: 'action inconnue' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
