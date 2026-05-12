/**
 * Client : récupération du billet vidéo Daily via GET /api/beef/access uniquement.
 */

export type BeefVideoTicketResult =
  | {
      ok: true;
      role: string;
      viewerAccess: string;
      dailyRoomUrl: string;
      dailyToken: string;
    }
  | { ok: false; status: number; code?: string; message: string };

export async function fetchBeefVideoTicket(
  beefId: string,
  accessToken: string | null,
): Promise<BeefVideoTicketResult> {
  const headers: Record<string, string> = {};
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }
  const res = await fetch(`/api/beef/access?beefId=${encodeURIComponent(beefId)}`, { headers });
  const data = (await res.json()) as {
    ok?: boolean;
    error?: string;
    code?: string;
    role?: string;
    viewerAccess?: string;
    dailyRoomUrl?: string | null;
    dailyToken?: string | null;
  };

  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      message: typeof data.error === 'string' ? data.error : 'Accès refusé',
      code: typeof data.code === 'string' ? data.code : undefined,
    };
  }

  if (data.ok === false) {
    return {
      ok: false,
      status: 200,
      message:
        data.code === 'ROOM_NOT_FOUND'
          ? 'La salle vidéo n’est pas encore ouverte par le médiateur.'
          : data.code === 'BEEF_NOT_WATCHABLE'
            ? 'Ce beef n’est pas accessible en ce moment.'
            : 'Billet vidéo indisponible.',
      code: typeof data.code === 'string' ? data.code : 'TICKET_DENIED',
    };
  }

  const url = data.dailyRoomUrl;
  const tok = data.dailyToken;
  if (typeof url !== 'string' || !url || typeof tok !== 'string' || !tok) {
    return { ok: false, status: 200, code: 'INCOMPLETE_TICKET', message: 'Réponse serveur incomplète.' };
  }

  return {
    ok: true,
    role: typeof data.role === 'string' ? data.role : 'spectator',
    viewerAccess: typeof data.viewerAccess === 'string' ? data.viewerAccess : 'full',
    dailyRoomUrl: url,
    dailyToken: tok,
  };
}
