import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { roomName, privacy, maxParticipants } = await request.json();

    const DAILY_API_KEY = process.env.DAILY_API_KEY;
    const DAILY_DOMAIN = process.env.NEXT_PUBLIC_DAILY_DOMAIN || 'beefs.daily.co';

    if (!DAILY_API_KEY) {
      console.error('❌ DAILY_API_KEY not configured');
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    // Sanitize room name: lowercase, alphanumeric + hyphens only, max 40 chars
    const safeName = (roomName || `beef-${Date.now()}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .slice(0, 40);

    // Create room via Daily.co API (free plan compatible properties only)
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`,
      },
      body: JSON.stringify({
        name: safeName,
        privacy: privacy || 'public',
        properties: {
          max_participants: Math.min(maxParticipants || 10, 10),
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 3600, // Expires in 1 hour
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('❌ Daily.co API error:', JSON.stringify(data));
      return NextResponse.json(
        { error: data.error || 'Failed to create room', details: data.info },
        { status: response.status }
      );
    }

    console.log('✅ Daily.co room created:', data.name);

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
    console.error('❌ Error creating Daily.co room:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Get room info
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('name');

    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name required' },
        { status: 400 }
      );
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;

    if (!DAILY_API_KEY) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
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
    console.error('❌ Error fetching room:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}

// Delete room
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roomName = searchParams.get('name');

    if (!roomName) {
      return NextResponse.json(
        { error: 'Room name required' },
        { status: 400 }
      );
    }

    const DAILY_API_KEY = process.env.DAILY_API_KEY;

    if (!DAILY_API_KEY) {
      return NextResponse.json(
        { error: 'Daily.co API key not configured' },
        { status: 500 }
      );
    }

    const response = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
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

    console.log('✅ Daily.co room deleted:', roomName);

    return NextResponse.json({
      success: true,
      message: 'Room deleted successfully',
    });
  } catch (error: any) {
    console.error('❌ Error deleting room:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    );
  }
}
