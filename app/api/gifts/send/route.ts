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

    const { beef_id, recipient_id, gift_type_id, points_amount } = await request.json();
    if (!beef_id || !recipient_id || !gift_type_id || !points_amount) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
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
