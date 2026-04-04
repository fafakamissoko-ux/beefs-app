import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { userMayActOnBeef } from '@/lib/api/beef-access-context';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function verifyAuth(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) return null;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function POST(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const beefId = typeof body?.beefId === 'string' ? body.beefId.trim() : '';
    const { privacy, maxParticipants } = body;
    /** Salles beef : private par défaut pour forcer un meeting token (join authentifié). */
    const effectivePrivacy = privacy ?? 'private';

    if (!beefId) {
      return NextResponse.json({ error: 'beefId requis' }, { status: 400 });
    }

    const expectedName = beefDailyRoomName(beefId);
    const access = await userMayActOnBeef(supabaseAdmin, beefId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;

    if (!DAILY_API_KEY) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    const safeName = expectedName;

    // Create room via Daily.co API (free plan compatible properties only)
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: safeName,
        privacy: effectivePrivacy,
        properties: {
          max_participants: Math.min(maxParticipants || 50, 50),
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Failed to create room', details: data.info },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      room: {
        name: data.name,
        url: data.url,
        created_at: data.created_at,
        config: data.config,
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erreur lors de la création de la salle' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('name');
    const beefId = searchParams.get('beefId')?.trim() || '';

    if (!roomName || !beefId) {
      return NextResponse.json(
        { error: 'name et beefId requis' },
        { status: 400 }
      );
    }

    if (beefDailyRoomName(beefId).toLowerCase() !== roomName.toLowerCase()) {
      return NextResponse.json({ error: 'Nom de salle invalide pour ce beef' }, { status: 400 });
    }

    const access = await userMayActOnBeef(supabaseAdmin, beefId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;

    if (!DAILY_API_KEY) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { error: data.error || 'Room not found' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      room: data,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erreur lors de la récupération de la salle' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await verifyAuth(request);
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('name');
    const beefId = searchParams.get('beefId')?.trim() || '';

    if (!roomName || !beefId) {
      return NextResponse.json(
        { error: 'name et beefId requis' },
        { status: 400 }
      );
    }

    if (beefDailyRoomName(beefId).toLowerCase() !== roomName.toLowerCase()) {
      return NextResponse.json({ error: 'Nom de salle invalide pour ce beef' }, { status: 400 });
    }

    const access = await userMayActOnBeef(supabaseAdmin, beefId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;

    if (!DAILY_API_KEY) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
    });

    if (!response.ok) {
      const data = await response.json();
      return NextResponse.json(
        { error: data.error || 'Failed to delete room' },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Room deleted successfully',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erreur lors de la suppression de la salle' },
      { status: 500 }
    );
  }
}
