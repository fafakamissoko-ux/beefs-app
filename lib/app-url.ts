import type { NextRequest } from 'next/server';

/**
 * Origine pour les redirections Stripe (success / cancel).
 * Si NEXT_PUBLIC_APP_URL vise la prod mais que l’utilisateur est sur un Preview `.vercel.app`,
 * on utilise l’origine de la requête — sinon Stripe renverrait toujours vers la prod après paiement.
 */
export function publicAppOrigin(request: NextRequest): string {
  const requestOrigin = request.nextUrl.origin;
  const fromEnv = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '').trim();

  if (!fromEnv) {
    return requestOrigin;
  }

  try {
    const envHost = new URL(fromEnv).host;
    const reqHost = new URL(requestOrigin).host;
    if (envHost !== reqHost) {
      return requestOrigin;
    }
  } catch {
    return requestOrigin;
  }

  return fromEnv;
}
