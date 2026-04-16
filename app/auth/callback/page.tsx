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
        console.error('OAuth / auth redirect error:', err, errDesc);
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
          console.error('Auth callback session:', sessionError);
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
      } catch (e) {
        console.error('Auth callback:', e);
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
