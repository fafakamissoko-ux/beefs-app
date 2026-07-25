'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Share2, MessageCircle, Home, User, Settings as SettingsIcon, Maximize } from 'lucide-react';
import { IngotIcon } from '@/components/shared/IngotIcon';
import { PremiumNotificationBadge } from '@/components/shared/PremiumNotificationBadge';

interface ArenaMenuPanelProps {
  open: boolean;
  onClose: () => void;
  walletBalance: number;
  goBuyPoints: () => void;
  onCinematicMode: () => void;
  openDrawer: () => void;
  onShare: () => void;
  onLeave: () => void;
  unreadDMsCount: number;
}

export function ArenaMenuPanel({
  open, onClose,
  walletBalance, goBuyPoints,
  onCinematicMode, openDrawer, onShare, onLeave,
  unreadDMsCount,
}: ArenaMenuPanelProps) {
  const router = useRouter();

  const act = (fn: () => void) => { onClose(); fn(); };

  if (!open) return null;

  return (
    <>
      {/* ── Desktop: dropdown ── */}
      <div
        className="absolute left-4 top-full z-[200] mt-2 hidden w-64 flex-col rounded-2xl border border-white/10 bg-slate-950/75 py-2 backdrop-blur-md shadow-2xl lg:flex"
        data-cinema-stay
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Mon Solde</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <IngotIcon className="h-4 w-4 drop-shadow-md" />
              <span className="font-black text-white">{walletBalance} Lingots</span>
            </div>
          </div>
          <button type="button" onClick={() => act(goBuyPoints)} className="flex items-center gap-1.5 rounded-full bg-prestige-gold px-3 py-1.5 text-xs font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-colors hover:bg-yellow-500">
            Recharger
          </button>
        </div>

        <div className="grid grid-cols-2 gap-1 p-2">
          <button type="button" onClick={() => act(onCinematicMode)} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
            <Maximize className="h-5 w-5 text-gray-300" />
            <span className="text-xs font-medium">Cin&eacute;matique</span>
          </button>
          <button type="button" onClick={() => act(openDrawer)} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
            <MessageCircle className="h-5 w-5 text-gray-300" />
            <span className="text-xs font-medium">Messages</span>
          </button>
          <button type="button" onClick={() => act(onShare)} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
            <Share2 className="h-5 w-5 text-cyan-400" />
            <span className="text-xs font-medium">Partager</span>
          </button>
          <button type="button" onClick={() => act(() => window.open('/profile', '_blank'))} className="flex flex-col items-center gap-2 rounded-xl p-3 text-white transition-colors hover:bg-white/10">
            <User className="h-5 w-5 text-gray-300" />
            <span className="text-xs font-medium">Profil</span>
          </button>
        </div>

        <div className="border-t border-white/10 p-2">
          <button type="button" onClick={() => act(() => router.push('/feed'))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
            <Home className="h-4 w-4" /> Retour au Feed
          </button>
          <button type="button" onClick={() => act(() => window.open('/settings', '_blank'))} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white">
            <SettingsIcon className="h-4 w-4" /> Param&egrave;tres
          </button>
        </div>

        <div className="border-t border-white/10 p-2">
          <button type="button" onClick={() => act(onLeave)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-rose-500/10 px-3 py-2.5 text-sm font-black uppercase tracking-widest text-rose-500 transition-colors hover:bg-rose-500/20">
            Quitter le Direct
          </button>
        </div>
      </div>

      {/* ── Mobile: bottom drawer ── */}
      <AnimatePresence>
        <motion.div
          key="arena-menu-mobile-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu Agora"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[400] flex lg:hidden"
        >
          <button type="button" className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Fermer le menu" onClick={onClose} />

          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 360 }}
            className="absolute bottom-0 left-0 right-0 z-10 max-h-[85dvh] overflow-y-auto rounded-t-[2rem] bg-slate-950/75 backdrop-blur-md border-t border-white/10 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-cinema-stay
          >
            <div className="mx-auto mt-3 mb-4 h-1.5 w-12 shrink-0 rounded-full bg-white/20" aria-hidden />

            <div className="flex flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
              <div className="mb-5 flex items-center justify-between rounded-2xl bg-white/5 border border-white/5 p-4 shadow-inner">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Mon Solde</p>
                  <div className="mt-1 flex items-center gap-1.5">
                    <IngotIcon className="h-5 w-5 drop-shadow-md" />
                    <span className="text-xl font-black text-white">{walletBalance} <span className="text-sm font-bold text-gray-400">Lingots</span></span>
                  </div>
                </div>
                <button type="button" onClick={() => act(goBuyPoints)} className="flex items-center gap-1.5 rounded-full bg-prestige-gold px-4 py-2 text-xs font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.4)] transition-colors hover:bg-yellow-500">
                  Recharger
                </button>
              </div>

              <div className="mb-5 grid grid-cols-4 gap-3">
                <button type="button" onClick={() => act(onCinematicMode)} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                    <Maximize className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/80">Cin&eacute;</span>
                </button>
                <button type="button" onClick={() => act(openDrawer)} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90 relative">
                    <MessageCircle className="h-6 w-6 text-white" />
                    <PremiumNotificationBadge count={unreadDMsCount} variant="cyan" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/80">Messages</span>
                </button>
                <button type="button" onClick={() => act(onShare)} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                    <Share2 className="h-6 w-6 text-cyan-400" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/80">Partager</span>
                </button>
                <button type="button" onClick={() => act(() => window.open('/profile', '_blank'))} className="flex flex-col items-center gap-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90">
                    <User className="h-6 w-6 text-white" />
                  </div>
                  <span className="text-[10px] font-semibold text-white/80">Profil</span>
                </button>
              </div>

              <div className="mb-5 flex flex-col gap-1 rounded-2xl bg-white/5 p-2">
                <button type="button" onClick={() => act(() => router.push('/feed'))} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10">
                  <Home className="h-5 w-5 text-gray-400" /> Retour au Feed
                </button>
                <button type="button" onClick={() => act(() => window.open('/settings', '_blank'))} className="flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-white transition-colors hover:bg-white/10">
                  <SettingsIcon className="h-5 w-5 text-gray-400" /> Param&egrave;tres
                </button>
              </div>

              <button type="button" onClick={() => act(onLeave)} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-4 text-sm font-black uppercase tracking-widest text-rose-500 transition-colors hover:bg-rose-500/20 active:scale-95">
                Quitter le Direct
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </>
  );
}
