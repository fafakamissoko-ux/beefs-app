import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { normalizeBeefId } from '@/lib/beef-id';

/**
 * Appels Daily REST côté serveur uniquement — jamais exposés au client pour la création de salle.
 */

export async function getDailyRoomUrlByName(roomName: string, apiKey: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(roomName)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return typeof data.url === 'string' && data.url.length > 0 ? data.url : null;
  } catch {
    return null;
  }
}

/**
 * Crée la room Daily (POST /v1/rooms) — utilisé uniquement pour médiateur / challenger via beef/access.
 */
export async function createDailyRoom(roomName: string, apiKey: string): Promise<{ url: string } | null> {
  try {
    const res = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'private',
        properties: {
          max_participants: 50,
          enable_screenshare: true,
          start_video_off: false,
          start_audio_off: false,
          exp: Math.floor(Date.now() / 1000) + 24 * 3600,
        },
      }),
    });
    const data = (await res.json()) as { url?: string; error?: string };
    if (!res.ok || typeof data.url !== 'string' || !data.url) {
      return null;
    }
    return { url: data.url };
  } catch {
    return null;
  }
}

/**
 * Garantit l’existence de la salle (GET puis POST) — réservé aux créateurs (beef/access).
 */
export async function ensureDailyRoomExistsForBeef(beefIdRaw: string): Promise<string | null> {
  const apiKey = process.env.DAILY_API_KEY;
  const normalized = normalizeBeefId(beefIdRaw);
  if (!apiKey || !normalized) return null;
  const roomName = beefDailyRoomName(normalized);
  const existing = await getDailyRoomUrlByName(roomName, apiKey);
  if (existing) return existing;
  const created = await createDailyRoom(roomName, apiKey);
  return created?.url ?? null;
}
