'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { AuthHookState } from '@/hooks/useAuthGate';

interface ArenaAuthHookModalProps {
  authHook: AuthHookState;
  onClose: () => void;
}

export function ArenaAuthHookModal({ authHook, onClose }: ArenaAuthHookModalProps) {
  const router = useRouter();

  return (
    <motion.div
      key="arena-vip-hook"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/75 backdrop-blur-md px-4 shadow-2xl"
      onClick={() => {
        if (!authHook.mandatory) onClose();
      }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 30, rotateX: 15 }}
        animate={{ scale: 1, y: 0, rotateX: 0 }}
        exit={{ scale: 0.9, y: 30, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border border-white/10 bg-slate-950/75 p-8 text-center shadow-2xl ring-1 ring-white/20 backdrop-blur-md"
      >
        <h2 className="mb-3 font-sans text-2xl font-black uppercase italic tracking-tighter text-white drop-shadow-md">
          {authHook.title}
        </h2>

        <p className="mb-8 text-sm font-medium leading-relaxed text-gray-400">{authHook.subtitle}</p>

        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => router.push(`/signup?next=${encodeURIComponent(window.location.pathname)}`)}
            className="w-full rounded-2xl bg-white py-4 text-xs font-black uppercase tracking-widest text-black transition-all hover:scale-[1.02] hover:bg-gray-200"
          >
            Créer mon profil
          </button>

          <button
            type="button"
            onClick={() => router.push(`/login?next=${encodeURIComponent(window.location.pathname)}`)}
            className="w-full rounded-2xl border border-white/10 bg-white/5 py-4 text-xs font-bold uppercase tracking-widest text-white hover:bg-white/10"
          >
            Déjà inscrit ?
          </button>
        </div>

        {!authHook.mandatory && (
          <button
            type="button"
            onClick={onClose}
            className="mt-6 text-[10px] font-bold uppercase tracking-widest text-white/30 hover:text-white/60"
          >
            Rester en mode spectateur
          </button>
        )}
      </motion.div>
    </motion.div>
  );
}
