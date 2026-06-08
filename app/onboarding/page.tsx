'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Camera } from 'lucide-react';
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
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const username = useMemo(() => sanitizeArenaUsernameInput(rawInput), [rawInput]);

  useEffect(() => {
    if (!user?.id) return;
    void supabase
      .from('users')
      .select('username, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setInitialUsername(data?.username ?? null);
        if (data?.avatar_url) setAvatarPreview(data.avatar_url);
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

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const uploadAvatarIfNeeded = async (userId: string): Promise<string | null> => {
    if (!avatarFile) return null;
    const ts = Date.now();
    const path = `${userId}/${userId}_${ts}.jpg`;
    const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, {
      upsert: true,
      contentType: avatarFile.type || 'image/jpeg',
    });
    if (upErr) throw upErr;
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    return data.publicUrl;
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
    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        avatarUrl = await uploadAvatarIfNeeded(user.id);
      }

      const payload: { username: string; needs_arena_username: boolean; avatar_url?: string } = {
        username,
        needs_arena_username: false,
      };
      if (avatarUrl) payload.avatar_url = avatarUrl;

      const { error } = await supabase.from('users').update(payload).eq('id', user.id);
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
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Upload avatar impossible.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    Boolean(user) &&
    isValidArenaUsername(username) &&
    availability === 'free' &&
    !submitting;

  const inputBorderClass = (() => {
    if (availability === 'free') return 'border-green-500 focus:border-green-500';
    if (availability === 'taken' || availability === 'invalid') return 'border-red-500 focus:border-red-500';
    return 'border-white/10 focus:border-white/25';
  })();

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
    <div className="flex min-h-[100dvh] items-center justify-center bg-transparent px-4 py-16">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md"
      >
        <div className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-md">
          <div className="mb-8 flex justify-center">
            <BeefLogo size={64} />
          </div>
          <h1 className="mb-2 text-center text-2xl font-black tracking-tight text-white sm:text-3xl">
            Choisis ton nom d&apos;arène
          </h1>
          <p className="mb-8 text-center text-sm text-white/50">
            Lettres, chiffres et underscores — {ARENA_USERNAME_MIN} à {ARENA_USERNAME_MAX} caractères.
          </p>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => avatarInputRef.current?.click()}
                className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/10"
                aria-label="Choisir une photo de profil"
              >
                {avatarPreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
                ) : (
                  <Camera className="h-7 w-7 text-white/40" />
                )}
              </button>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-white/40">Photo optionnelle</p>
            </div>

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
                className={`w-full rounded-full border bg-white/5 px-6 py-4 text-lg font-semibold text-white outline-none ring-0 placeholder:text-white/25 ${inputBorderClass}`}
              />
              {availabilityLabel && (
                <p
                  className={`mt-2 text-center text-sm ${
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

            {submitError && (
              <p className="text-center text-sm text-red-400">{submitError}</p>
            )}

            <button
              type="submit"
              disabled={!canSubmit}
              className="w-full rounded-full py-3.5 text-center text-base font-bold text-black transition-opacity disabled:cursor-not-allowed disabled:opacity-40 brand-gradient"
            >
              {submitting ? 'Enregistrement…' : 'Rejoindre l\'Arène'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
