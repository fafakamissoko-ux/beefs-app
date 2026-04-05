'use client';

import { useState, useEffect } from 'react';
import { Flame, Crown, Zap, Diamond } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';

interface Gift {
  id: string;
  from_user_id: string;
  to_user_id: string;
  gift_type: 'rose' | 'fire' | 'crown' | 'diamond';
  created_at: string;
}

interface AnimatedGift {
  id: string;
  type: 'rose' | 'fire' | 'crown' | 'diamond';
  x: number;
  y: number;
}

interface GiftSystemProps {
  roomId: string;
  /** Conservé pour compatibilité éventuelle des parents ; l’expéditeur est dérivé de la session côté API. */
  userId?: string;
  targetUserId: string;
  targetUserName: string;
}

const giftConfig = {
  rose: {
    icon: Flame,
    label: 'Rose',
    color: 'text-pink-400',
    cost: 10,
    giftTypeId: 'rose',
  },
  fire: {
    icon: Flame,
    label: 'Fire',
    color: 'text-brand-400',
    cost: 25,
    giftTypeId: 'fire',
  },
  crown: {
    icon: Crown,
    label: 'Couronne',
    color: 'text-yellow-400',
    cost: 100,
    giftTypeId: 'crown',
  },
  diamond: {
    icon: Diamond,
    label: 'Diamant',
    color: 'text-purple-400',
    cost: 50,
    giftTypeId: 'diamond',
  },
};

export function GiftSystem({ roomId, targetUserId, targetUserName }: GiftSystemProps) {
  const [showGiftMenu, setShowGiftMenu] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [animatedGifts, setAnimatedGifts] = useState<AnimatedGift[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`beef_${roomId}_gifts`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gifts',
          filter: `beef_id=eq.${roomId}`,
        },
        (payload) => {
          const gift = payload.new as any;

          if (gift.recipient_id === targetUserId) {
            const animGift: AnimatedGift = {
              id: gift.id,
              type: gift.gift_type_id as any,
              x: Math.random() * 80 + 10,
              y: Math.random() * 30 + 60,
            };

            setAnimatedGifts((prev) => [...prev, animGift]);

            setTimeout(() => {
              setAnimatedGifts((prev) => prev.filter((g) => g.id !== animGift.id));
            }, 2000);
          }
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, targetUserId]);

  const sendGift = async (giftType: keyof typeof giftConfig) => {
    const config = giftConfig[giftType];
    setSendError(null);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) {
      setSendError('Non authentifié');
      return;
    }
    try {
      const res = await fetch('/api/gifts/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          beef_id: roomId,
          recipient_id: targetUserId,
          gift_type_id: config.giftTypeId,
          points_amount: config.cost,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Erreur lors de l’envoi');
      setShowGiftMenu(false);
    } catch (e: unknown) {
      setSendError(e instanceof Error ? e.message : 'Erreur lors de l’envoi');
    }
  };

  return (
    <div className="relative">
      {/* Gift Button */}
      <button
        onClick={() => setShowGiftMenu(!showGiftMenu)}
        className="bg-arena-purple hover:bg-arena-purple/80 text-white px-4 py-2 rounded-lg font-bold transition-all flex items-center gap-2"
      >
        <Diamond className="w-4 h-4" />
        Offrir Gift
      </button>

      {/* Gift Menu */}
      <AnimatePresence>
        {showGiftMenu && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-full mb-2 right-0 bg-arena-dark border-2 border-arena-gray rounded-xl p-4 shadow-xl z-50 min-w-[280px]"
          >
            <div className="text-sm font-bold mb-3">
              Envoyer à {targetUserName}
            </div>
            {sendError && (
              <p className="text-xs text-red-400 mb-2" role="alert">
                {sendError}
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(giftConfig).map(([key, config]) => {
                const Icon = config.icon;
                return (
                  <button
                    key={key}
                    onClick={() => sendGift(key as keyof typeof giftConfig)}
                    className="bg-arena-darker hover:bg-arena-gray p-3 rounded-lg transition-all border border-arena-gray hover:border-arena-blue"
                  >
                    <Icon className={`w-8 h-8 ${config.color} mx-auto mb-1`} />
                    <div className="text-xs font-bold">{config.label}</div>
                    <div className="text-xs text-gray-500">{config.cost} pts</div>
                  </button>
                );
              })}
            </div>

            <div className="text-xs text-gray-500 mt-3 text-center">
              Le coût est déduit de vos points
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Animated Gifts Overlay */}
      <AnimatePresence>
        {animatedGifts.map((gift) => {
          const Icon = giftConfig[gift.type].icon;
          const color = giftConfig[gift.type].color;
          
          return (
            <motion.div
              key={gift.id}
              initial={{ opacity: 0, scale: 0, x: gift.x + '%', y: gift.y + '%' }}
              animate={{ 
                opacity: [0, 1, 1, 0], 
                scale: [0, 1.2, 1.5],
                y: [gift.y + '%', (gift.y - 30) + '%']
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2, ease: 'easeOut' }}
              className="fixed pointer-events-none z-50"
              style={{ left: 0, top: 0 }}
            >
              <Icon className={`w-16 h-16 ${color}`} />
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
