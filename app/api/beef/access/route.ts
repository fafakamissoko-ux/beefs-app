import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

/** Vérité serveur : anti-fraude (rechargement / onglet / manipulation client). */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const beefId = new URL(request.url).searchParams.get('beefId');
    if (!beefId) {
      return NextResponse.json({ error: 'beefId requis' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, price, status, started_at, free_preview_minutes')
      .eq('id', beefId)
      .single();

    if (beefErr || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }

    if (beef.mediator_id === user.id) {
      return NextResponse.json({
        role: 'mediator',
        viewerAccess: 'full',
        continuationPrice: beef.price ?? 0,
        freePreviewMinutes: beef.free_preview_minutes ?? 10,
      });
    }

    const { data: part } = await supabaseAdmin
      .from('beef_participants')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .eq('invite_status', 'accepted')
      .maybeSingle();

    if (part) {
      return NextResponse.json({
        role: 'participant',
        viewerAccess: 'full',
        continuationPrice: beef.price ?? 0,
        freePreviewMinutes: beef.free_preview_minutes ?? 10,
      });
    }

    const price = beef.price ?? 0;
    const fpMin = beef.free_preview_minutes ?? 10;

    if (beef.status !== 'live') {
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'not_live',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
      });
    }

    if (price <= 0) {
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'free',
        continuationPrice: 0,
        freePreviewMinutes: fpMin,
      });
    }

    const { data: accessRow } = await supabaseAdmin
      .from('beef_access')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessRow) {
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'paid',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: beef.started_at,
      });
    }

    if (!beef.started_at) {
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'waiting_start',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: null,
      });
    }

    const elapsedSec = Math.max(0, (Date.now() - new Date(beef.started_at).getTime()) / 1000);
    const previewSec = fpMin * 60;

    if (elapsedSec <= previewSec) {
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'preview',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: beef.started_at,
        previewEndsInSeconds: Math.max(0, previewSec - elapsedSec),
      });
    }

    return NextResponse.json({
      role: 'spectator',
      viewerAccess: 'locked',
      continuationPrice: price,
      freePreviewMinutes: fpMin,
      startedAt: beef.started_at,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { beefId } = await request.json();
    if (!beefId) {
      return NextResponse.json({ error: 'beefId requis' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, price, status')
      .eq('id', beefId)
      .single();

    if (beefErr || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }

    if (beef.status !== 'live') {
      return NextResponse.json({ error: 'Beef non disponible' }, { status: 400 });
    }

    if (beef.mediator_id === user.id) {
      return NextResponse.json({ error: 'Le médiateur a déjà accès' }, { status: 400 });
    }

    const { data: part } = await supabaseAdmin
      .from('beef_participants')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .eq('invite_status', 'accepted')
      .maybeSingle();

    if (part) {
      return NextResponse.json({ error: 'Les participants ont déjà accès' }, { status: 400 });
    }

    const price = beef.price || 0;
    if (price <= 0) {
      return NextResponse.json({ error: 'Aucun paiement requis pour ce beef' }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from('beef_access')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ success: true, already: true });
    }

    const { data: buyer } = await supabaseAdmin
      .from('users')
      .select('points')
      .eq('id', user.id)
      .single();

    if (!buyer || (buyer.points ?? 0) < price) {
      return NextResponse.json({ error: 'Points insuffisants' }, { status: 400 });
    }

    await supabaseAdmin
      .from('users')
      .update({ points: (buyer.points ?? 0) - price })
      .eq('id', user.id);

    const { data: mediator } = await supabaseAdmin
      .from('users')
      .select('points')
      .eq('id', beef.mediator_id)
      .single();

    if (mediator) {
      await supabaseAdmin
        .from('users')
        .update({ points: (mediator.points ?? 0) + price })
        .eq('id', beef.mediator_id);
    }

    await supabaseAdmin.from('beef_access').insert({
      beef_id: beefId,
      user_id: user.id,
      access_type: 'paid',
      points_spent: price,
    });

    return NextResponse.json({
      success: true,
      newBalance: (buyer.points ?? 0) - price,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
