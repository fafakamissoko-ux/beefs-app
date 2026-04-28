import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';
import { beefDailyRoomName } from '@/lib/beef-daily-room';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;

  try {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
      error,
    } = await supabaseAuth.auth.getUser();
    if (error || !user) return null;
    return user;
  } catch {
    return null;
  }
}

function beefIdFromSearchParams(searchParams: URLSearchParams): string | null {
  for (const key of ['beefId', 'beef_id', 'beefid']) {
    const v = searchParams.get(key);
    if (v?.trim()) return v.trim();
  }
  return null;
}

const MEETING_TOKEN_TTL_SEC = 2 * 60 * 60; // 2 h

async function fetchDailyRoomUrl(roomName: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return typeof data.url === 'string' ? data.url : null;
  } catch {
    return null;
  }
}

type DailyTokenRole = 'mediator' | 'participant' | 'spectator';

/** Ligne `users` pour le nom Daily — cast explicite car le client admin peut inférer `never` sans types DB générés. */
type UsersNameFields = { display_name: string | null; username: string | null };

/**
 * Crée un meeting token Daily (POST /v1/meeting-tokens).
 * — médiateur : is_owner
 * — spectateur : micro + cam coupés à l’entrée
 * — participant (challenger) : flux média libres (pas de start_* forcés)
 */
async function createDailyMeetingToken(params: {
  apiKey: string;
  roomName: string;
  user: User;
  userName: string;
  role: DailyTokenRole;
}): Promise<string | null> {
  const { apiKey, roomName, user, userName, role } = params;
  const uid = user.id.trim();
  if (uid.length < 1 || uid.length > 36) return null;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + MEETING_TOKEN_TTL_SEC;

  const properties: Record<string, unknown> = {
    room_name: roomName,
    user_id: uid,
    user_name: userName.slice(0, 120),
    exp,
    eject_at_token_exp: true,
  };

  if (role === 'mediator') {
    properties.is_owner = true;
  }
  if (role === 'spectator') {
    properties.start_video_off = true;
    properties.start_audio_off = true;
  }

  const res = await fetch('https://api.daily.co/v1/meeting-tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ properties }),
  });

  const data = (await res.json()) as { token?: string; error?: string };
  if (!res.ok || typeof data.token !== 'string') {
    return null;
  }
  return data.token;
}

async function videoCredentialsForUser(
  supabase: typeof supabaseAdmin,
  user: User,
  beefId: string,
  grantTokenRole: DailyTokenRole | null,
): Promise<{ dailyRoomUrl: string | null; dailyToken: string | null }> {
  const apiKey = process.env.DAILY_API_KEY;
  const roomName = beefDailyRoomName(beefId);
  const dailyRoomUrl = apiKey ? await fetchDailyRoomUrl(roomName, apiKey) : null;

  const { data: profileRaw } = await supabase
    .from('users')
    .select('display_name, username')
    .eq('id', user.id)
    .maybeSingle();

  const profile = profileRaw as UsersNameFields | null;

  const userName =
    (profile?.display_name?.trim() ||
      profile?.username?.trim() ||
      user.email?.split('@')[0] ||
      'Utilisateur')
      .slice(0, 120);

  if (!apiKey || !grantTokenRole || !dailyRoomUrl) {
    return { dailyRoomUrl, dailyToken: null };
  }

  const dailyToken = await createDailyMeetingToken({
    apiKey,
    roomName,
    user,
    userName,
    role: grantTokenRole,
  });

  return { dailyRoomUrl, dailyToken };
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const rawId = beefIdFromSearchParams(new URL(request.url).searchParams);
    const beefId = rawId ? normalizeBeefId(rawId) : null;
    if (!beefId) return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, created_by, status')
      .eq('id', beefId)
      .single();

    if (beefErr || !beef) return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });

    let role: DailyTokenRole = 'spectator';
    let grantTokenRole: DailyTokenRole | null = 'spectator';

    if (beef.mediator_id === user.id) {
      role = 'mediator';
      grantTokenRole = 'mediator';
    } else {
      const { data: part } = await supabaseAdmin
        .from('beef_participants')
        .select('id')
        .eq('beef_id', beefId)
        .eq('user_id', user.id)
        .eq('invite_status', 'accepted')
        .maybeSingle();
      if (part) {
        role = 'participant';
        grantTokenRole = 'participant';
      }
    }

    if (role === 'spectator' && beef.status !== 'live') {
      grantTokenRole = null;
    }

    const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, grantTokenRole);
    return NextResponse.json({
      role,
      viewerAccess: beef.status === 'live' ? 'full' : 'not_live',
      ...video,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
