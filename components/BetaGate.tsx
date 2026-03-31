'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Lock, ArrowRight } from 'lucide-react';
import { BeefLogo } from './BeefLogo';

const BETA_CODE = process.env.NEXT_PUBLIC_BETA_CODE || '';

export function BetaGate({ children }: { children: React.ReactNode }) {
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('beefs-beta-access');
    setHasAccess(stored === 'true');
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (code.trim().toLowerCase() === BETA_CODE.toLowerCase()) {
      localStorage.setItem('beefs-beta-access', 'true');
      setHasAccess(true);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  // Loading state
  if (hasAccess === null) return null;

  if (hasAccess || !BETA_CODE) return <>{children}</>;

  // Gate
  return (
    <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(232, 58, 20, 0.06)' }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(0, 229, 255, 0.04)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative max-w-sm w-full"
      >
        <div className="text-center mb-8">
          <BeefLogo size={56} className="mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-gradient tracking-tight mb-1">Beefs</h1>
          <p className="text-gray-500 text-sm">Accès anticipé — Bêta privée</p>
        </div>

        <div className="card p-6">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(232, 58, 20, 0.1)' }}>
              <Lock className="w-5 h-5 text-brand-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Code d'accès requis</p>
              <p className="text-gray-500 text-xs">Entrez le code pour accéder à la bêta</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Code d'accès"
              autoFocus
              className={`input-field text-center text-lg font-semibold tracking-widest ${error ? 'border-red-500 animate-shake' : ''}`}
            />

            {error && (
              <p className="text-red-400 text-xs text-center">Code incorrect</p>
            )}

            <button
              type="submit"
              className="w-full flex items-center justify-center gap-2 py-3 text-white font-semibold rounded-xl transition-all active:scale-[0.98] brand-gradient hover:shadow-glow"
            >
              <span>Accéder</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          <p className="text-gray-600 text-xs text-center mt-4">
            Pas de code ? Contactez l'équipe Beefs pour obtenir un accès.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
