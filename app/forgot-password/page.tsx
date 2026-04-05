'use client';

import { useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AlertCircle, Mail } from 'lucide-react';
import { AppBackButton } from '@/components/AppBackButton';
import { supabase } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
      });
      if (resetError) throw resetError;
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Erreur lors de l\'envoi. Vérifie ton email.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="max-w-md w-full bg-surface-2 rounded-2xl p-8 border-2 border-green-500 text-center"
        >
          <div className="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">✓</span>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Email envoyé!</h2>
          <p className="text-gray-400 mb-6">
            Vérifie ta boîte email pour réinitialiser ton mot de passe.
          </p>
          <Link
            href="/login"
            className="inline-block brand-gradient text-black font-bold px-6 py-3 rounded-xl"
          >
            Retour à la connexion
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="max-w-md w-full"
      >
        <div className="mb-6">
          <AppBackButton fallback="/login" />
        </div>

        <div className="text-center mb-8">
          <div className="w-16 h-16 brand-gradient rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🥊</span>
          </div>
          <h1 className="text-3xl font-black text-gradient">
            Mot de passe oublié?
          </h1>
          <p className="text-gray-400 mt-2">Entre ton email pour réinitialiser</p>
        </div>

        <div className="card rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="bg-red-500/10 border border-red-500/50 rounded-lg p-3 flex items-center gap-2"
              >
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" aria-hidden />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="forgot-email" className="block text-white font-semibold mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden />
                <input
                  id="forgot-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ton@email.com"
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full brand-gradient hover:opacity-90 text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? 'Envoi...' : 'Réinitialiser le mot de passe'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
