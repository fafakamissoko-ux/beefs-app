'use client';

import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ARENA_QUICK_REACTIONS } from '@/lib/arena-quick-reactions';
import { GIFT_CATALOG, type GiftItem } from '@/lib/constants/gifts';
import { userIdsEqual } from '@/lib/user-id-equal';

const POPULAR_REACTIONS = [
  '\u{1F44D}', '\u{1F44E}', '\u{1F602}', '\u{1F525}', '\u{1F4AF}', '\u{1F44F}', '\u{1F914}', '\u{1F62E}', '\u{1F480}', '\u{1F3AF}',
  '\u{26A1}', '\u{1F4AA}', '\u{1F9E0}', '\u{1F440}', '\u{1F92F}', '\u{1F621}', '\u{2764}\u{FE0F}', '\u{1F389}', '\u{1F64C}', '\u{1F48E}',
  '\u{1F31F}', '\u{2728}', '\u{1F680}', '\u{1F4A5}', '\u{1F921}', '\u{1F47D}', '\u{1F47B}', '\u{1F976}', '\u{1F975}', '\u{1F60E}',
  '\u{1F913}', '\u{1F973}', '\u{1F92C}', '\u{1F92E}', '\u{1F922}', '\u{1F927}', '\u{1F607}', '\u{1F92B}', '\u{1F92D}', '\u{1F971}',
  '\u{1F90C}', '\u{1FAF6}', '\u{1F91D}', '\u{1F918}', '\u{1F919}', '\u{1F590}\u{FE0F}', '\u{1F44A}', '\u{1F64F}', '\u{1F3C6}', '\u{1F947}',
  '\u{1F5E3}\u{FE0F}', '\u{1F399}\u{FE0F}', '\u{1F3A4}', '\u{1F3A7}', '\u{1F4FB}', '\u{1F3B8}', '\u{1F941}', '\u{1F3AD}', '\u{1F3A8}', '\u{1F3AC}',
  '\u{1F37F}', '\u{1F354}', '\u{1F355}', '\u{1F37B}', '\u{1F942}', '\u{1F37E}', '\u{1F9CA}', '\u{1F9C2}', '\u{1F336}\u{FE0F}', '\u{1F969}',
  '\u{1F6D1}', '\u{1F6A7}', '\u{1F6A8}', '\u{1F9EF}', '\u{1F94A}', '\u{1F94B}', '\u{1F93A}', '\u{1F3CB}\u{FE0F}', '\u{1F938}', '\u{2705}',
];

const HEART_ON_FIRE = '\u{2764}\u{FE0F}\u{200D}\u{1F525}';
const STRIP_SET = new Set<string>(ARENA_QUICK_REACTIONS);
const PICKER_REACTIONS = POPULAR_REACTIONS.filter((e) => {
  if (STRIP_SET.has(e)) return false;
  if (e === '\u{2764}\u{FE0F}' || e === HEART_ON_FIRE) return false;
  return true;
});

interface GiftRecipient {
  id: string;
  label: string;
}

interface DockPickerPos {
  bottom: number;
  right: number;
}

interface ArenaDockPickersPortalProps {
  mounted: boolean;
  showReactions: boolean;
  showGifts: boolean;
  pos: DockPickerPos | null;
  onCloseReactions: () => void;
  onCloseGifts: () => void;
  onReaction: (emoji: string) => void;
  giftRecipients: GiftRecipient[];
  giftTarget: string;
  setGiftTarget: (id: string) => void;
  hostId: string;
  sendGift: (gift: GiftItem) => Promise<void>;
}

export function ArenaDockPickersPortal({
  mounted, showReactions, showGifts, pos,
  onCloseReactions, onCloseGifts,
  onReaction,
  giftRecipients, giftTarget, setGiftTarget, hostId,
  sendGift,
}: ArenaDockPickersPortalProps) {
  if (!mounted || (!showReactions && !showGifts) || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed z-[10000]" style={{ bottom: pos.bottom, right: pos.right }}>
      <AnimatePresence mode="wait">
        {showReactions && (
          <motion.div
            key="arena-all-reactions"
            data-arena-dock-popover
            role="dialog"
            aria-modal="true"
            aria-label="R\u00e9actions"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="pointer-events-auto max-h-[min(50dvh,280px)] w-[min(calc(100vw-1rem),18rem)] max-w-[calc(100vw-1rem)] overflow-y-auto overscroll-contain rounded-[2.5rem] border border-white/10 bg-slate-900/40 p-2 pt-1.5 backdrop-blur-sm shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-white/[0.08] pb-2">
              <span className="pl-0.5 text-[11px] font-semibold text-white/75">R&eacute;actions</span>
              <button
                type="button"
                onClick={onCloseReactions}
                aria-label="Fermer le panneau de r\u00e9actions"
                className="flex h-9 min-h-9 min-w-9 shrink-0 touch-manipulation items-center justify-center rounded-full text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" strokeWidth={1.5} aria-hidden />
              </button>
            </div>
            <div className="grid grid-cols-6 gap-1 sm:grid-cols-8">
              {PICKER_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => { onReaction(emoji); onCloseReactions(); }}
                  aria-label={`R\u00e9agir avec ${emoji}`}
                  className="flex h-9 min-h-9 w-9 min-w-9 touch-manipulation items-center justify-center rounded-2xl text-lg hover:bg-white/10 active:scale-95"
                >
                  <span aria-hidden>{emoji}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
        {showGifts && (
          <motion.div
            key="arena-gift-picker"
            data-arena-dock-popover
            role="dialog"
            aria-modal="true"
            aria-label="Cadeaux"
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="pointer-events-auto max-h-[min(60dvh,380px)] w-[min(calc(100vw-1rem),340px)] overflow-y-auto overscroll-contain rounded-[2.5rem] border border-white/10 bg-slate-900/40 p-3 pt-2 backdrop-blur-sm shadow-lg hide-scrollbar"
          >
            <div className="mb-3">
              <div className="mb-2 flex justify-between items-center">
                <span className="text-[11px] font-semibold text-white/75">Soutenir un participant :</span>
                <button
                  type="button"
                  onClick={onCloseGifts}
                  className="text-white/70 hover:text-white"
                  aria-label="Fermer les cadeaux"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex w-full items-center gap-1 rounded-xl bg-slate-950/50 p-1">
                {giftRecipients.map((recipient) => (
                  <button
                    key={recipient.id}
                    type="button"
                    onClick={() => setGiftTarget(recipient.id)}
                    className={`flex-1 truncate rounded-lg px-1 py-1.5 text-[9px] font-bold transition-colors ${
                      (giftTarget || giftRecipients[0]?.id) === recipient.id
                        ? userIdsEqual(recipient.id, hostId)
                          ? 'bg-prestige-gold text-black'
                          : 'border border-white/20 bg-white/10 text-white'
                        : 'text-white/50 hover:bg-white/10'
                    }`}
                  >
                    @{recipient.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {GIFT_CATALOG.map((gift) => (
                <button
                  key={gift.id}
                  type="button"
                  onClick={() => void sendGift(gift)}
                  className="flex flex-col items-center gap-1 rounded-2xl bg-white/5 p-2 hover:bg-white/12 active:scale-95"
                >
                  <img
                    src={`/gifts/${gift.id}.webp`}
                    alt={gift.label}
                    className="h-10 w-10 object-contain drop-shadow-md"
                  />
                  <span className="text-[10px] font-bold text-white">{gift.label}</span>
                  <span className="text-[9px] font-semibold text-ember-400">{gift.cost} Lingots</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
