import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createSupabaseMiddlewareClient } from '@/lib/supabase/middleware';
import { sanitizeReturnPath } from '@/lib/navigation-return';

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
  if (pathname === '/live' || pathname.startsWith('/live/')) return true;
  if (pathname === '/arena' || pathname.startsWith('/arena/')) return true;
  return false;
}

/** Pages « Agora » : accès garanti avec session même si autres chemins peuvent encore rafraîchir les jetons */
function isAuthenticatedExperiencePath(pathname: string): boolean {
  return (
    pathRequiresArenaProfile(pathname) ||
    pathname === '/messages' ||
    pathname.startsWith('/messages/') ||
    pathname === '/profile' ||
    pathname.startsWith('/profile/') ||
    pathname === '/notifications' ||
    pathname.startsWith('/notifications/')
  );
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
  /** Met à jour les cookies avant `getUser` pour éviter une session JWT « trop tôt » / instable après refresh. */
  await supabase.auth.getSession();

  const {
    data: { user },
    error: getUserError,
  } = await supabase.auth.getUser();

  const protectedPrefixes = ['/create', '/settings', '/invitations', '/messages', '/admin', '/notifications'];

  /** Hub « Mon profil » uniquement — les pages `/profile/:username` restent publiques. */
  const isProtectedPath =
    pathname === '/profile' ||
    protectedPrefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const authPaths = ['/login', '/signup', '/welcome'];
  const isAuthPath = authPaths.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // 1. Bloquer les non-connectés hors des zones sécurisées
  if (!user && isProtectedPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Erreur transitoire (réseau) : une session encore présente côté cookies ne doit pas forcer `/feed`.
  if (
    user == null &&
    getUserError &&
    isAuthenticatedExperiencePath(pathname)
  ) {
    return response;
  }

  // 2. Connectés sur login / signup : suivre `redirect` ou `next` (aligné avec app/login).
  if (user && isAuthPath) {
    const pick =
      request.nextUrl.searchParams.get('redirect') ?? request.nextUrl.searchParams.get('next');
    const sanitized = sanitizeReturnPath(pick);
    if (sanitized) {
      const pathOnly = sanitized.split('?')[0]!;
      return NextResponse.redirect(new URL(pathOnly, request.nextUrl.origin));
    }

    const feedUrl = request.nextUrl.clone();
    feedUrl.pathname = '/feed';
    return NextResponse.redirect(feedUrl);
  }

  if (pathname === '/onboarding') {
    if (!user) {
      const login = request.nextUrl.clone();
      login.pathname = '/login';
      login.searchParams.set('redirect', '/onboarding');
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
