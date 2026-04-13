import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Simple in-memory rate limiter for API routes
const rateLimits = new Map<string, { count: number; resetAt: number }>();
const API_RATE_LIMIT = 30; // requests per window
const API_RATE_WINDOW = 60_000; // 1 minute

function getRateLimitKey(req: NextRequest): string {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
  return `${ip}:${req.nextUrl.pathname}`;
}

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const entry = rateLimits.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimits.set(key, { count: 1, resetAt: now + API_RATE_WINDOW });
    return false;
  }

  if (entry.count >= API_RATE_LIMIT) return true;
  entry.count++;
  return false;
}

// Clean up old entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetAt) rateLimits.delete(key);
  }
}, 60_000);

/**
 * Redirige www <-> apex pour coller à NEXT_PUBLIC_APP_URL (OAuth redirectTo + Supabase allowlist).
 */
function canonicalHostRedirect(request: NextRequest): NextResponse | null {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!raw) return null;

  let canonicalHostname: string;
  try {
    const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
    canonicalHostname = u.hostname.toLowerCase();
  } catch {
    return null;
  }

  const host = request.headers.get('host')?.split(':')[0]?.toLowerCase() ?? '';
  if (!host || host === 'localhost' || host.endsWith('.vercel.app')) {
    return null;
  }
  if (host === canonicalHostname) return null;

  if (canonicalHostname.startsWith('www.')) {
    const apex = canonicalHostname.slice(4);
    if (host === apex) {
      const url = request.nextUrl.clone();
      url.hostname = canonicalHostname;
      url.port = '';
      return NextResponse.redirect(url, 308);
    }
  } else {
    if (host === `www.${canonicalHostname}`) {
      const url = request.nextUrl.clone();
      url.hostname = canonicalHostname;
      url.port = '';
      return NextResponse.redirect(url, 308);
    }
  }

  return null;
}

export function middleware(request: NextRequest) {
  const hostRedirect = canonicalHostRedirect(request);
  if (hostRedirect) return hostRedirect;

  const { pathname } = request.nextUrl;

  // Rate limit API routes
  if (pathname.startsWith('/api/')) {
    const key = getRateLimitKey(request);

    if (isRateLimited(key)) {
      return NextResponse.json(
        { error: 'Trop de requêtes. Réessayez dans un instant.' },
        { status: 429 }
      );
    }

    // Webhook Stripe : pas de limite stricte (plusieurs événements / minute).
    const needsStrictLimit =
      pathname.includes('/withdrawals') || pathname === '/api/stripe/checkout';

    if (needsStrictLimit) {
      const strictKey = `strict:${key}`;
      const strictEntry = rateLimits.get(strictKey);
      const now = Date.now();

      if (!strictEntry || now > strictEntry.resetAt) {
        rateLimits.set(strictKey, { count: 1, resetAt: now + 60_000 });
      } else if (strictEntry.count >= 20) {
        return NextResponse.json(
          { error: 'Limite atteinte pour cette action. Attendez 1 minute.' },
          { status: 429 }
        );
      } else {
        strictEntry.count++;
      }
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
