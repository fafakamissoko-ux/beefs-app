'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { BeefLogo } from '@/components/BeefLogo';

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
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
      clearTimeout(timer);
    };
  }, [router]);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden bg-slate-950/90 backdrop-blur-3xl">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(0,240,255,0.05)_0%,transparent_70%)]" />

      {/* Conteneur Premium Glass Lourd */}
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        className="relative z-10 flex flex-col items-center justify-center p-8 sm:p-12 rounded-3xl bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.8)]"
      >
        <div className="relative mb-6 flex items-center justify-center">
          {/* Anneau de chargement Pulsar */}
          <div className="absolute inset-0 rounded-[2.5rem] border-2 border-cyan-500/20 shadow-[0_0_15px_rgba(0,240,255,0.2)] animate-ping" />
          <div className="relative z-10 rounded-[2.5rem] bg-slate-900/50 p-2 border border-white/5 shadow-inner">
            <BeefLogo size={80} />
          </div>
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-1 text-4xl font-black uppercase tracking-widest text-white drop-shadow-lg"
        >
          Beefs
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-cyan-400/80 text-[10px] sm:text-xs font-bold uppercase tracking-[0.25em] text-center"
        >
          L&apos;Agora des Règlements de Comptes
        </motion.p>
      </motion.div>
    </div>
  );
}
