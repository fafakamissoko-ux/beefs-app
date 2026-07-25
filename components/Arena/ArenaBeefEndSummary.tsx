'use client';

import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import type { EndSummary } from '@/hooks/useBeefLifecycle';

interface ArenaBeefEndSummaryProps {
  roomId: string;
  endSummary: EndSummary;
  endSummaryTimerRef: React.MutableRefObject<NodeJS.Timeout | null>;
}

export function ArenaBeefEndSummary({ roomId, endSummary, endSummaryTimerRef }: ArenaBeefEndSummaryProps) {
  const router = useRouter();

  return (
    <div
      className="absolute inset-0 z-[1000] flex flex-col items-center justify-center bg-black/40 backdrop-blur-sm p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="beef-end-summary-title"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', damping: 20 }}
        className="w-full max-w-sm space-y-6 text-center"
      >
        <div className="space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-ember-600 to-cobalt-600 shadow-[0_0_15px_rgba(59,130,246,0.5)]" aria-hidden>
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 id="beef-end-summary-title" className="text-2xl font-bold text-white">S&eacute;ance lev&eacute;e</h2>
          <p className="text-sm text-gray-400">{endSummary.endReason}</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-cyan-400">{endSummary.duration}</div>
            <div className="mt-1 text-xs text-gray-500">Dur&eacute;e</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-cobalt-400">{endSummary.viewers}</div>
            <div className="mt-1 text-xs text-gray-500">Spectateurs</div>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
            <div className="text-2xl font-bold text-ember-400">{endSummary.messages}</div>
            <div className="mt-1 text-xs text-gray-500">Messages</div>
          </div>
        </div>

        <div className="mt-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm">
          <div className="mb-3 text-center font-mono text-xs uppercase tracking-widest text-gray-400">R&eacute;sonance G&eacute;n&eacute;r&eacute;e</div>
          <div className="flex flex-wrap justify-center gap-2">
            {endSummary.resonanceA > 0 && (
              <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-2">
                <span className="text-lg font-black tabular-nums text-cyan-400">{endSummary.resonanceA}</span>
                <span className="mt-1 font-mono text-[9px] uppercase text-cyan-200/60">Slot A</span>
              </div>
            )}
            <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-prestige-gold/20 bg-prestige-gold/10 p-2">
              <span className="text-lg font-black tabular-nums text-prestige-gold">{endSummary.resonanceM}</span>
              <span className="mt-1 font-mono text-[9px] uppercase text-prestige-gold/60">Ref</span>
            </div>
            {endSummary.resonanceB > 0 && (
              <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-white/20 bg-white/10 p-2">
                <span className="text-lg font-black tabular-nums text-white/90">{endSummary.resonanceB}</span>
                <span className="mt-1 font-mono text-[9px] uppercase text-white/60">Slot B</span>
              </div>
            )}
            {endSummary.resonanceC > 0 && (
              <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-2">
                <span className="text-lg font-black tabular-nums text-yellow-400">{endSummary.resonanceC}</span>
                <span className="mt-1 font-mono text-[9px] uppercase text-yellow-200/60">Slot C</span>
              </div>
            )}
            {endSummary.resonanceD > 0 && (
              <div className="flex min-w-[70px] flex-col items-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-2">
                <span className="text-lg font-black tabular-nums text-cyan-400">{endSummary.resonanceD}</span>
                <span className="mt-1 font-mono text-[9px] uppercase text-cyan-200/60">Slot D</span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-3 pt-2">
          <p className="text-xs text-gray-500 leading-relaxed px-1">
            Il n&apos;y a pas de fil de commentaires sur cet &eacute;cran : les spectateurs peuvent{' '}
            <span className="text-gray-400">noter le Ref</span> (&eacute;toiles + commentaire) depuis le r&eacute;sum&eacute; du
            beef.
          </p>
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
              router.push(`/beef/${roomId}/summary`);
            }}
            className="w-full rounded-full border border-white/10 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            R&eacute;sum&eacute; &amp; avis Ref
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              if (endSummaryTimerRef.current) clearTimeout(endSummaryTimerRef.current);
              router.replace('/feed');
            }}
            className="w-full rounded-full border border-white/20 bg-white/10 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            Retour au feed
          </motion.button>
          <p className="text-xs text-gray-600">Redirection automatique dans quelques secondes...</p>
        </div>
      </motion.div>
    </div>
  );
}
