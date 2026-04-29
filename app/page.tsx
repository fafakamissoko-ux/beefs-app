'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BeefLogo } from '@/components/BeefLogo';

export default function SplashScreen() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setProgress((p) => (p >= 100 ? 100 : p + 2)), 20);
    const timer = setTimeout(async () => {
      const { supabase } = await import('@/lib/supabase/client');
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) {
        const { data } = await supabase
          .from('users')
          .select('needs_arena_username')
          .eq('id', session.user.id)
          .maybeSingle();
        if (data?.needs_arena_username) router.push('/onboarding');
        else router.push('/feed');
      } else {
        router.push('/feed');
      }
    }, 1500);
    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-[#050505]">
      <div className="absolute inset-0 animate-pulse bg-[radial-gradient(circle_at_center,rgba(162,0,255,0.15)_0%,transparent_60%)]" />
      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="relative mb-6"
        >
          <div className="absolute inset-0 animate-pulse rounded-full bg-plasma-500/20 blur-2xl" />
          <BeefLogo size={100} className="drop-shadow-[0_0_30px_rgba(162,0,255,0.8)]" />
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-2 pr-2 text-5xl font-black uppercase italic tracking-tighter text-white drop-shadow-md md:text-7xl"
        >
          Beefs
        </motion.h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-plasma-400 text-[11px] md:text-sm font-black uppercase tracking-[0.2em] shadow-glow-plasma mb-12 text-center px-4"
        >
          L&apos;Agora du règlement de comptes
        </motion.p>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="h-1 w-48 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full bg-gradient-to-r from-plasma-600 to-cyan-400"
            style={{ width: `${progress}%` }}
          />
        </motion.div>
      </div>
    </div>
  );
}
