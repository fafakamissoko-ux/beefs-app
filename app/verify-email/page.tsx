'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { AppBackButton } from '@/components/AppBackButton';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user?.email_confirmed_at) {
      router.push('/live');
    }
  }, [user, router]);

  const handleResend = async () => {
    if (!user?.email) return;
    setResending(true);
    setError('');

    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
      });
      if (resendError) throw resendError;
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err: any) {
      setError(err.message || 'Erreur lors du renvoi');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full"
      >
        <AppBackButton className="mb-4" fallback="/login" />
        <main aria-labelledby="verify-email-heading">
          <div className="card rounded-2xl p-8 border text-center">
            <div
              className="w-16 h-16 bg-brand-500/20 rounded-full flex items-center justify-center mx-auto mb-4"
              aria-hidden
            >
              <Mail className="w-8 h-8 text-brand-400" />
            </div>

            <h1 id="verify-email-heading" className="text-2xl font-black text-white mb-2">
              Vérifie ton e-mail
            </h1>
            <p className="text-gray-400 mb-6">
              Nous avons envoyé un lien de vérification à{' '}
              <span className="text-white font-semibold">{user?.email}</span>
            </p>

            <div className="bg-white/[0.04] rounded-lg p-4 mb-6 border border-white/[0.06]">
              <p className="text-gray-300 text-sm">
                Clique sur le lien dans l’e-mail pour activer ton compte.
                <br />
                <span className="text-gray-500 text-xs">(Pense à vérifier tes spams)</span>
              </p>
            </div>

            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400 text-sm text-left"
              >
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={resending || resent}
              aria-busy={resending}
              aria-describedby="verify-resend-hint"
              className="flex items-center justify-center gap-2 w-full font-bold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all border border-white/[0.1] bg-white/[0.08] hover:bg-white/[0.12] text-white"
            >
              {resending ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" aria-hidden />
                  <span>Envoi en cours…</span>
                </>
              ) : resent ? (
                <span role="status">E-mail renvoyé</span>
              ) : (
                <>
                  <RefreshCw className="w-5 h-5" aria-hidden />
                  <span>Renvoyer l’e-mail</span>
                </>
              )}
            </button>
            <p id="verify-resend-hint" className="sr-only">
              Renvoie un nouveau lien de vérification à ton adresse e-mail.
            </p>
          </div>
        </main>
      </motion.div>
    </div>
  );
}
