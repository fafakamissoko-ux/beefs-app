'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';

const BIG_GIFT_MIN = 500;
const ANIM_MS = 4500;

export type ArenaBigGiftPayload = {
  cost: number;
  label: string;
  emoji: string;
  giftTypeId: string;
  senderName: string;
};

type ActiveAnim = (ArenaBigGiftPayload & { key: string }) | null;

function themeForGiftId(id: string): 'meteor' | 'goat' | 'wolf' | 'volcano' | 'champion' | 'burst' {
  if (id === 'meteor') return 'meteor';
  if (id === 'goat') return 'goat';
  if (id === 'wolf') return 'wolf';
  if (id === 'volcano') return 'volcano';
  if (id === 'champion') return 'champion';
  return 'burst';
}

function Particles({ count, color }: { count: number; color: string }) {
  const seeds = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        i,
        x: (Math.random() - 0.5) * 200,
        y: (Math.random() - 0.5) * 200,
        s: 4 + Math.random() * 10,
        delay: Math.random() * 0.4,
      })),
    [count]
  );
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {seeds.map((p) => (
        <motion.span
          key={p.i}
          className="absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: p.s,
            height: p.s,
            background: color,
            boxShadow: `0 0 ${p.s * 1.2}px ${color}`,
          }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{
            x: p.x * 2.2,
            y: p.y * 2.2,
            opacity: 0,
            scale: 1.2,
          }}
          transition={{ duration: 1.8, delay: p.delay, ease: 'easeOut' }}
        />
      ))}
    </div>
  );
}

function GiftVisual({ theme, emoji, label, senderName, cost }: ArenaBigGiftPayload & { theme: ReturnType<typeof themeForGiftId> }) {
  if (theme === 'goat') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(18vh,8rem)] leading-none"
          initial={{ scale: 0.2, rotate: -12, opacity: 0 }}
          animate={{ scale: [0.2, 1.15, 1], rotate: [-12, 4, 0], opacity: 1 }}
          transition={{ duration: 0.7, times: [0, 0.6, 1], type: 'spring', stiffness: 200, damping: 14 }}
        >
          {emoji}
        </motion.div>
        <motion.p
          className="font-mono text-2xl font-black uppercase tracking-widest text-amber-200"
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.35, duration: 0.4 }}
        >
          G.O.A.T
        </motion.p>
        <p className="max-w-[min(90vw,24rem)] text-sm text-white/85">
          <span className="font-bold text-amber-100">{senderName}</span> — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'meteor') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          className="relative text-[min(20vh,9rem)]"
          initial={{ y: '-120vh', x: 40, scale: 0.5, opacity: 0.9 }}
          animate={{ y: 0, x: 0, scale: 1, opacity: 1, rotate: [18, 0] }}
          transition={{ duration: 0.6, type: 'spring', bounce: 0.35 }}
        >
          {emoji}
          <Particles count={64} color="rgba(251,191,36,0.85)" />
        </motion.div>
        <p className="text-lg font-bold text-amber-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'wolf') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          initial={{ x: '120%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 80, damping: 12, duration: 0.6 }}
        >
          {emoji}
        </motion.div>
        <p className="text-base font-semibold text-slate-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'volcano') {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          initial={{ y: 40, scale: 0.5, opacity: 0 }}
          animate={{ y: [40, 0, -3, 0], scale: 1, opacity: 1 }}
          transition={{ duration: 0.5 }}
        >
          {emoji}
        </motion.div>
        <Particles count={40} color="rgba(248,113,113,0.8)" />
        <p className="text-base font-semibold text-red-100">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  if (theme === 'champion') {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          className="text-[min(16vh,7rem)]"
          animate={{ rotate: [0, -6, 6, 0], y: [0, -6, 0] }}
          transition={{ duration: 1.2, repeat: 2, ease: 'easeInOut' }}
        >
          {emoji}
        </motion.div>
        <p className="bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-xl font-black text-transparent">
          {senderName} — {label} · {cost} pts
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <motion.div
        className="text-[min(18vh,8rem)]"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1], opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        {emoji}
      </motion.div>
      <Particles count={48} color="rgba(250,204,21,0.7)" />
      <p className="text-base font-bold text-amber-50">
        {senderName} — {label} · {cost} pts
      </p>
    </div>
  );
}

type Props = {
  roomId: string;
  /** Même onglet : broadcast self=false n’inclut pas l’émetteur — on rejoue l’anim localement. */
  localBigGift: ArenaBigGiftPayload | null;
};

export function FullscreenGiftAnimation({ roomId, localBigGift }: Props) {
  const labelId = useId();
  const [active, setActive] = useState<ActiveAnim>(null);

  const play = useCallback((payload: ArenaBigGiftPayload, key: string) => {
    if (payload.cost < BIG_GIFT_MIN) return;
    setActive({ ...payload, key });
    window.setTimeout(() => setActive(null), ANIM_MS);
  }, []);

  useEffect(() => {
    if (!localBigGift || localBigGift.cost < BIG_GIFT_MIN) return;
    play(localBigGift, `local_${Date.now()}`);
  }, [localBigGift, play]);

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`live_${roomId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'arena_big_gift' }, ({ payload }: { payload?: ArenaBigGiftPayload }) => {
        if (!payload || typeof payload.cost !== 'number' || payload.cost < BIG_GIFT_MIN) return;
        const p = payload;
        if (!p.label || !p.emoji || !p.senderName) return;
        play(
          {
            cost: p.cost,
            label: p.label,
            emoji: p.emoji,
            giftTypeId: p.giftTypeId || 'burst',
            senderName: p.senderName,
          },
          `rt_${p.senderName}_${p.cost}_${Date.now()}`
        );
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [roomId, play]);

  const theme = active ? themeForGiftId(active.giftTypeId) : 'burst';

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.key}
          role="dialog"
          aria-modal="true"
          aria-labelledby={labelId}
          className="pointer-events-none fixed inset-0 z-[21000] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-amber-950/40 to-black/80" />
          <motion.div
            className="relative z-10 max-w-[min(96vw,32rem)] px-4"
            initial={{ scale: 0.88, y: 30, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.92, y: 16, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 120, damping: 18, duration: 0.5 }}
          >
            <h2 id={labelId} className="sr-only">
              Cadeau {active.label} par {active.senderName}
            </h2>
            <GiftVisual
              theme={theme}
              cost={active.cost}
              label={active.label}
              emoji={active.emoji}
              giftTypeId={active.giftTypeId}
              senderName={active.senderName}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
