import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import type { User } from '@supabase/supabase-js';
import { updateUserBalance } from '@/lib/updateUserBalance';
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

/** Vérité serveur : anti-fraude (rechargement / onglet / manipulation client). */
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const rawId = beefIdFromSearchParams(new URL(request.url).searchParams);
    const beefId = rawId ? normalizeBeefId(rawId) : null;
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, price, status, started_at, free_preview_minutes')
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

    if (beef.mediator_id === user.id) {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'mediator');
      return NextResponse.json({
        role: 'mediator',
        viewerAccess: 'full',
        continuationPrice: beef.price ?? 0,
        freePreviewMinutes: beef.free_preview_minutes ?? 10,
        ...video,
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
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'participant');
      return NextResponse.json({
        role: 'participant',
        viewerAccess: 'full',
        continuationPrice: beef.price ?? 0,
        freePreviewMinutes: beef.free_preview_minutes ?? 10,
        ...video,
      });
    }

    const price = beef.price ?? 0;
    const fpMin = beef.free_preview_minutes ?? 10;

    if (beef.status !== 'live') {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, null);
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'not_live',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        ...video,
      });
    }

    if (price <= 0) {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'spectator');
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'free',
        continuationPrice: 0,
        freePreviewMinutes: fpMin,
        ...video,
      });
    }

    const { data: accessRow } = await supabaseAdmin
      .from('beef_access')
      .select('id')
      .eq('beef_id', beefId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (accessRow) {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'spectator');
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'paid',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: beef.started_at,
        ...video,
      });
    }

    if (!beef.started_at) {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'spectator');
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'waiting_start',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: null,
        ...video,
      });
    }

    const elapsedSec = Math.max(0, (Date.now() - new Date(beef.started_at).getTime()) / 1000);
    const previewSec = fpMin * 60;

    if (elapsedSec <= previewSec) {
      const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, 'spectator');
      return NextResponse.json({
        role: 'spectator',
        viewerAccess: 'preview',
        continuationPrice: price,
        freePreviewMinutes: fpMin,
        startedAt: beef.started_at,
        previewEndsInSeconds: Math.max(0, previewSec - elapsedSec),
        ...video,
      });
    }

    const video = await videoCredentialsForUser(supabaseAdmin, user, beefId, null);
    return NextResponse.json({
      role: 'spectator',
      viewerAccess: 'locked',
      continuationPrice: price,
      freePreviewMinutes: fpMin,
      startedAt: beef.started_at,
      ...video,
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

    const body = await request.json();
    const rawPostId = typeof body?.beefId === 'string' ? body.beefId : '';
    const beefId = normalizeBeefId(rawPostId);
    if (!beefId) {
      return NextResponse.json({ error: 'beefId invalide ou requis' }, { status: 400 });
    }

    const { data: beef, error: beefErr } = await supabaseAdmin
      .from('beefs')
      .select('id, mediator_id, price, status')
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

    let newBalance: number;
    let debited = false;
    try {
      await updateUserBalance(supabaseAdmin, {
        userId: user.id,
        amount: -price,
        type: 'beef_access',
        description: `Accès payant au direct (beef)`,
        metadata: { beef_id: beefId },
      });
      debited = true;
      await updateUserBalance(supabaseAdmin, {
        userId: beef.mediator_id,
        amount: price,
        type: 'beef_access_revenue',
        description: `Revenu spectateur — accès au direct`,
        metadata: { beef_id: beefId, payer_id: user.id },
      });
      const { data: after } = await supabaseAdmin.from('users').select('points').eq('id', user.id).single();
      newBalance = after?.points ?? (buyer.points ?? 0) - price;
    } catch (e: unknown) {
      if (debited) {
        try {
          await updateUserBalance(supabaseAdmin, {
            userId: user.id,
            amount: price,
            type: 'refund',
            description: 'Annulation — erreur crédit médiateur (accès beef)',
            metadata: { beef_id: beefId },
          });
        } catch {}
      }
      const msg = e instanceof Error ? e.message : 'Erreur solde';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    await supabaseAdmin.from('beef_access').insert({
      beef_id: beefId,
      user_id: user.id,
      access_type: 'paid',
      points_spent: price,
    });

    return NextResponse.json({
      success: true,
      newBalance,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
