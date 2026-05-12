import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { normalizeBeefId } from '@/lib/beef-id';
import { userIdsEqual, canonicalUserUuid } from '@/lib/user-id-equal';
import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { ensureDailyRoomExistsForBeef, getDailyRoomUrlByName } from '@/lib/server/daily-rooms';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const AUTH_MEETING_TOKEN_TTL_SEC = 2 * 60 * 60;

/** Statuts où un spectateur peut recevoir un billet (écoute) une fois la room existante. */
function beefStatusAllowsSpectatorTicket(status: string): boolean {
  return status === 'pending' || status === 'live' || status === 'scheduled' || status === 'ready';
}

async function getAuthUser(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ') || authHeader.length < 15) return null;

  try {
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
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

type DailyTokenRole = 'mediator' | 'participant' | 'spectator';

type UsersNameFields = { display_name: string | null; username: string | null };

/**
 * POST https://api.daily.co/v1/meeting-tokens — exp = maintenant + tokenTtlSec secondes.
 */
async function createDailyMeetingToken(params: {
  apiKey: string;
  roomName: string;
  user: User;
  userName: string;
  role: DailyTokenRole;
  tokenTtlSec: number;
}): Promise<string | null> {
  const { apiKey, roomName, user, userName, role, tokenTtlSec } = params;
  const uidRaw = user.id.trim().toLowerCase();
  if (uidRaw.length < 1 || uidRaw.length > 64) return null;

  const exp = Math.floor(Date.now() / 1000) + tokenTtlSec;

  const properties: Record<string, unknown> = {
    room_name: roomName,
    user_id: uidRaw,
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

async function resolveDisplayName(supabase: typeof supabaseAdmin, user: User): Promise<string> {
  const profileUid = canonicalUserUuid(user.id) ?? user.id.trim();
  const { data } = await supabase
    .from('users')
    .select('display_name, username')
    .eq('id', profileUid)
    .maybeSingle();
  const profile = data as UsersNameFields | null;
  return (
    profile?.display_name?.trim() ||
    profile?.username?.trim() ||
    user.email?.split('@')[0] ||
    'Utilisateur'
  ).slice(0, 120);
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json(
        { ok: false, code: 'AUTH_REQUIRED', error: 'Authentification requise' },
        { status: 401 },
      );
    }

    const rawId = beefIdFromSearchParams(new URL(request.url).searchParams);
    const beefId = rawId ? normalizeBeefId(rawId) : null;
    if (!beefId) return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, status')
      .eq('id', beefId)
      .single();

    if (beefErr || !beef) return NextResponse.json({ error: 'Beef introuvable' }, { status: 404 });

    if (beef.status === 'ended' || beef.status === 'cancelled' || beef.status === 'replay') {
      return NextResponse.json({ error: 'Beef non disponible', viewerAccess: 'not_live' as const }, { status: 403 });
    }

    const apiKey = process.env.DAILY_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Configuration Daily manquante' }, { status: 500 });
    }

    const roomName = beefDailyRoomName(beefId);

    let tokenRole: DailyTokenRole = 'spectator';
    let isCreator = false;

    if (userIdsEqual(beef.mediator_id, user.id)) {
      tokenRole = 'mediator';
      isCreator = true;
    } else {
      const uidForParticipant = canonicalUserUuid(user.id) ?? user.id.trim();
      const { data: part } = await supabaseAdmin
        .from('beef_participants')
        .select('id')
        .eq('beef_id', beefId)
        .eq('user_id', uidForParticipant)
        .eq('invite_status', 'accepted')
        .maybeSingle();
      if (part) {
        tokenRole = 'participant';
        isCreator = true;
      }
    }

    const userName = await resolveDisplayName(supabaseAdmin, user);

    /** ── Créateurs : création de salle obligatoire côté serveur, puis jeton. ── */
    if (isCreator) {
      const dailyRoomUrl = await ensureDailyRoomExistsForBeef(beefId);
      if (!dailyRoomUrl) {
        return NextResponse.json(
          { error: 'Impossible de préparer la salle vidéo', code: 'DAILY_ROOM_UNREACHABLE' },
          { status: 503 },
        );
      }
      const token = await createDailyMeetingToken({
        apiKey,
        roomName,
        user,
        userName,
        role: tokenRole,
        tokenTtlSec: AUTH_MEETING_TOKEN_TTL_SEC,
      });
      if (!token) {
        return NextResponse.json({ error: 'Émission du jeton impossible', code: 'TOKEN_FAILED' }, { status: 503 });
      }
      return NextResponse.json({
        ok: true,
        role: tokenRole,
        viewerAccess: 'full' as const,
        dailyRoomUrl,
        dailyToken: token,
      });
    }

    /** ── Spectateurs connectés : jamais de POST room — lookup GET uniquement. ── */
    if (!beefStatusAllowsSpectatorTicket(beef.status)) {
      return NextResponse.json({
        ok: false,
        role: 'spectator' as const,
        viewerAccess: 'not_live' as const,
        dailyRoomUrl: null,
        dailyToken: null,
        code: 'BEEF_NOT_WATCHABLE',
      });
    }

    const dailyRoomUrl = await getDailyRoomUrlByName(roomName, apiKey);
    if (!dailyRoomUrl) {
      return NextResponse.json({
        ok: false,
        role: 'spectator' as const,
        viewerAccess: 'not_live' as const,
        dailyRoomUrl: null,
        dailyToken: null,
        code: 'ROOM_NOT_FOUND',
      });
    }

    const token = await createDailyMeetingToken({
      apiKey,
      roomName,
      user,
      userName,
      role: 'spectator',
      tokenTtlSec: AUTH_MEETING_TOKEN_TTL_SEC,
    });

    if (!token) {
      return NextResponse.json(
        { ok: false, error: 'Émission du jeton spectateur impossible', code: 'TOKEN_FAILED', dailyRoomUrl, dailyToken: null },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      role: 'spectator' as const,
      viewerAccess: 'full' as const,
      dailyRoomUrl,
      dailyToken: token,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
