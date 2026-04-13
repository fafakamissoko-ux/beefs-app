'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Star, X } from 'lucide-react';

interface ReviewMediatorModalProps {
  mediatorName: string;
  beefTitle: string;
  open: boolean;
  onClose: () => void;
  /** Retourne false si l’enregistrement a échoué (ex. erreur réseau / RLS). */
  onSubmit: (rating: number, comment: string) => boolean | Promise<boolean>;
}

export function ReviewMediatorModal({
  mediatorName,
  beefTitle,
  open,
  onClose,
  onSubmit,
}: ReviewMediatorModalProps) {
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [comment, setComment] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0 || busy) return;
    setBusy(true);
    try {
      const ok = await Promise.resolve(onSubmit(rating, comment.trim()));
      if (!ok) {
        setBusy(false);
        return;
      }
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setRating(0);
        setComment('');
        setBusy(false);
        onClose();
      }, 1800);
    } catch {
      setBusy(false);
    }
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
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center justify-center py-16 px-6"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.1 }}
                  className="w-16 h-16 rounded-full bg-prestige-gold/20 flex items-center justify-center mb-4"
                >
                  <Star className="w-8 h-8 text-prestige-gold fill-prestige-gold" />
                </motion.div>
                <p className="font-sans text-lg font-bold text-white">Merci pour votre avis</p>
                <p className="font-sans text-sm text-white/40 mt-1">Votre évaluation aide la communauté</p>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-white/30">Évaluation</p>
                    <h2 className="font-sans text-lg font-bold text-white mt-0.5">{beefTitle}</h2>
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
                  <p className="font-sans text-sm text-white/60 mb-6">
                    Comment évaluez-vous l&apos;impartialité de{' '}
                    <span className="font-bold text-white">{mediatorName}</span> ?
                  </p>

                  <div className="flex items-center justify-center gap-2 mb-8">
                    {[1, 2, 3, 4, 5].map((star) => {
                      const filled = star <= (hoveredStar || rating);
                      return (
                        <motion.button
                          key={star}
                          type="button"
                          whileTap={{ scale: 0.85 }}
                          onMouseEnter={() => setHoveredStar(star)}
                          onMouseLeave={() => setHoveredStar(0)}
                          onClick={() => setRating(star)}
                          className="p-1 transition-colors"
                        >
                          <Star
                            className={`w-9 h-9 transition-colors duration-150 ${
                              filled
                                ? 'text-prestige-gold fill-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.4)]'
                                : 'text-white/15'
                            }`}
                          />
                        </motion.button>
                      );
                    })}
                  </div>

                  {rating > 0 && (
                    <p className="text-center font-mono text-xs text-prestige-gold/80 mb-6 tracking-wider">
                      {rating === 1 && 'Très insuffisant'}
                      {rating === 2 && 'Insuffisant'}
                      {rating === 3 && 'Correct'}
                      {rating === 4 && 'Bon médiateur'}
                      {rating === 5 && 'Excellent médiateur'}
                    </p>
                  )}

                  <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Commentaire optionnel..."
                    maxLength={500}
                    rows={3}
                    className="w-full resize-none bg-transparent border-b border-white/[0.08] px-0 py-2 font-sans text-sm text-white placeholder-white/25 focus:outline-none focus:border-cobalt-500/50 transition-colors"
                  />

                  <div className="flex items-center justify-between mt-6">
                    <button
                      type="button"
                      onClick={onClose}
                      className="font-sans text-sm text-white/40 hover:text-white transition-colors"
                    >
                      Passer
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSubmit()}
                      disabled={rating === 0 || busy}
                      aria-busy={busy}
                      className="rounded-full bg-prestige-gold/90 hover:bg-prestige-gold px-6 py-2.5 font-sans text-sm font-bold text-black transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {busy ? 'Envoi…' : 'Envoyer'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
