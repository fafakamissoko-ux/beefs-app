'use client';

import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Fingerprint } from 'lucide-react';

interface PactModalProps {
  open: boolean;
  beefTitle: string;
  challengerAName: string;
  challengerBName: string;
  onClose: () => void;
  onPactSigned: () => void;
}

function SignatureZone({
  name,
  side,
  onSigned,
  signed,
}: {
  name: string;
  side: 'left' | 'right';
  onSigned: () => void;
  signed: boolean;
}) {
  const [pressing, setPressing] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const progressRef = useRef(0);
  const [progress, setProgress] = useState(0);

  const startPress = useCallback(() => {
    if (signed) return;
    setPressing(true);
    progressRef.current = 0;
    setProgress(0);
    const tick = () => {
      progressRef.current += 2;
      setProgress(progressRef.current);
      if (progressRef.current >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
        onSigned();
        return;
      }
    };
    timerRef.current = setInterval(tick, 30);
  }, [signed, onSigned]);

  const endPress = useCallback(() => {
    setPressing(false);
    if (timerRef.current) clearInterval(timerRef.current);
    if (progressRef.current < 100) {
      progressRef.current = 0;
      setProgress(0);
    }
  }, []);

  const accent = side === 'left' ? 'cobalt' : 'ember';

  return (
    <div className="flex flex-col items-center gap-3">
      <p className="font-sans text-xs font-bold text-white/50 uppercase tracking-wider">{name}</p>
      <motion.button
        type="button"
        onPointerDown={startPress}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        disabled={signed}
        className={`relative w-24 h-24 rounded-[2rem] flex items-center justify-center transition-all touch-manipulation ${
          signed
            ? `bg-${accent}-500/20 border-2 border-${accent}-500/50 shadow-[0_0_24px_rgba(${side === 'left' ? '0,82,255' : '255,77,0'},0.25)]`
            : `bg-white/[0.04] border-2 border-dashed border-white/[0.15] hover:border-white/30 ${pressing ? 'scale-95' : ''}`
        }`}
      >
        {/* Progress ring */}
        {!signed && progress > 0 && (
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48"
              cy="48"
              r="42"
              fill="none"
              stroke={side === 'left' ? 'rgba(0,82,255,0.4)' : 'rgba(255,77,0,0.4)'}
              strokeWidth="3"
              strokeDasharray={`${2 * Math.PI * 42}`}
              strokeDashoffset={`${2 * Math.PI * 42 * (1 - progress / 100)}`}
              strokeLinecap="round"
            />
          </svg>
        )}

        <Fingerprint className={`w-10 h-10 transition-colors ${
          signed
            ? `text-${accent}-400`
            : pressing
              ? `text-${accent}-400/70`
              : 'text-white/20'
        }`} />

        {signed && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 400, damping: 15 }}
            className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-${accent}-500 flex items-center justify-center`}
          >
            <span className="text-white text-xs font-bold">✓</span>
          </motion.div>
        )}
      </motion.button>
      <p className="font-mono text-[10px] text-white/25 tracking-wider">
        {signed ? 'SIGNÉ' : 'Maintenir pour signer'}
      </p>
    </div>
  );
}

export function PactModal({
  open,
  beefTitle,
  challengerAName,
  challengerBName,
  onClose,
  onPactSigned,
}: PactModalProps) {
  const [signedA, setSignedA] = useState(false);
  const [signedB, setSignedB] = useState(false);
  const [pactSealed, setPactSealed] = useState(false);

  const handleSignA = () => {
    setSignedA(true);
    if (signedB) sealPact();
  };

  const handleSignB = () => {
    setSignedB(true);
    if (signedA) sealPact();
  };

  const sealPact = () => {
    setPactSealed(true);
    setTimeout(() => {
      onPactSigned();
    }, 2200);
  };

  if (signedA && signedB && !pactSealed) sealPact();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/85 backdrop-blur-md"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.88, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.88, y: 30 }}
            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-[2rem] bg-white/[0.05] backdrop-blur-2xl border border-white/[0.1] shadow-2xl overflow-hidden"
          >
            {pactSealed ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center py-16 px-6"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 18, delay: 0.2 }}
                  className="w-20 h-20 rounded-full bg-prestige-gold/20 border-2 border-prestige-gold/40 flex items-center justify-center mb-5 shadow-[0_0_40px_rgba(212,175,55,0.3)]"
                >
                  <span className="text-4xl">🤝</span>
                </motion.div>
                <h3 className="font-sans text-2xl font-black text-prestige-gold">Pacte scellé</h3>
                <p className="font-sans text-sm text-white/40 mt-2 text-center">
                  La résolution est officiellement signée par les deux parties.
                </p>
              </motion.div>
            ) : (
              <>
                <div className="flex items-center justify-between px-6 pt-6 pb-2">
                  <div>
                    <p className="font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-prestige-gold/60">Le pacte</p>
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

                <div className="px-6 pb-2">
                  <p className="font-sans text-sm text-white/50">
                    Les deux parties doivent maintenir leur empreinte pour valider la résolution.
                  </p>
                </div>

                <div className="flex items-center justify-center gap-8 px-6 py-10">
                  <SignatureZone
                    name={challengerAName}
                    side="left"
                    onSigned={handleSignA}
                    signed={signedA}
                  />

                  <div className="flex flex-col items-center gap-1">
                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-prestige-gold/30 to-transparent" />
                    <span className="font-mono text-[9px] text-prestige-gold/40 tracking-widest">×</span>
                    <div className="w-px h-12 bg-gradient-to-b from-transparent via-prestige-gold/30 to-transparent" />
                  </div>

                  <SignatureZone
                    name={challengerBName}
                    side="right"
                    onSigned={handleSignB}
                    signed={signedB}
                  />
                </div>

                <div className="px-6 pb-6 text-center">
                  <p className="font-mono text-[10px] text-white/20 tracking-wider">
                    {signedA && !signedB && `${challengerAName} a signé — en attente de ${challengerBName}`}
                    {signedB && !signedA && `${challengerBName} a signé — en attente de ${challengerAName}`}
                    {!signedA && !signedB && 'Maintenez votre empreinte 1.5s pour signer'}
                  </p>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
