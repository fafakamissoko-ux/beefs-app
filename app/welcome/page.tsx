'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Shield, Trophy, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface Slide {
  id: number;
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
}

const slides: Slide[] = [
  {
    id: 1,
    icon: <Flame className="w-20 h-20" />,
    title: 'Règle tes beefs en live',
    description:
      'Résous tes conflits en direct avec un médiateur professionnel. Fini les non-dits, place à la clarté.',
    color: 'from-brand-400 to-brand-500',
  },
  {
    id: 2,
    icon: <Shield className="w-20 h-20" />,
    title: 'Médiateur certifié',
    description:
      'Un médiateur neutre guide la discussion pour garantir un échange respectueux et constructif.',
    color: 'from-brand-500 to-yellow-500',
  },
  {
    id: 3,
    icon: <Trophy className="w-20 h-20" />,
    title: 'Gagne des points',
    description: 'Participe, regarde des beefs, envoie des gifts. Accumule des points et deviens Premium!',
    color: 'from-yellow-500 to-brand-500',
  },
];

/** Carrousel d’introduction (ancien `/onboarding`) — le sas pseudo OAuth vit sur `/onboarding`. */
export default function WelcomePage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from('users')
        .select('needs_arena_username')
        .eq('id', user.id)
        .maybeSingle();
      if (data?.needs_arena_username === true) {
        router.replace('/onboarding');
      } else {
        router.replace('/feed');
      }
    })();
  }, [user, router]);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      setDirection(1);
      setCurrentSlide(currentSlide + 1);
    } else {
      completeOnboarding();
    }
  };

  const handlePrevious = () => {
    if (currentSlide > 0) {
      setDirection(-1);
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleSkip = (permanent: boolean = false) => {
    if (permanent) {
      localStorage.setItem('hasSeenOnboarding', 'true');
      localStorage.removeItem('onboardingReminder');
    } else {
      const reminderDate = new Date();
      reminderDate.setDate(reminderDate.getDate() + 7);
      localStorage.setItem('onboardingReminder', reminderDate.toISOString());
      localStorage.setItem('hasSeenOnboarding', 'true');
    }
    router.push('/signup');
  };

  const completeOnboarding = () => {
    localStorage.setItem('hasSeenOnboarding', 'true');
    localStorage.removeItem('onboardingReminder');
    router.push('/signup');
  };

  const slide = slides[currentSlide];

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden bg-obsidian">
      <div className="absolute top-4 right-4 z-50">
        <div className="relative group">
          <button
            type="button"
            onClick={() => handleSkip(false)}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 transition-colors hover:text-white"
          >
            <span className="font-semibold">Passer</span>
            <X className="h-5 w-5" />
          </button>
          <div className="invisible absolute right-0 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-800 opacity-0 shadow-xl transition-all group-hover:visible group-hover:opacity-100">
            <button
              type="button"
              onClick={() => handleSkip(false)}
              className="w-full rounded-t-lg px-4 py-2 text-left text-white transition-colors hover:bg-gray-700"
            >
              <div className="font-semibold">Passer (7 jours)</div>
              <div className="text-xs text-gray-400">On te le rappellera</div>
            </button>
            <button
              type="button"
              onClick={() => handleSkip(true)}
              className="w-full rounded-b-lg px-4 py-2 text-left text-white transition-colors hover:bg-gray-700"
            >
              <div className="font-semibold">Ne plus afficher</div>
              <div className="text-xs text-gray-400">Définitivement</div>
            </button>
          </div>
        </div>
      </div>

      <div className="relative flex flex-1 flex-col items-center justify-center px-6">
        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 300, damping: 30 },
              opacity: { duration: 0.2 },
            }}
            className="flex max-w-md flex-col items-center text-center"
          >
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 20,
              }}
              className={`mb-8 rounded-full bg-gradient-to-br p-8 shadow-2xl ${slide.color}`}
            >
              <div className="text-white">{slide.icon}</div>
            </motion.div>

            <h2 className="mb-4 text-4xl font-black text-white sm:text-5xl">{slide.title}</h2>

            <p className="text-lg leading-relaxed text-gray-400 sm:text-xl">{slide.description}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="px-6 pb-8">
        <div className="mb-8 flex items-center justify-center gap-2">
          {slides.map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => {
                setDirection(index > currentSlide ? 1 : -1);
                setCurrentSlide(index);
              }}
              className="relative"
            >
              <div
                className={`h-2 rounded-full transition-all ${
                  index === currentSlide ? 'brand-gradient w-8' : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-4 sm:flex-row">
          {currentSlide > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              type="button"
              onClick={handlePrevious}
              className="w-full px-6 py-3 font-semibold text-gray-400 transition-colors hover:text-white sm:w-auto"
            >
              Retour
            </motion.button>
          )}

          <motion.button
            type="button"
            onClick={handleNext}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex w-full flex-1 items-center justify-center gap-2 rounded-full px-8 py-4 font-bold text-black shadow-xl shadow-brand-500/30 brand-gradient transition-all hover:opacity-90 sm:w-auto"
          >
            <span>{currentSlide === slides.length - 1 ? 'Commencer' : 'Suivant'}</span>
            <ChevronRight className="h-5 w-5" />
          </motion.button>
        </div>

        {currentSlide === slides.length - 1 && !user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-6 text-center"
          >
            <p className="text-gray-400">
              Déjà un compte?{' '}
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="font-semibold text-brand-400 hover:text-brand-300"
              >
                Se connecter
              </button>
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
