import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateUserBalance } from '@/lib/updateUserBalance';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

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

    const body = await request.json();
    const beef_id = body?.beef_id as string | undefined;
    const recipient_id = body?.recipient_id as string | undefined;
    const gift_type_id = body?.gift_type_id as string | undefined;
    const points_amount = Number(body?.points_amount);

    if (!beef_id || !recipient_id || !gift_type_id || !Number.isFinite(points_amount)) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }
    if (points_amount < 1 || points_amount > 500_000) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }
    if (recipient_id === user.id) {
      return NextResponse.json({ error: 'Destinataire invalide' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beef_id)
      .single();

    if (beefErr || !beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }
    if (beef.status !== 'live') {
      return NextResponse.json({ error: 'Les cadeaux ne sont possibles que pendant un direct' }, { status: 400 });
    }
    if (beef.mediator_id !== recipient_id) {
      return NextResponse.json(
        { error: 'Les cadeaux sont envoyés au médiateur de ce beef uniquement' },
        { status: 400 },
      );
    }

    const { data: giftType, error: gtErr } = await supabaseAdmin
      .from('gift_types')
      .select('id, price, is_active')
      .eq('id', gift_type_id)
      .maybeSingle();

    if (gtErr || !giftType || giftType.is_active === false) {
      return NextResponse.json({ error: 'Type de cadeau invalide' }, { status: 400 });
    }
    if (points_amount !== giftType.price) {
      return NextResponse.json({ error: 'Montant incohérent avec le catalogue' }, { status: 400 });
    }

    const { data: sender } = await supabaseAdmin
      .from('users')
      .select('points')
      .eq('id', user.id)
      .single();

    if (!sender || sender.points < points_amount) {
      return NextResponse.json({ error: 'Points insuffisants' }, { status: 400 });
    }

    let senderDebited = false;
    try {
      await updateUserBalance(supabaseAdmin, {
        userId: user.id,
        amount: -points_amount,
        type: 'gift_sent',
        description: `Cadeau envoyé (${gift_type_id})`,
        metadata: { beef_id, recipient_id, gift_type_id },
      });
      senderDebited = true;
      await updateUserBalance(supabaseAdmin, {
        userId: recipient_id,
        amount: points_amount,
        type: 'gift_received',
        description: `Cadeau reçu pendant un direct`,
        metadata: { beef_id, sender_id: user.id, gift_type_id },
      });
    } catch {
      if (senderDebited) {
        try {
          await updateUserBalance(supabaseAdmin, {
            userId: user.id,
            amount: points_amount,
            type: 'refund',
            description: 'Annulation cadeau — erreur crédit destinataire',
            metadata: { beef_id, recipient_id, gift_type_id },
          });
        } catch {}
      }
      return NextResponse.json({ error: 'Erreur lors du transfert de points' }, { status: 500 });
    }

    await supabaseAdmin.from('gifts').insert({
      beef_id,
      sender_id: user.id,
      recipient_id,
      gift_type_id,
      points_amount,
    });

    const { data: senderAfter } = await supabaseAdmin.from('users').select('points').eq('id', user.id).single();

    return NextResponse.json({ success: true, newBalance: senderAfter?.points ?? sender.points - points_amount });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
