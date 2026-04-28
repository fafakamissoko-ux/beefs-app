import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';

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

function pathRequiresArenaProfile(pathname: string): boolean {
  if (pathname === '/feed' || pathname.startsWith('/feed/')) return true;
  if (pathname.startsWith('/live/')) return true;
  if (pathname.startsWith('/arena/')) return true;
  return false;
}

export async function middleware(request: NextRequest) {
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

  const { supabase, response } = createSupabaseMiddlewareClient(request);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const protectedPaths = ['/feed', '/profile', '/create', '/settings', '/invitations', '/messages', '/admin'];
  const authPaths = ['/login', '/signup', '/welcome'];

  const isProtectedPath = protectedPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const isAuthPath = authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // 1. Bloquer les non-connectés hors des zones sécurisées
  if (!user && isProtectedPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('next', pathname); // Mémorise la page voulue
    return NextResponse.redirect(loginUrl);
  }

  // 2. Bloquer les connectés hors des pages d'inscription/connexion
  if (user && isAuthPath) {
    const feedUrl = request.nextUrl.clone();
    feedUrl.pathname = '/feed';
    return NextResponse.redirect(feedUrl);
  }

  if (pathname === '/onboarding') {
    if (!user) {
      const login = request.nextUrl.clone();
      login.pathname = '/login';
      login.searchParams.set('next', '/onboarding');
      return NextResponse.redirect(login);
    }
    const { data: row, error } = await supabase
      .from('users')
      .select('needs_arena_username')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && row && row.needs_arena_username === false) {
      const feed = request.nextUrl.clone();
      feed.pathname = '/feed';
      feed.search = '';
      return NextResponse.redirect(feed);
    }
    return response;
  }

  if (user && pathRequiresArenaProfile(pathname)) {
    const { data: row, error } = await supabase
      .from('users')
      .select('needs_arena_username')
      .eq('id', user.id)
      .maybeSingle();
    if (!error && row?.needs_arena_username === true) {
      const onboard = request.nextUrl.clone();
      onboard.pathname = '/onboarding';
      onboard.search = '';
      return NextResponse.redirect(onboard);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
