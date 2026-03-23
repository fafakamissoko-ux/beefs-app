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

export function middleware(request: NextRequest) {
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

    // Stricter limits for sensitive endpoints
    if (pathname.includes('/withdrawals') || pathname.includes('/stripe')) {
      const strictKey = `strict:${key}`;
      const strictEntry = rateLimits.get(strictKey);
      const now = Date.now();

      if (!strictEntry || now > strictEntry.resetAt) {
        rateLimits.set(strictKey, { count: 1, resetAt: now + 60_000 });
      } else if (strictEntry.count >= 5) {
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
  matcher: ['/api/:path*'],
};
