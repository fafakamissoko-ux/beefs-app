'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Check } from 'lucide-react';

type MutinyState = 'idle' | 'initiated' | 'awaiting_other' | 'received' | 'confirmed' | 'refused';

interface MutinyProtocolProps {
  mediatorName: string;
  currentUserSlot: 'A' | 'B';
  /** Has the other challenger already initiated a mutiny? */
  otherPartyInitiated?: boolean;
  onConfirm: () => void;
  onRefuse: () => void;
  onInitiate: () => void;
}

export function MutinyProtocol({
  mediatorName,
  currentUserSlot,
  otherPartyInitiated = false,
  onConfirm,
  onRefuse,
  onInitiate,
}: MutinyProtocolProps) {
  const [state, setState] = useState<MutinyState>(otherPartyInitiated ? 'received' : 'idle');
  const [menuOpen, setMenuOpen] = useState(false);

  const handleInitiate = () => {
    setState('awaiting_other');
    setMenuOpen(false);
    onInitiate();
  };

  const handleConfirm = () => {
    setState('confirmed');
    onConfirm();
  };

  const handleRefuse = () => {
    setState('refused');
    onRefuse();
    setTimeout(() => setState('idle'), 2000);
  };

  if (state === 'confirmed') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="rounded-2xl bg-ember-500/10 border border-ember-500/25 px-4 py-3 text-center"
      >
        <p className="font-sans text-sm font-bold text-ember-400">Médiateur récusé</p>
        <p className="font-mono text-[10px] text-white/35 mt-1 tracking-wider">Le dossier revient à l&apos;état manifeste</p>
      </motion.div>
    );
  }

  return (
    <div className="relative">
      {/* Trigger — menu 3 points discret */}
      {state === 'idle' && (
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(!menuOpen)}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/25 hover:text-white/50 hover:bg-white/[0.04] transition-colors"
            aria-label="Options médiateur"
          >
            <span className="text-sm tracking-widest">···</span>
          </button>

          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.95 }}
                transition={{ duration: 0.12 }}
                className="absolute right-0 top-full mt-1 z-dropdown w-56 rounded-xl bg-white/[0.06] backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden"
              >
                <button
                  type="button"
                  onClick={handleInitiate}
                  className="w-full flex items-center gap-2.5 px-4 py-3 font-sans text-sm text-ember-400 hover:bg-ember-500/10 transition-colors text-left"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Récuser le médiateur
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Initiated — waiting for other party */}
      <AnimatePresence>
        {state === 'awaiting_other' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-amber-500/8 border border-amber-500/20 px-4 py-3 mt-2 overflow-hidden"
          >
            <div className="flex items-start gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <p className="font-sans text-sm font-bold text-amber-300">Récusation initiée</p>
                <p className="font-sans text-xs text-white/40 mt-0.5">
                  En attente de l&apos;accord de l&apos;autre partie...
                </p>
                <div className="flex items-center gap-1 mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                  <span className="font-mono text-[10px] text-amber-400/60 tracking-wider">EN ATTENTE</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Received — other party initiated, this user decides */}
      <AnimatePresence>
        {state === 'received' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="rounded-2xl bg-ember-500/8 border-2 border-ember-500/30 px-4 py-4 mt-2 overflow-hidden"
          >
            <div className="flex items-start gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl bg-ember-500/15 flex items-center justify-center flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4 text-ember-400" />
              </div>
              <div>
                <p className="font-sans text-sm font-bold text-ember-400">Motion de censure</p>
                <p className="font-sans text-xs text-white/50 mt-0.5">
                  L&apos;autre partie souhaite renvoyer <span className="font-bold text-white/70">{mediatorName}</span>.
                  <br />Acceptez-vous ?
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 pl-10">
              <button
                type="button"
                onClick={handleConfirm}
                className="flex items-center gap-1.5 rounded-full bg-ember-500/20 hover:bg-ember-500/30 border border-ember-500/30 px-4 py-2 font-sans text-xs font-bold text-ember-400 transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                Confirmer
              </button>
              <button
                type="button"
                onClick={handleRefuse}
                className="flex items-center gap-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] px-4 py-2 font-sans text-xs font-bold text-white/50 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Refuser
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Refused feedback */}
      <AnimatePresence>
        {state === 'refused' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-2xl bg-white/[0.03] border border-white/[0.06] px-4 py-3 mt-2 text-center"
          >
            <p className="font-sans text-xs text-white/40">Motion rejetée — le médiateur est maintenu</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
