'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase/client';
import {
  ARENA_USERNAME_MAX,
  ARENA_USERNAME_MIN,
  isValidArenaUsername,
  sanitizeArenaUsernameInput,
} from '@/lib/arena-onboarding';

export type Step = 'welcome' | 'identity' | 'bio' | 'complete';

export type UsernameAvailability = 'idle' | 'checking' | 'free' | 'taken' | 'invalid';

const STEPS: Step[] = ['welcome', 'identity', 'bio', 'complete'];

const USERNAME_DEBOUNCE_MS = 320;

async function uploadAvatar(userId: string, file: File): Promise<string> {
  const ts = Date.now();
  const path = `${userId}/${userId}_${ts}.jpg`;
  const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
    upsert: true,
    contentType: file.type || 'image/jpeg',
  });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  return data.publicUrl;
}

export function useOnboarding() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('welcome');
  const [rawUsernameInput, setRawUsernameInput] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [usernameAvailability, setUsernameAvailability] = useState<UsernameAvailability>('idle');
  const [initialUsername, setInitialUsername] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarPreviewRef = useRef<string | null>(null);

  const username = useMemo(() => sanitizeArenaUsernameInput(rawUsernameInput), [rawUsernameInput]);

  const loadProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('users')
      .select('username, display_name, bio, avatar_url')
      .eq('id', userId)
      .maybeSingle();

    if (!data) return;

    setInitialUsername(data.username ?? null);
    if (data.display_name) setDisplayName(data.display_name);
    if (data.bio) setBio(data.bio);
    if (data.avatar_url) setAvatarPreview(data.avatar_url);

    const existing = data.username ?? '';
    if (existing && !existing.startsWith('temp_')) {
      setRawUsernameInput(existing);
    }
  }, []);

  const checkUsernameAvailability = useCallback(
    async (candidate: string) => {
      if (!isValidArenaUsername(candidate)) {
        setUsernameAvailability('invalid');
        return;
      }
      if (initialUsername && candidate.toLowerCase() === String(initialUsername).toLowerCase()) {
        setUsernameAvailability('free');
        return;
      }
      setUsernameAvailability('checking');
      const { data: available, error } = await supabase.rpc('check_username_available', {
        p_username: candidate,
      });
      if (error) {
        setUsernameAvailability('idle');
        return;
      }
      setUsernameAvailability(available === true ? 'free' : 'taken');
    },
    [initialUsername],
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!username) {
      setUsernameAvailability('idle');
      return;
    }
    if (!isValidArenaUsername(username)) {
      setUsernameAvailability('invalid');
      return;
    }
    debounceRef.current = setTimeout(() => {
      void checkUsernameAvailability(username);
    }, USERNAME_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, checkUsernameAvailability]);

  useEffect(() => {
    avatarPreviewRef.current = avatarPreview;
  }, [avatarPreview]);

  useEffect(() => {
    return () => {
      const preview = avatarPreviewRef.current;
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    };
  }, []);

  const setUsernameInput = useCallback((raw: string) => {
    setSubmitError(null);
    setRawUsernameInput(sanitizeArenaUsernameInput(raw));
  }, []);

  const setAvatarFromFile = useCallback((file: File | null) => {
    setSubmitError(null);
    if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    if (!file) {
      setAvatarFile(null);
      setAvatarPreview(null);
      return;
    }
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }, [avatarPreview]);

  const identityValid =
    displayName.trim().length > 0 &&
    isValidArenaUsername(username) &&
    usernameAvailability === 'free';

  const bioValid = bio.trim().length > 0;

  const canProceedToNextStep = useMemo((): boolean => {
    switch (step) {
      case 'welcome':
        return true;
      case 'identity':
        return identityValid;
      case 'bio':
        return bioValid;
      case 'complete':
        return identityValid && bioValid && !submitting;
      default:
        return false;
    }
  }, [step, identityValid, bioValid, submitting]);

  const nextStep = useCallback(() => {
    if (!canProceedToNextStep) return;
    const idx = STEPS.indexOf(step);
    if (idx < 0 || idx >= STEPS.length - 1) return;
    setStep(STEPS[idx + 1]!);
  }, [canProceedToNextStep, step]);

  const prevStep = useCallback(() => {
    const idx = STEPS.indexOf(step);
    if (idx <= 0) return;
    setStep(STEPS[idx - 1]!);
  }, [step]);

  const submitOnboarding = useCallback(
    async (userId: string) => {
      if (!userId) return;

      const trimmedDisplayName = displayName.trim();
      const trimmedBio = bio.trim();

      if (!trimmedDisplayName) {
        setSubmitError('Le nom affiché est obligatoire.');
        setStep('identity');
        return;
      }
      if (!isValidArenaUsername(username)) {
        setSubmitError(
          `Entre ${ARENA_USERNAME_MIN} et ${ARENA_USERNAME_MAX} caractères (lettres, chiffres, _).`,
        );
        setStep('identity');
        return;
      }
      if (usernameAvailability !== 'free') {
        setSubmitError('Ce nom est indisponible ou encore en vérification.');
        setStep('identity');
        return;
      }
      if (!trimmedBio) {
        setSubmitError('La bio est obligatoire.');
        setStep('bio');
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        let avatarUrl: string | undefined;
        if (avatarFile) {
          avatarUrl = await uploadAvatar(userId, avatarFile);
        }

        const payload: {
          username: string;
          display_name: string;
          bio: string;
          needs_arena_username: boolean;
          avatar_url?: string;
        } = {
          username,
          display_name: trimmedDisplayName,
          bio: trimmedBio,
          needs_arena_username: false,
        };
        if (avatarUrl) payload.avatar_url = avatarUrl;

        const { error } = await supabase.from('users').update(payload).eq('id', userId);

        if (error) {
          if (error.code === '23505' || error.message?.toLowerCase().includes('unique')) {
            setSubmitError('Ce nom vient d’être pris. Choisis-en un autre.');
            setUsernameAvailability('taken');
            setStep('identity');
          } else {
            setSubmitError(error.message || 'Enregistrement impossible.');
          }
          return;
        }

        setStep('complete');
        router.replace('/feed');
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Upload avatar impossible.');
      } finally {
        setSubmitting(false);
      }
    },
    [avatarFile, bio, displayName, router, username, usernameAvailability],
  );

  return {
    step,
    setStep,
    nextStep,
    prevStep,
    canProceedToNextStep,
    avatarFile,
    avatarPreview,
    setAvatarFromFile,
    displayName,
    setDisplayName,
    rawUsernameInput,
    username,
    setUsernameInput,
    bio,
    setBio,
    usernameAvailability,
    initialUsername,
    submitting,
    submitError,
    setSubmitError,
    loadProfile,
    submitOnboarding,
    constants: {
      ARENA_USERNAME_MIN,
      ARENA_USERNAME_MAX,
    },
  };
}
