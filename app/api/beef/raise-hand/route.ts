import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) return null;
  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  return user;
}

/**
 * Spectateur : demande à rejoindre le ring (beef_participants.pending).
 * Contournement RLS via service role — la policy INSERT client est réservée au médiateur.
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = (await request.json()) as { beefId?: string };
    const beefId = body.beefId ? normalizeBeefId(body.beefId) : null;
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beefId)
      .single();

    if (beefErr?.code === 'PGRST116' || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }
    if (beef.status !== 'live') {
      return NextResponse.json({ error: 'Le beef n’est pas en direct' }, { status: 400 });
    }
    if (beef.mediator_id === user.id) {
      return NextResponse.json({ error: 'Le médiateur n’a pas besoin de lever la main' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('beef_participants')
      .select('invite_status')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing?.invite_status === 'accepted') {
      return NextResponse.json({ error: 'Tu participes déjà à ce beef' }, { status: 400 });
    }

    const { error: upsertErr } = await supabaseAdmin.from('beef_participants').upsert(
      {
        beef_id: beefId,
        user_id: user.id,
        role: 'participant',
        is_main: false,
        invite_status: 'pending',
      },
      { onConflict: 'beef_id,user_id' },
    );

    if (upsertErr) {
      console.error('[raise-hand] upsert', upsertErr);
      return NextResponse.json({ error: 'Impossible d’enregistrer la demande' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[raise-hand]', e);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
