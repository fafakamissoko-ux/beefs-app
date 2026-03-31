import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    await supabaseAdmin
      .from('users')
      .update({ points: sender.points - points_amount })
      .eq('id', user.id);

    const { data: recipient } = await supabaseAdmin
      .from('users')
      .select('points')
      .eq('id', recipient_id)
      .single();

    if (recipient) {
      await supabaseAdmin
        .from('users')
        .update({ points: (recipient.points || 0) + points_amount })
        .eq('id', recipient_id);
    }

    await supabaseAdmin.from('gifts').insert({
      beef_id,
      sender_id: user.id,
      recipient_id,
      gift_type_id,
      points_amount,
    });

    return NextResponse.json({ success: true, newBalance: sender.points - points_amount });
  } catch (error: any) {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
