'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Mail, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (user?.email_confirmed_at) {
      router.push('/live');
    }
  }, [user, router]);

  const handleResend = async () => {
    setResending(true);
    // TODO: Implement resend email logic
    setTimeout(() => {
      setResending(false);
      setResent(true);
      setTimeout(() => setResent(false), 3000);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-8 border border-gray-700 text-center">
          <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-orange-500" />
          </div>
          
          <h1 className="text-2xl font-black text-white mb-2">Vérifie ton email</h1>
          <p className="text-gray-400 mb-6">
            Nous avons envoyé un lien de vérification à{' '}
            <span className="text-white font-semibold">{user?.email}</span>
          </p>

          <div className="bg-black/40 rounded-lg p-4 mb-6">
            <p className="text-gray-300 text-sm">
              Clique sur le lien dans l'email pour activer ton compte.
              <br />
              <span className="text-gray-500 text-xs">
                (Pense à vérifier tes spams)
              </span>
            </p>
          </div>

          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="flex items-center justify-center gap-2 w-full bg-gradient-to-r from-gray-700 to-gray-800 hover:from-gray-600 hover:to-gray-700 text-white font-bold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {resending ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span>Envoi en cours...</span>
              </>
            ) : resent ? (
              <span>✓ Email renvoyé!</span>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                <span>Renvoyer l'email</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
