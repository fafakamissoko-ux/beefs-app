import type { NextRequest } from 'next/server';

/** URL canonique du site (success Stripe, OG, etc.). Préfère NEXT_PUBLIC_APP_URL pour éviter www / apex mélangés. */
export function publicAppOrigin(request: NextRequest): string {
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '').trim();
  if (fromEnv) return fromEnv;
  return request.nextUrl.origin;
}
