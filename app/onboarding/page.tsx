'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame,
  Swords,
  Shield,
  Sparkles,
  Camera,
  Loader2,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useOnboarding } from './useOnboarding';

const WELCOME_SLIDES = [
  {
    Icon: Flame,
    title: "Bienvenue dans l'Agora.",
    text: 'Explore le feed, découvre les conflits en temps réel et prends parti dans les règlements de comptes.',
    color: 'from-brand-400 to-brand-500',
  },
  {
    Icon: Swords,
    title: 'Ne fuis plus le débat.',
    text: "Lance un Call Out, convoque tes adversaires en direct dans l'Agora et fais entendre ta vérité, en vocal ou face caméra.",
    color: 'from-orange-500 to-brand-500',
  },
  {
    Icon: Shield,
    title: "L'arbitre du conflit.",
    text: 'Pas de chaos. Chaque règlement de compte est encadré par un Ref qui gère les temps de parole, sanctionne les débordements et contrôle le direct.',
    color: 'from-brand-500 to-yellow-500',
  },
  {
    Icon: Sparkles,
    title: 'Bâtis ta légende.',
    text: "Gagne le vote populaire, fais grimper ton prestige et impose ton Aura au sommet de l'Agora.",
    color: 'from-yellow-500 to-brand-500',
  },
] as const;

const stepVariants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -24 },
};

const inputClass =
  'w-full bg-black/20 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/40 focus:outline-none focus:border-brand-500 transition-colors';

const btnClass =
  'w-full bg-gradient-to-r from-brand-500 to-orange-500 text-white font-bold py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center';

export default function OnboardingPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const {
    step,
    nextStep,
    canProceedToNextStep,
    avatarPreview,
    setAvatarFromFile,
    displayName,
    setDisplayName,
    rawUsernameInput,
    setUsernameInput,
    bio,
    setBio,
    usernameAvailability,
    submitting,
    submitError,
    loadProfile,
    submitOnboarding,
    constants: { ARENA_USERNAME_MIN, ARENA_USERNAME_MAX },
  } = useOnboarding();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?next=/onboarding');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    if (!user?.id) return;
    void loadProfile(user.id);
  }, [user?.id, loadProfile]);

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

  const handleWelcomeAction = () => {
    if (currentSlide < WELCOME_SLIDES.length - 1) {
      setCurrentSlide((s) => s + 1);
    } else {
      nextStep();
    }
  };

  const usernameHint = (() => {
    if (!rawUsernameInput) return null;
    if (usernameAvailability === 'invalid') {
      return `Entre ${ARENA_USERNAME_MIN} et ${ARENA_USERNAME_MAX} caractères (a–z, 0–9, _).`;
    }
    if (usernameAvailability === 'checking') return 'Vérification…';
    if (usernameAvailability === 'free') return 'Disponible';
    if (usernameAvailability === 'taken') return 'Déjà pris';
    return null;
  })();

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const slide = WELCOME_SLIDES[currentSlide]!;
  const SlideIcon = slide.Icon;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-[2.5rem] border border-white/10 bg-slate-950/75 p-6 shadow-2xl backdrop-blur-md sm:p-8">
        <AnimatePresence mode="wait">
          {step === 'welcome' && (
            <motion.div
              key="welcome"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex flex-col"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentSlide}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.22 }}
                  className="flex flex-col items-center text-center"
                >
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                    className={`mb-6 rounded-full bg-gradient-to-br p-6 shadow-2xl ${slide.color}`}
                  >
                    <SlideIcon className="h-14 w-14 text-white" aria-hidden />
                  </motion.div>
                  <h2 className="mb-3 text-2xl font-black tracking-tight text-white sm:text-3xl">
                    {slide.title}
                  </h2>
                  <p className="mb-8 text-sm leading-relaxed text-white/55 sm:text-base">
                    {slide.text}
                  </p>
                </motion.div>
              </AnimatePresence>

              <div className="mb-6 flex items-center justify-center gap-2">
                {WELCOME_SLIDES.map((_, index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full transition-all ${
                      index === currentSlide
                        ? 'w-6 bg-gradient-to-r from-brand-500 to-orange-500'
                        : 'w-1.5 bg-white/20'
                    }`}
                  />
                ))}
              </div>

              <button type="button" onClick={handleWelcomeAction} className={btnClass}>
                {currentSlide === WELCOME_SLIDES.length - 1 ? 'Créer mon profil' : 'Suivant'}
              </button>
            </motion.div>
          )}

          {step === 'identity' && (
            <motion.div
              key="identity"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="mb-1 text-2xl font-black text-white">Ton identité</h2>
                <p className="text-sm text-white/50">Photo, nom affiché et pseudo d&apos;arène.</p>
              </div>

              <div className="flex flex-col items-center gap-2">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="relative flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/20 transition-colors hover:border-brand-500/50"
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
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    setAvatarFromFile(file);
                    e.target.value = '';
                  }}
                />
                <p className="text-xs text-white/40">Photo optionnelle</p>
              </div>

              <div>
                <label htmlFor="display-name" className="mb-1.5 block text-sm font-medium text-white/70">
                  Nom d&apos;affichage
                </label>
                <input
                  id="display-name"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Comment tu veux apparaître"
                  className={inputClass}
                  autoComplete="name"
                />
              </div>

              <div>
                <label htmlFor="arena-username" className="mb-1.5 block text-sm font-medium text-white/70">
                  Nom d&apos;arène
                </label>
                <div className="relative">
                  <input
                    id="arena-username"
                    type="text"
                    value={rawUsernameInput}
                    onChange={(e) => setUsernameInput(e.target.value)}
                    placeholder="ton_pseudo"
                    maxLength={ARENA_USERNAME_MAX}
                    className={`${inputClass} pr-10`}
                    autoComplete="username"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameAvailability === 'checking' && (
                      <Loader2 className="h-5 w-5 animate-spin text-white/50" />
                    )}
                    {usernameAvailability === 'free' && (
                      <CheckCircle className="h-5 w-5 text-emerald-400" />
                    )}
                    {(usernameAvailability === 'taken' || usernameAvailability === 'invalid') && (
                      <XCircle className="h-5 w-5 text-red-400" />
                    )}
                  </div>
                </div>
                {usernameHint && (
                  <p
                    className={`mt-1.5 text-sm ${
                      usernameAvailability === 'free'
                        ? 'text-emerald-400'
                        : usernameAvailability === 'taken' || usernameAvailability === 'invalid'
                          ? 'text-red-400'
                          : 'text-white/45'
                    }`}
                  >
                    {usernameHint}
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={nextStep}
                disabled={!canProceedToNextStep}
                className={btnClass}
              >
                Continuer
              </button>
            </motion.div>
          )}

          {step === 'bio' && (
            <motion.div
              key="bio"
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={{ duration: 0.28, ease: 'easeOut' }}
              className="flex flex-col gap-5"
            >
              <div>
                <h2 className="mb-1 text-2xl font-black text-white">Finalisation</h2>
                <p className="text-sm text-white/50">Dis-nous qui tu es dans l&apos;Agora.</p>
              </div>

              <div>
                <label htmlFor="bio" className="mb-1.5 block text-sm font-medium text-white/70">
                  Ta Bio
                </label>
                <textarea
                  id="bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Quels sont tes sujets de prédilection ?"
                  rows={4}
                  className={`${inputClass} resize-none`}
                />
              </div>

              {submitError && <p className="text-sm text-red-300">{submitError}</p>}

              <button
                type="button"
                onClick={() => void submitOnboarding(user.id)}
                disabled={!canProceedToNextStep || submitting}
                className={btnClass}
              >
                {submitting ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  "Entrer dans l'Agora"
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
