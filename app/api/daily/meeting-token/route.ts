import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { beefDailyRoomName } from '@/lib/beef-daily-room';
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
  const { data: { user } } = await supabaseAuth.auth.getUser();
  return user;
}

const TOKEN_TTL_SEC = 4 * 60 * 60; // 4 h (reconnexion / sessions longues)

/**
 * Émet un meeting token Daily lié à la room et à l’utilisateur authentifié (user_id = Supabase).
 * Salle attendue : private + join avec ce token (voir création room).
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const beefId = typeof body?.beefId === 'string' ? normalizeBeefId(body.beefId) : null;
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });
    }

    const roomName = beefDailyRoomName(beefId);

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beefId)
      .single();

    if (beefErr) {
      if (beefErr.code === 'PGRST116') {
        return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
      }
      return NextResponse.json({ error: 'Erreur lecture beef' }, { status: 500 });
    }
    if (!beef) {
      return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });
    }

    if (beef.status === 'ended' || beef.status === 'cancelled') {
      return NextResponse.json({ error: 'Beef non disponible' }, { status: 403 });
    }

    const { data: part } = await supabaseAdmin
      .from('beef_participants')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .eq('invite_status', 'accepted')
      .maybeSingle();

    const isMediator = beef.mediator_id === user.id;
    const isParticipant = !!part;
    const canSpectate =
      beef.status === 'pending' || beef.status === 'live' || beef.status === 'scheduled';

    if (!isMediator && !isParticipant && !canSpectate) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('display_name, username')
      .eq('id', user.id)
      .maybeSingle();

    const userName =
      (profile?.display_name?.trim() || profile?.username?.trim() || user.email?.split('@')[0] || 'Utilisateur')
        .slice(0, 120);

    const dailyUserId = user.id.trim();
    if (dailyUserId.length < 1 || dailyUserId.length > 36) {
      return NextResponse.json({ error: 'Identifiant utilisateur incompatible Daily' }, { status: 400 });
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;
    if (!DAILY_API_KEY) {
      return NextResponse.json({ error: 'Daily.co non configuré' }, { status: 500 });
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TOKEN_TTL_SEC;

    const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          user_id: dailyUserId,
          user_name: userName,
          is_owner: isMediator,
          exp,
          eject_at_token_exp: true,
        },
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Échec émission token Daily', details: data.info },
        { status: response.status },
      );
    }

    const token = typeof data.token === 'string' ? data.token : null;
    if (!token) {
      return NextResponse.json({ error: 'Réponse Daily invalide' }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      token,
      expiresAt: exp,
      roomName,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
