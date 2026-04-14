'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, X, Users, Shield, Trophy, Flame } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

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
    description: 'Résous tes conflits en direct avec un médiateur professionnel. Fini les non-dits, place à la clarté.',
    color: 'from-brand-400 to-brand-500',
  },
  {
    id: 2,
    icon: <Shield className="w-20 h-20" />,
    title: 'Médiateur certifié',
    description: 'Un médiateur neutre guide la discussion pour garantir un échange respectueux et constructif.',
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

export default function OnboardingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);

  // If user is already logged in, redirect to feed
  useEffect(() => {
    if (user) {
      router.push('/feed');
    }
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
      // Skip temporairement - rappeler dans 7 jours
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
    enter: (direction: number) => ({
      x: direction > 0 ? 1000 : -1000,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction < 0 ? 1000 : -1000,
      opacity: 0,
    }),
  };

  return (
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      {/* Skip button with dropdown */}
      <div className="absolute top-4 right-4 z-50">
        <div className="relative group">
          <button
            onClick={() => handleSkip(false)}
            className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <span className="font-semibold">Passer</span>
            <X className="w-5 h-5" />
          </button>
          {/* Dropdown menu on hover */}
          <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
            <button
              onClick={() => handleSkip(false)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 rounded-t-lg transition-colors"
            >
              <div className="font-semibold">Passer (7 jours)</div>
              <div className="text-xs text-gray-400">On te le rappellera</div>
            </button>
            <button
              onClick={() => handleSkip(true)}
              className="w-full text-left px-4 py-2 text-white hover:bg-gray-700 rounded-b-lg transition-colors"
            >
              <div className="font-semibold">Ne plus afficher</div>
              <div className="text-xs text-gray-400">Définitivement</div>
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
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
            className="flex flex-col items-center text-center max-w-md"
          >
            {/* Icon */}
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: 'spring',
                stiffness: 260,
                damping: 20,
              }}
              className={`mb-8 p-8 rounded-full bg-gradient-to-br ${slide.color} shadow-2xl`}
            >
              <div className="text-white">{slide.icon}</div>
            </motion.div>

            {/* Title */}
            <h2 className="text-4xl sm:text-5xl font-black text-white mb-4">
              {slide.title}
            </h2>

            {/* Description */}
            <p className="text-gray-400 text-lg sm:text-xl leading-relaxed">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom navigation */}
      <div className="pb-8 px-6">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                setDirection(index > currentSlide ? 1 : -1);
                setCurrentSlide(index);
              }}
              className="relative"
            >
              <div
                className={`w-2 h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? 'brand-gradient w-8'
                    : 'bg-gray-600 hover:bg-gray-500'
                }`}
              />
            </button>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {/* Previous (only show if not first slide) */}
          {currentSlide > 0 && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={handlePrevious}
              className="w-full sm:w-auto px-6 py-3 text-gray-400 hover:text-white font-semibold transition-colors"
            >
              Retour
            </motion.button>
          )}

          {/* Next / Get Started */}
          <motion.button
            onClick={handleNext}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="flex-1 w-full sm:w-auto flex items-center justify-center gap-2 brand-gradient hover:opacity-90 text-black font-bold px-8 py-4 rounded-full shadow-xl shadow-brand-500/30 transition-all"
          >
            <span>
              {currentSlide === slides.length - 1 ? 'Commencer' : 'Suivant'}
            </span>
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        </div>

        {/* Login link (only show on last slide if NOT logged in) */}
        {currentSlide === slides.length - 1 && !user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-center mt-6"
          >
            <p className="text-gray-400">
              Déjà un compte?{' '}
              <button
                onClick={() => router.push('/login')}
                className="text-brand-400 hover:text-brand-300 font-semibold"
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
