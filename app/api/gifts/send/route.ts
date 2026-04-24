import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SendGiftResult = {
  success?: boolean;
  new_balance?: number;
  gift_id?: string;
};

function mapRpcError(message: string): { status: number; body: string } {
  const m = message.toLowerCase();
  if (m.includes('points insuffisants') || m.includes('insuffisant')) {
    return { status: 400, body: 'Points insuffisants' };
  }
  if (m.includes('destinataire invalide')) {
    return { status: 400, body: 'Destinataire invalide' };
  }
  if (m.includes('montant invalide')) {
    return { status: 400, body: 'Montant invalide' };
  }
  if (m.includes('type de cadeau invalide')) {
    return { status: 400, body: 'Type de cadeau invalide' };
  }
  if (m.includes('beef') && m.includes('médiateur')) {
    return { status: 400, body: 'Les cadeaux sont envoyés au médiateur de ce beef uniquement' };
  }
  if (m.includes('direct') || m.includes('live')) {
    return { status: 400, body: 'Les cadeaux ne sont possibles que pendant un direct' };
  }
  return { status: 500, body: 'Erreur lors du transfert de points' };
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
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
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

    const { data, error } = await supabaseAdmin.rpc('send_gift', {
      p_beef_id: beef_id,
      p_sender_id: user.id,
      p_recipient_id: recipient_id,
      p_gift_type_id: gift_type_id,
      p_points_amount: Math.floor(points_amount),
    });

    if (error) {
      const mapped = mapRpcError(error.message || '');
      return NextResponse.json({ error: mapped.body }, { status: mapped.status });
    }

    const row = (data as SendGiftResult) ?? {};
    const newBalance =
      typeof row.new_balance === 'number' ? row.new_balance : undefined;
    if (newBalance == null) {
      return NextResponse.json({ error: 'Réponse serveur inattendue' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      newBalance,
      giftId: row.gift_id ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
