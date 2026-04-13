'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send } from 'lucide-react';

const MAX_PITCH_LENGTH = 150;

interface PitchModalProps {
  role: 'challenger' | 'mediator';
  beefTitle: string;
  open: boolean;
  onClose: () => void;
  onSubmit: (pitch: string) => void;
}

export function PitchModal({
  role,
  beefTitle,
  open,
  onClose,
  onSubmit,
}: PitchModalProps) {
  const [pitch, setPitch] = useState('');
  const [sending, setSending] = useState(false);

  const remaining = MAX_PITCH_LENGTH - pitch.length;
  const canSubmit = pitch.trim().length >= 10 && remaining >= 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    setSending(true);
    onSubmit(pitch.trim());
    setTimeout(() => {
      setSending(false);
      setPitch('');
      onClose();
    }, 600);
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-[2rem] bg-white/[0.05] backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">
                  {role === 'mediator' ? 'Candidature médiateur' : 'Candidature challenger'}
                </p>
                <h2 className="font-sans text-lg font-bold text-white mt-0.5 line-clamp-1">{beefTitle}</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="w-9 h-9 rounded-xl flex items-center justify-center text-white/40 hover:text-white hover:bg-white/[0.06] transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-6 pb-6 pt-2">
              <p className="font-sans text-sm text-white/50 mb-1">
                Rédigez un pitch pour convaincre l&apos;auteur du manifeste.
              </p>
              <div className="rounded-xl bg-cobalt-500/8 border border-cobalt-500/15 px-3 py-2 mb-5">
                <p className="font-mono text-[10px] text-cobalt-400 tracking-wider">
                  {role === 'mediator'
                    ? 'En acceptant cette mission, vous percevrez 25% de la cagnotte finale si le Pacte est signé.'
                    : 'Votre pitch sera visible par l\'auteur du manifeste.'}
                </p>
              </div>

              <div className="relative mb-2">
                <textarea
                  value={pitch}
                  onChange={(e) => setPitch(e.target.value.slice(0, MAX_PITCH_LENGTH))}
                  placeholder="Pourquoi êtes-vous la bonne personne ?"
                  rows={3}
                  maxLength={MAX_PITCH_LENGTH}
                  className="w-full resize-none bg-transparent border-b border-white/[0.08] px-0 py-2 font-sans text-sm font-light italic text-white placeholder-white/25 focus:outline-none focus:border-cobalt-500/50 transition-colors"
                />
              </div>
              <div className="flex items-center justify-between mb-6">
                <p className="font-mono text-[10px] text-white/25 tracking-wider">Min. 10 caractères</p>
                <p className={`font-mono text-[10px] tracking-wider ${remaining < 20 ? 'text-ember-400' : 'text-white/25'}`}>
                  {remaining}
                </p>
              </div>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="font-sans text-sm text-white/40 hover:text-white transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || sending}
                  aria-busy={sending}
                  className="rounded-full bg-prestige-gold/90 hover:bg-prestige-gold px-6 py-2.5 font-sans text-sm font-bold text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send className="w-3.5 h-3.5" />
                  Postuler
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
