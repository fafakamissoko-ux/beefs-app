'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useArenaVolatileStore, type ArenaBigGiftPayload } from '@/lib/stores/arenaVolatileStore';

const ANIM_MS = 4000;

type GiftPunchlineTextToken = { type: 'text'; value: string };
type GiftPunchlineVariableToken = {
  type: 'variable';
  value: string;
  role: 'sender' | 'recipient';
};
export type GiftPunchlineToken = GiftPunchlineTextToken | GiftPunchlineVariableToken;

export function tokenizeGiftMessageTemplate(
  messageTemplate: string,
  senderName: string,
  recipientName: string,
): GiftPunchlineToken[] {
  const tokens: GiftPunchlineToken[] = [];
  let cursor = 0;

  while (cursor < messageTemplate.length) {
    const senderIdx = messageTemplate.indexOf('{sender}', cursor);
    const recipientIdx = messageTemplate.indexOf('{recipient}', cursor);

    let nextIdx = messageTemplate.length;
    let nextRole: 'sender' | 'recipient' | null = null;

    if (senderIdx !== -1 && senderIdx < nextIdx) {
      nextIdx = senderIdx;
      nextRole = 'sender';
    }
    if (recipientIdx !== -1 && recipientIdx < nextIdx) {
      nextIdx = recipientIdx;
      nextRole = 'recipient';
    }

    if (nextRole === null) {
      const rest = messageTemplate.slice(cursor);
      if (rest.length > 0) {
        tokens.push({ type: 'text', value: rest });
      }
      break;
    }

    if (nextIdx > cursor) {
      tokens.push({ type: 'text', value: messageTemplate.slice(cursor, nextIdx) });
    }

    tokens.push({
      type: 'variable',
      value: nextRole === 'sender' ? senderName : recipientName,
      role: nextRole,
    });
    cursor = nextIdx + (nextRole === 'sender' ? '{sender}'.length : '{recipient}'.length);
  }

  return tokens;
}

export function FullscreenGiftAnimation() {
  const queue = useArenaVolatileStore((s) => s.bigGiftQueue);
  const shift = useArenaVolatileStore((s) => s.shiftBigGift);
  const [activeGift, setActiveGift] = useState<ArenaBigGiftPayload | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);

  // Moteur FIFO : Traitement séquentiel de la file d'attente
  useEffect(() => {
    if (!activeGift && queue.length > 0) {
      setActiveGift(queue[0]);
      shift();
    }
  }, [activeGift, queue, shift]);

  // Gestion du chrono de vie (démarre UNIQUEMENT quand l'image est chargée à 100%)
  useEffect(() => {
    if (!activeGift || !imgLoaded) return;
    const timer = window.setTimeout(() => {
      setActiveGift(null);
      setImgLoaded(false); // Reset pour le cadeau suivant
    }, ANIM_MS);
    return () => window.clearTimeout(timer);
  }, [activeGift, imgLoaded]);

  if (!activeGift) return null;

  // Cible l'actif physique ultra-léger
  const imageSrc = `/gifts/${activeGift.giftTypeId}.webp`;

  const renderPunchline = () => {
    if (!activeGift.messageTemplate) return null;

    const parts = activeGift.messageTemplate.split(/(\{sender\}|\{recipient\})/g);

    return (
      <p className="bg-black/50 px-6 py-3 rounded-[2rem] border border-white/20 backdrop-blur-md text-lg md:text-xl font-black text-white shadow-2xl text-center leading-snug break-words min-w-0 whitespace-pre-wrap max-w-full">
        {parts.map((part, i) => {
          if (part === '{sender}') {
            return (
              <span key={i} className="text-amber-400 drop-shadow-md uppercase">
                {activeGift.senderName}
              </span>
            );
          }
          if (part === '{recipient}') {
            return (
              <span key={i} className="text-cyan-400 drop-shadow-md uppercase">
                {activeGift.recipientName}
              </span>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </p>
    );
  };

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
          className="relative z-10 flex flex-col items-center justify-center gap-6 w-full px-4"
          initial={{ scale: 0.1, y: 150, rotate: -25 }}
          animate={{ scale: 1, y: 0, rotate: 0 }}
          exit={{ scale: 1.2, opacity: 0, filter: 'blur(10px)' }}
          transition={{ type: 'spring', stiffness: 140, damping: 14, mass: 1.2 }}
        >
          {/* Rendu Physique de l'Asset (Masqué tant qu'il charge) */}
          <motion.div
            className="relative h-[40vh] w-[40vh] max-h-[400px] max-w-[400px] drop-shadow-[0_20px_60px_rgba(251,191,36,0.6)]"
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          >
            <img
              src={imageSrc}
              alt={activeGift.label}
              onLoad={() => setImgLoaded(true)}
              className={`absolute inset-0 h-full w-full object-contain transition-opacity duration-300 ${
                imgLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </motion.div>

          {/* Typographie Premium Glass */}
          {imgLoaded && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.5 }}
              className="max-w-[90vw]"
            >
              {renderPunchline()}
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
