import { NextRequest, NextResponse } from 'next/server';
import { isAdminRequest } from '@/lib/is-admin-request';

const DAILY_BASE = 'https://api.daily.co/v1';

interface DailyRoomListItem {
  id: string;
  name: string;
  privacy?: string;
  config?: { privacy?: string };
}

function effectivePrivacy(room: DailyRoomListItem): string {
  return (room.privacy ?? room.config?.privacy ?? 'public').toLowerCase();
}

async function fetchAllRooms(apiKey: string): Promise<DailyRoomListItem[]> {
  const out: DailyRoomListItem[] = [];
  let startingAfter: string | undefined;
  const maxPages = 200;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${DAILY_BASE}/rooms`);
    url.searchParams.set('limit', '100');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(typeof err.error === 'string' ? err.error : `Daily list rooms ${res.status}`);
    }
    const json = await res.json();
    const batch: DailyRoomListItem[] = Array.isArray(json.data) ? json.data : [];
    out.push(...batch);
    if (batch.length < 100) break;
    startingAfter = batch[batch.length - 1]?.id;
    if (!startingAfter) break;
  }

  return out;
}

function isBeefRoomName(name: string): boolean {
  return name.startsWith('beef-');
}

/**
 * GET : aperçu des salles beef-* encore non private (admin uniquement).
 * POST : les passe en private via Daily POST /rooms/:name (admin uniquement).
 * Body POST optionnel : { "dryRun": true } — même liste que GET sans modifier.
 */
export async function GET(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return NextResponse.json({ error: 'DAILY_API_KEY manquant' }, { status: 500 });
  }

  try {
    const rooms = await fetchAllRooms(DAILY_API_KEY);
    const candidates = rooms.filter(
      r => isBeefRoomName(r.name) && effectivePrivacy(r) !== 'private',
    );
    return NextResponse.json({
      success: true,
      totalRoomsListed: rooms.length,
      candidates: candidates.map(r => ({ name: r.name, id: r.id, privacy: effectivePrivacy(r) })),
      count: candidates.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Daily';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const DAILY_API_KEY = process.env.DAILY_API_KEY;
  if (!DAILY_API_KEY) {
    return NextResponse.json({ error: 'DAILY_API_KEY manquant' }, { status: 500 });
  }

  let dryRun = false;
  try {
    const body = await request.json();
    dryRun = Boolean(body?.dryRun);
  } catch {
    /* empty body */
  }

  try {
    const rooms = await fetchAllRooms(DAILY_API_KEY);
    const candidates = rooms.filter(
      r => isBeefRoomName(r.name) && effectivePrivacy(r) !== 'private',
    );

    if (dryRun) {
      return NextResponse.json({
        success: true,
        dryRun: true,
        totalRoomsListed: rooms.length,
        wouldUpdate: candidates.map(r => ({ name: r.name, id: r.id, privacy: effectivePrivacy(r) })),
        count: candidates.length,
      });
    }

    const results: Array<{ name: string; ok: boolean; error?: string }> = [];

    for (const r of candidates) {
      const res = await fetch(`${DAILY_BASE}/rooms/${encodeURIComponent(r.name)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${DAILY_API_KEY}`,
        },
        body: JSON.stringify({ privacy: 'private' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        results.push({
          name: r.name,
          ok: false,
          error: typeof data.error === 'string' ? data.error : `HTTP ${res.status}`,
        });
      } else {
        results.push({ name: r.name, ok: true });
      }
    }

    const okCount = results.filter(x => x.ok).length;
    const failCount = results.length - okCount;

    return NextResponse.json({
      success: failCount === 0,
      totalRoomsListed: rooms.length,
      updated: okCount,
      failed: failCount,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur Daily';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
