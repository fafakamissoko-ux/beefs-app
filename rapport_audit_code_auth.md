# Rapport d'audit code — Authentification & routage OAuth

**Date :** 31 mai 2026  
**Mission :** extraction brute pour refonte portail auth (Apple, Google, Magic Link, Email)  
**Aucun fichier modifié.**

---

## Synthèse — état actuel vs cible 4 méthodes

| Méthode | Présente dans le code extrait | Point d'entrée OAuth / callback |
|---------|------------------------------|----------------------------------|
| **Email + mot de passe** | ✅ `signIn`, `signUp` | Confirmation email → `/auth/callback` |
| **Google** | ✅ `signInWithOAuth({ provider: 'google' })` | `/auth/callback` |
| **Magic Link** | ❌ Absent | — |
| **Apple** | ❌ Absent | — |
| **SMS OTP** | ⚠️ `sendPhoneOtp` / `verifyPhoneOtp` (AuthContext, sans UI) | Non routé via callback extrait |

**URLs de redirection OAuth / email :** `${getBrowserSiteOrigin()}/auth/callback` (AuthContext)  
**Échange PKCE :** `exchangeCodeForSession(window.location.href)` dans `app/auth/callback/page.tsx`

---

## 1. Middleware — intégralité `middleware.ts`

**Fichier :** `middleware.ts` (235 lignes)

```typescript
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

  const protectedPrefixes = ['/create', '/settings', '/invitations', '/messages', '/admin', '/notifications', '/arena', '/live'];

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
```

**Note OAuth :** `canonicalHostRedirect` aligne www/apex sur `NEXT_PUBLIC_APP_URL` — critique pour allowlist Supabase et `redirectTo`.

---

## 2. AuthContext — connexion & Provider

**Fichier :** `contexts/AuthContext.tsx`

### 2.1 Interface exposée

```typescript
interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: 'user' | 'admin' | 'moderator' | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  /** SMS — nécessite Phone activé dans Supabase + fournisseur (Twilio, etc.). */
  sendPhoneOtp: (phoneE164: string) => Promise<{ error: any }>;
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
}
```

### 2.2 Initialisation session + `ensurePublicUserProfile`

```typescript
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'user' | 'admin' | 'moderator' | null>(null);

  const loadUserRole = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('users').select('role').eq('id', userId).single();
      setUserRole((data?.role as 'user' | 'admin' | 'moderator') ?? 'user');
    } catch {
      setUserRole('user');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubAuth: () => void = () => {};

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        void ensurePublicUserProfile(supabase, session.user);
        hydrateLocalPrefsFromUser(session.user);
        await loadUserRole(session.user.id);
      } else {
        setUserRole(null);
      }
      setLoading(false);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        void (async () => {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            void ensurePublicUserProfile(supabase, session.user);
            hydrateLocalPrefsFromUser(session.user);
            await loadUserRole(session.user.id);
          } else {
            setUserRole(null);
          }

          if (!cancelled) setLoading(false);
        })();
      });
      unsubAuth = () => subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [loadUserRole]);
```

### 2.3 `signUp`

```typescript
  const signUp = async (email: string, password: string, username: string) => {
    try {
      const emailPolicy = validateSignupEmail(email);
      if (!emailPolicy.ok) {
        return { error: { message: emailPolicy.message, name: 'EmailNotAllowed' } };
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username,
          },
          emailRedirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });

      if (error) return { error };

      // Create user profile in database
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email,
          username,
          display_name: username,
          points: 0,
          is_verified: false,
          needs_arena_username: false,
        });
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };
```

### 2.4 `signIn`

```typescript
  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };
```

### 2.5 `signInWithGoogle`

```typescript
  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };
```

### 2.6 Provider — value & return

```typescript
  const value = {
    user,
    session,
    loading,
    userRole,
    signUp,
    signIn,
    signInWithGoogle,
    sendPhoneOtp,
    verifyPhoneOtp,
    signOut,
    resetPassword,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

### 2.7 Méthodes annexes (non demandées mais présentes)

```typescript
  const sendPhoneOtp = async (phoneE164: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      phone: phoneE164,
      options: { shouldCreateUser: true },
    });
    return { error };
  };

  const verifyPhoneOtp = async (phoneE164: string, token: string) => {
    const { error } = await supabase.auth.verifyOtp({
      phone: phoneE164,
      token: token.trim(),
      type: 'sms',
    });
    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      window.location.href = '/feed';
    }
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getBrowserSiteOrigin()}/auth/reset-password`,
    });
    return { error };
  };
```

---

## 3. Script d'insertion — intégralité `lib/ensure-public-user-profile.ts`

**Fichier :** `lib/ensure-public-user-profile.ts` (87 lignes) — **cible purge** si trigger DB prend le relais.

```typescript
import type { User, SupabaseClient } from '@supabase/supabase-js';

const inFlight = new Map<string, Promise<void>>();

function slugUsername(raw: string, userId: string): string {
  let s = raw
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .toLowerCase()
    .slice(0, 28);
  if (s.length < 3) s = `u_${userId.replace(/-/g, '').slice(0, 12)}`;
  return s;
}

/**
 * Crée une ligne `public.users` si absente (OAuth Google / Apple, etc. ne passent pas par signUp() client).
 */
export async function ensurePublicUserProfile(supabase: SupabaseClient, user: User): Promise<void> {
  const existing = inFlight.get(user.id);
  if (existing) return existing;

  const run = (async () => {
    const { data: row } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
    if (row) return;

    const email = (user.email ?? '').trim();
    if (!email) {
      console.warn('[ensurePublicUserProfile] Identité incomplète — création du profil public reportée');
      return;
    }

    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const str = (k: string) => (typeof meta[k] === 'string' ? String(meta[k]).trim() : '');
    /**
     * Pseudo : choix manuel (form signUp) prioritaire, sinon `preferred_username` OAuth,
     * sinon slug depuis l'email, sinon `u_<uid>`. Pas d'écran d'onboarding obligatoire :
     * en cas de collision on suffixe et l'utilisateur peut renommer dans Paramètres.
     */
    let username = str('username') || str('preferred_username') || slugUsername(email.split('@')[0] || '', user.id);
    const display_name =
      str('display_name') || str('full_name') || str('name') || username;

    const { data: available, error: availErr } = await supabase.rpc('check_username_available', {
      p_username: username,
    });
    if (availErr) {
      console.warn('[ensurePublicUserProfile] check_username_available', availErr.message);
    }
    if (available !== true) {
      username = `${username.slice(0, 20)}_${user.id.slice(0, 6)}`;
    }

    const { error } = await supabase.from('users').insert({
      id: user.id,
      email,
      username,
      display_name,
      points: 0,
      is_verified: !!user.email_confirmed_at,
      needs_arena_username: false,
    });

    if (error) {
      const { data: again } = await supabase.from('users').select('id').eq('id', user.id).maybeSingle();
      if (again) return;
      const fallbackUser = `u_${user.id.replace(/-/g, '').slice(0, 14)}`;
      const { error: e2 } = await supabase.from('users').insert({
        id: user.id,
        email,
        username: fallbackUser,
        display_name,
        points: 0,
        is_verified: !!user.email_confirmed_at,
        needs_arena_username: false,
      });
      if (e2) console.error('[ensurePublicUserProfile] insert échoué');
    }
  })();

  inFlight.set(user.id, run);
  try {
    await run;
  } finally {
    inFlight.delete(user.id);
  }
}
```

**Appelé depuis :**
- `AuthContext` — `getSession` + `onAuthStateChange`
- `app/auth/callback/page.tsx` — post-`exchangeCodeForSession`

---

## 4. Routeur OAuth — intégralité `app/auth/callback/page.tsx`

**Fichier :** `app/auth/callback/page.tsx` (92 lignes) — **CRITIQUE**

```typescript
'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import { ensurePublicUserProfile } from '@/lib/ensure-public-user-profile';

function AuthCallbackInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const err = searchParams.get('error');
      const errDesc = searchParams.get('error_description');
      if (err) {
        console.error('OAuth / auth redirect error');
        router.replace(`/login?error=${encodeURIComponent(errDesc || err)}`);
        return;
      }

      try {
        if (typeof window !== 'undefined') {
          const url = new URL(window.location.href);
          const code = url.searchParams.get('code');
          if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(window.location.href);
            if (exchangeError) {
              console.warn('exchangeCodeForSession (on peut déjà avoir une session):', exchangeError.message);
            }
          }
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

        if (sessionError || !session) {
          console.error('Auth callback session:', sessionError?.message ?? 'session manquante');
          router.replace('/login?error=verification_failed');
          return;
        }

        await ensurePublicUserProfile(supabase, session.user);

        const { data: profile, error: profileErr } = await supabase
          .from('users')
          .select('needs_arena_username')
          .eq('id', session.user.id)
          .maybeSingle();

        if (!profileErr && profile?.needs_arena_username === true) {
          router.replace('/onboarding');
          return;
        }

        const next = searchParams.get('next') || '/feed';
        router.replace(next.startsWith('/') ? next : '/feed');
      } catch {
        console.error('Auth callback: erreur inattendue');
        router.replace('/login?error=verification_failed');
      }
    };

    void handleCallback();
  }, [router, searchParams]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        <p className="font-semibold text-white">Vérification en cours...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
        </div>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
```

### 4.1 Flux callback décortiqué

1. **Erreur OAuth** (`error`, `error_description` query) → `/login?error=…`
2. **Code PKCE** présent → `exchangeCodeForSession(window.location.href)` (erreur loguée en warn, non bloquante)
3. **`getSession()`** — échec → `/login?error=verification_failed`
4. **`ensurePublicUserProfile`** — INSERT client si profil absent
5. **`needs_arena_username === true`** → `/onboarding`
6. **Sinon** → `searchParams.next` ou `/feed`

**Points sensibles refonte :**
- Pas de branche spécifique Google vs Apple vs Magic Link — même handler
- `next` lu depuis query **après** échange ; OAuth Google ne passe pas `next` dans `redirectTo` actuellement
- Double appel possible `ensurePublicUserProfile` (callback + AuthContext `onAuthStateChange`)

---

## 5. Onboarding — mécanique validation pseudo (sans JSX visuel)

**Fichier :** `app/onboarding/page.tsx` — logique React uniquement

### 5.1 Types & état

```typescript
type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

const [rawInput, setRawInput] = useState('');
const [availability, setAvailability] = useState<Availability>('idle');
const [submitting, setSubmitting] = useState(false);
const [submitError, setSubmitError] = useState<string | null>(null);
const [initialUsername, setInitialUsername] = useState<string | null>(null);
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

const username = useMemo(() => sanitizeArenaUsernameInput(rawInput), [rawInput]);
```

### 5.2 Effects — auth, profil existant, gate onboarding

```typescript
// Charge pseudo DB actuel (évite faux "taken" si inchangé)
useEffect(() => {
  if (!user?.id) return;
  void supabase
    .from('users')
    .select('username')
    .eq('id', user.id)
    .maybeSingle()
    .then(({ data }) => {
      setInitialUsername(data?.username ?? null);
    });
}, [user?.id]);

// Redirect si non connecté
useEffect(() => {
  if (authLoading) return;
  if (!user) {
    router.replace('/login?next=/onboarding');
  }
}, [authLoading, user, router]);

// Redirect si onboarding déjà complété
useEffect(() => {
  if (!user?.id) return;
  let cancelled = false;
  void (async () => {
    const { data, error } = await supabase
      .from('users')
      .select('needs_arena_username')
      .eq('id', user.id)
      .maybeSingle();
    if (cancelled) return;
    if (error || !data) return;
    if (data.needs_arena_username === false) {
      router.replace('/feed');
    }
  })();
  return () => {
    cancelled = true;
  };
}, [user?.id, router]);
```

### 5.3 RPC `check_username_available` — debounce 320 ms

```typescript
const checkAvailability = useCallback(async (candidate: string) => {
  if (!isValidArenaUsername(candidate)) {
    setAvailability('invalid');
    return;
  }
  if (
    initialUsername &&
    candidate.toLowerCase() === String(initialUsername).toLowerCase()
  ) {
    setAvailability('free');
    return;
  }
  setAvailability('checking');
  const { data: available, error } = await supabase.rpc('check_username_available', {
    p_username: candidate,
  });
  if (error) {
    setAvailability('idle');
    return;
  }
  setAvailability(available === true ? 'free' : 'taken');
}, [initialUsername]);

useEffect(() => {
  if (debounceRef.current) clearTimeout(debounceRef.current);
  if (!username) {
    setAvailability('idle');
    return;
  }
  if (!isValidArenaUsername(username)) {
    setAvailability('invalid');
    return;
  }
  debounceRef.current = setTimeout(() => {
    void checkAvailability(username);
  }, 320);
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  };
}, [username, checkAvailability, initialUsername]);
```

### 5.4 Saisie & submit

```typescript
const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  setSubmitError(null);
  const next = sanitizeArenaUsernameInput(e.target.value);
  setRawInput(next);
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!user?.id) return;
  if (!isValidArenaUsername(username)) {
    setSubmitError(`Entre ${ARENA_USERNAME_MIN} et ${ARENA_USERNAME_MAX} caractères (lettres, chiffres, _).`);
    return;
  }
  if (availability !== 'free') {
    setSubmitError('Ce nom est indisponible ou encore en vérification.');
    return;
  }
  setSubmitting(true);
  setSubmitError(null);
  const { error } = await supabase
    .from('users')
    .update({
      username,
      needs_arena_username: false,
    })
    .eq('id', user.id);
  setSubmitting(false);
  if (error) {
    if (error.code === '23505' || error.message?.toLowerCase().includes('unique')) {
      setSubmitError('Ce nom vient d’être pris. Choisis-en un autre.');
      setAvailability('taken');
    } else {
      setSubmitError(error.message || 'Enregistrement impossible.');
    }
    return;
  }
  router.replace('/feed');
};

const canSubmit =
  Boolean(user) &&
  isValidArenaUsername(username) &&
  availability === 'free' &&
  !submitting;
```

### 5.5 Helpers importés — `lib/arena-onboarding.ts`

```typescript
export const ARENA_USERNAME_MIN = 3;
export const ARENA_USERNAME_MAX = 28;

export function sanitizeArenaUsernameInput(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, ARENA_USERNAME_MAX)
    .toLowerCase();
}

export function isValidArenaUsername(username: string): boolean {
  const n = username.length;
  if (n < ARENA_USERNAME_MIN || n > ARENA_USERNAME_MAX) return false;
  return /^[a-zA-Z0-9_]+$/.test(username);
}
```

---

## 6. Chaîne OAuth complète (référence Architecte)

```
[Login/Signup UI]
    │
    ├─ Email signup ──► signUp() ──► emailRedirectTo: /auth/callback
    ├─ Google ────────► signInWithOAuth({ provider: 'google', redirectTo: /auth/callback })
    ├─ Apple (à ajouter) ──► signInWithOAuth({ provider: 'apple', redirectTo: /auth/callback?next=… })
    └─ Magic Link (à ajouter) ──► signInWithOtp({ email }) ──► redirectTo: /auth/callback
                │
                ▼
        Supabase Auth (PKCE code in URL)
                │
                ▼
        /auth/callback
        exchangeCodeForSession(href)
        getSession()
        ensurePublicUserProfile()  ← purge prévue
        needs_arena_username ? /onboarding : next|/feed
                │
                ▼
        middleware.ts (needs_arena_username gate sur /feed|/live|/arena)
```

---

**Fin du rapport — extraction brute, zéro modification.**
