/**
 * Pré-fetch du jeton Daily pour un beef — une promesse inflight par `beefId` (Arena + Sas).
 */

const inflightByBeefId = new Map<string, Promise<string | undefined>>();

export async function prefetchDailyMeetingTokenForBeef(
  beefId: string,
  getBearerToken: () => Promise<string | null | undefined>,
): Promise<string | undefined> {
  const existing = inflightByBeefId.get(beefId);
  if (existing) return existing;

  const run = (async (): Promise<string | undefined> => {
    try {
      const accessToken = await getBearerToken();
      if (!accessToken) return undefined;
      const res = await fetch('/api/daily/meeting-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ beefId }),
      });
      const data = (await res.json()) as { token?: string };
      if (!res.ok || !data.token) return undefined;
      return data.token;
    } catch {
      return undefined;
    } finally {
      inflightByBeefId.delete(beefId);
    }
  })();

  inflightByBeefId.set(beefId, run);
  return run;
}
