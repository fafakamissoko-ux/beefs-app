/**
 * Provisionnement Daily côté serveur (service) — évite aux clients médiateurs/challengers
 * de multiplier GET/POST /api/daily/rooms avant d’avoir des credentials valides.
 */
import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { normalizeBeefId } from '@/lib/beef-id';

export async function fetchDailyRoomUrl(roomName: string, apiKey: string): Promise<string | null> {
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

/**
 * Si la room n’existe pas, tentatives de création (private, compatible plan gratuit générique).
 */
export async function ensureDailyRoomUrlForBeef(beefIdRaw: string): Promise<string | null> {
  const beefId = normalizeBeefId(beefIdRaw) ?? beefIdRaw.trim().toLowerCase();
  const apiKey = process.env.DAILY_API_KEY;
  if (!beefId || !apiKey) return null;

  const safeName = beefDailyRoomName(beefId);

  const existing = await fetchDailyRoomUrl(safeName, apiKey);
  if (existing) return existing;

  const response = await fetch('https://api.daily.co/v1/rooms', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      name: safeName,
      privacy: 'private',
      properties: {
        max_participants: 50,
        enable_screenshare: true,
        start_video_off: false,
        start_audio_off: false,
        exp: Math.floor(Date.now() / 1000) + 86400,
      },
    }),
  });

  const data = (await response.json()) as { url?: string; error?: string };
  if (!response.ok || typeof data.url !== 'string') {
    return null;
  }
  return data.url;
}
