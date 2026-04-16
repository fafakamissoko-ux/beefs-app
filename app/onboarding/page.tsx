'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BeefLogo } from '@/components/BeefLogo';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import {
  ARENA_USERNAME_MAX,
  ARENA_USERNAME_MIN,
  isValidArenaUsername,
  sanitizeArenaUsernameInput,
} from '@/lib/arena-onboarding';

type Availability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

export default function ArenaOnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rawInput, setRawInput] = useState('');
  const [availability, setAvailability] = useState<Availability>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [initialUsername, setInitialUsername] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const username = useMemo(() => sanitizeArenaUsernameInput(rawInput), [rawInput]);

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

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?next=/onboarding');
    }
  }, [authLoading, user, router]);

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

  const availabilityLabel = (() => {
    if (!username) return null;
    if (availability === 'invalid')
      return `Entre ${ARENA_USERNAME_MIN} et ${ARENA_USERNAME_MAX} caractères (a–z, 0–9, _).`;
    if (availability === 'checking') return 'Vérification…';
    if (availability === 'free') return 'Disponible';
    if (availability === 'taken') return 'Déjà pris';
    return null;
  })();

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center px-6 py-16"
      style={{ backgroundColor: '#08080A' }}
    >
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <BeefLogo size={88} />
        </div>
        <h1 className="mb-2 text-center text-2xl font-black tracking-tight text-white sm:text-3xl">
          Choisis ton nom d&apos;arène
        </h1>
        <p className="mb-8 text-center text-sm text-white/50">
          Lettres, chiffres et underscores uniquement — {ARENA_USERNAME_MIN} à {ARENA_USERNAME_MAX}{' '}
          caractères.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="arena-username" className="sr-only">
              Nom d&apos;arène
            </label>
            <input
              id="arena-username"
              type="text"
              autoComplete="username"
              maxLength={ARENA_USERNAME_MAX}
              value={rawInput}
              onChange={handleChange}
              placeholder="ton_pseudo"
              className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3.5 text-lg font-semibold text-white outline-none ring-brand-500/40 placeholder:text-white/25 focus:border-brand-500/50 focus:ring-2"
            />
            {availabilityLabel && (
              <p
                className={`mt-2 text-sm ${
                  availability === 'free'
                    ? 'text-emerald-400'
                    : availability === 'taken' || availability === 'invalid'
                      ? 'text-red-400'
                      : 'text-white/45'
                }`}
              >
                {availabilityLabel}
              </p>
            )}
          </div>

          {submitError && <p className="text-center text-sm text-red-400">{submitError}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-xl py-3.5 text-center text-base font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40 brand-gradient"
          >
            {submitting ? 'Enregistrement…' : 'Valider'}
          </button>
        </form>
      </div>
    </div>
  );
}
