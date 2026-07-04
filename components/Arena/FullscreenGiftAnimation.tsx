'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Image from 'next/image';
import { useArenaVolatileStore, type ArenaBigGiftPayload } from '@/lib/stores/arenaVolatileStore';

const ANIM_MS = 4000;

export function FullscreenGiftAnimation() {
  const queue = useArenaVolatileStore((s) => s.bigGiftQueue);
  const shift = useArenaVolatileStore((s) => s.shiftBigGift);
  const [activeGift, setActiveGift] = useState<ArenaBigGiftPayload | null>(null);

  // Moteur FIFO : Traitement séquentiel de la file d'attente
  useEffect(() => {
    if (!activeGift && queue.length > 0) {
      setActiveGift(queue[0]);
      shift();
    }
  }, [activeGift, queue, shift]);

  // Gestion de la durée de vie du composant actif
  useEffect(() => {
    if (!activeGift) return;
    const timer = window.setTimeout(() => {
      setActiveGift(null);
    }, ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [activeGift]);

  if (!activeGift) return null;

  // Cible l'anomalie d'extension (.png.png) relevée dans l'audit R.1
  const imageSrc = `/gifts/${activeGift.giftTypeId}.png.png`;

  return (
    <AnimatePresence>
      <motion.div
        key={activeGift.queueId}
        role="dialog"
        aria-modal="true"
        className="pointer-events-none fixed inset-0 z-[21000] flex flex-col items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        {/* Voile cinématographique pour faire ressortir l'actif 3D */}
        <div className="absolute inset-0 bg-black/65 backdrop-blur-[3px]" />

        <motion.div
          className="relative z-10 flex flex-col items-center justify-center gap-8 w-full px-4"
          initial={{ scale: 0.1, y: 150, rotate: -25 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
          transition={{ type: 'spring', stiffness: 140, damping: 14, mass: 1.2 }}
        >
          {/* Rendu Physique de l'Asset Haute Définition */}
          <motion.div
            className="relative h-[40vh] w-[40vh] max-h-[400px] max-w-[400px] drop-shadow-[0_20px_60px_rgba(251,191,36,0.6)]"
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <Image
              src={imageSrc}
              alt={activeGift.label}
              fill
              className="object-contain"
              sizes="(max-width: 768px) 50vw, 400px"
              priority
            />
          </motion.div>

          {/* Typographie Premium Glass */}
          <motion.div
            className="text-center"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            <p className="bg-black/50 px-8 py-3 rounded-full border border-white/20 backdrop-blur-md text-xl md:text-2xl font-black text-white shadow-2xl">
              <span className="text-amber-400 drop-shadow-md">{activeGift.senderName}</span> offre {activeGift.label} !
            </p>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
