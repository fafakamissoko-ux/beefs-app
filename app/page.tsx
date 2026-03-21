'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function SplashScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    // Progress bar animation
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 2;
      });
    }, 20);

    // Auto-redirect after animation
    const redirectTimer = setTimeout(async () => {
      // Check Supabase session
      const { supabase } = await import('@/lib/supabase/client');
      const { data: { session } } = await supabase.auth.getSession();
      
      // Check if user has already seen onboarding
      const hasSeenOnboarding = localStorage.getItem('hasSeenOnboarding');

      if (session?.user) {
        // Check if user is newly created (less than 5 minutes old)
        const { data: userData } = await supabase
          .from('users')
          .select('created_at')
          .eq('id', session.user.id)
          .single();
        
        const isNewUser = userData?.created_at 
          ? (new Date().getTime() - new Date(userData.created_at).getTime()) < 5 * 60 * 1000
          : false;

        if (isNewUser && hasSeenOnboarding !== 'true') {
          router.push('/onboarding');
        } else {
          router.push('/feed'); // Redirect to Feed Découverte
        }
      } else if (hasSeenOnboarding === 'true') {
        router.push('/login');
      } else {
        router.push('/onboarding');
      }
    }, 2000);

    return () => {
      clearInterval(progressInterval);
      clearTimeout(redirectTimer);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 bg-gradient-to-br from-black via-gray-900 to-black flex flex-col items-center justify-center overflow-hidden">
      {/* Background animated gradient */}
      <div className="absolute inset-0 opacity-30">
        <motion.div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-red-500 rounded-full filter blur-3xl"
          animate={{
            scale: [1, 1.2, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-orange-500 rounded-full filter blur-3xl"
          animate={{
            scale: [1, 1.3, 1],
            opacity: [0.3, 0.5, 0.3],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: 0.5,
          }}
        />
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center">
        {/* Logo with animation */}
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 20,
            duration: 0.8,
          }}
          className="mb-8"
        >
          <div className="w-32 h-32 bg-gradient-to-br from-red-500 to-orange-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-orange-500/50">
            <svg
              width="80"
              height="80"
              viewBox="0 0 100 100"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="splashFlame" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#FFF" />
                  <stop offset="100%" stopColor="#FFF" opacity="0.8" />
                </linearGradient>
              </defs>
              <path
                d="M50 10 L35 40 L25 35 L30 60 L15 65 L35 85 L40 70 L50 90 L60 70 L65 85 L85 65 L70 60 L75 35 L65 40 L50 10Z"
                fill="url(#splashFlame)"
              />
            </svg>
          </div>
        </motion.div>

        {/* App name */}
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-6xl font-black bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent mb-2"
        >
          Beefs
        </motion.h1>

        {/* Tagline */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
          className="text-gray-400 text-lg font-semibold"
        >
          Règle tes beefs en live
        </motion.p>

        {/* Progress bar */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.9 }}
          className="w-64 h-2 bg-gray-800 rounded-full overflow-hidden mt-12"
        >
          <motion.div
            className="h-full bg-gradient-to-r from-red-500 to-orange-500"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </motion.div>
      </div>

      {/* Bottom decoration */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.2 }}
        className="absolute bottom-8 text-gray-600 text-sm"
      >
        Powered by Beefs Team
      </motion.div>
    </div>
  );
}
