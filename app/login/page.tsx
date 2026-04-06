'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AtSign, Lock, Eye, EyeOff, AlertCircle, ArrowRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefLogo } from '@/components/BeefLogo';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signInWithGoogle, user } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{
    identifier?: string;
    password?: string;
    oauth?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  useEffect(() => {
    if (user) router.push(searchParams.get('redirect') || '/feed');
  }, [user, router, searchParams]);

  const focusLoginField = useCallback((key: 'identifier' | 'password') => {
    requestAnimationFrame(() => {
      const id = key === 'identifier' ? 'login-identifier' : 'login-password';
      const el = document.getElementById(id);
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setLoading(true);

    let email = identifier;

    // If not an email, look up by username (case-insensitive)
    if (!identifier.includes('@')) {
      const { data } = await supabase
        .from('users')
        .select('email')
        .ilike('username', identifier)
        .single();

      if (!data?.email) {
        setFieldErrors({ identifier: 'Utilisateur introuvable.' });
        setLoading(false);
        focusLoginField('identifier');
        return;
      }
      email = data.email;
    }

    // Check if user is banned
    const { data: userData } = await supabase
      .from('users')
      .select('is_banned, banned_until, ban_reason')
      .ilike('email', email)
      .single();

    if (userData?.is_banned) {
      const isPermanent = !userData.banned_until;
      const isStillBanned = isPermanent || new Date(userData.banned_until) > new Date();
      if (isStillBanned) {
        const banMsg = isPermanent
          ? 'Compte suspendu définitivement.'
          : `Compte suspendu jusqu'au ${new Date(userData.banned_until).toLocaleDateString('fr-FR')}.`;
        setFieldErrors({
          identifier: `${banMsg}${userData.ban_reason ? ` Raison : ${userData.ban_reason}` : ''}`,
        });
        setLoading(false);
        focusLoginField('identifier');
        return;
      }
    }

    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setFieldErrors({
        password: 'Identifiant ou mot de passe incorrect.',
      });
      setLoading(false);
      focusLoginField('password');
    } else {
      router.push(searchParams.get('redirect') || '/feed');
    }
  };

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(232, 58, 20, 0.06)' }} />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full blur-[120px]" style={{ background: 'rgba(0, 229, 255, 0.04)' }} />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative max-w-sm w-full"
      >
        <main aria-labelledby="login-heading">
        <div className="text-center mb-8">
          <BeefLogo size={48} className="mx-auto mb-3" aria-hidden />
          <h1 id="login-heading" className="text-2xl font-extrabold text-gradient tracking-tight">
            Beefs
          </h1>
          <p id="login-subtitle" className="text-gray-500 text-sm mt-1">
            Connecte-toi pour continuer
          </p>
        </div>

        <div className="card p-6">
          {/* Google Sign-In */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true);
              setFieldErrors((p) => {
                const { oauth: _o, ...rest } = p;
                return rest;
              });
              const { error } = await signInWithGoogle();
              if (error) {
                setFieldErrors((p) => ({
                  ...p,
                  oauth: error.message || 'Erreur lors de la connexion avec Google.',
                }));
                setGoogleLoading(false);
              }
            }}
            disabled={googleLoading}
            aria-busy={googleLoading}
            aria-label="Continuer avec Google"
            className="w-full flex items-center justify-center gap-3 py-3 bg-white hover:bg-gray-100 text-gray-800 font-semibold rounded-xl border border-white/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mb-4"
          >
            {googleLoading ? (
              <div className="w-5 h-5 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                <span>Continuer avec Google</span>
              </>
            )}
          </button>
          {fieldErrors.oauth && (
            <p
              id="login-oauth-error"
              role="alert"
              className="text-red-400 text-xs mt-2 flex items-start gap-1.5 mb-1"
            >
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
              <span>{fieldErrors.oauth}</span>
            </p>
          )}

          {/* Separator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-500 text-xs font-medium">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" aria-describedby="login-subtitle">
            <div>
              <label htmlFor="login-identifier" className="block text-sm font-medium text-gray-300 mb-1.5">
                Pseudo ou email
              </label>
              <div className="relative">
                <AtSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden />
                <input
                  id="login-identifier"
                  type="text"
                  name="identifier"
                  autoComplete="username"
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setFieldErrors((p) => {
                      const { identifier: _i, ...rest } = p;
                      return rest;
                    });
                  }}
                  placeholder="ton_pseudo ou email"
                  aria-invalid={!!fieldErrors.identifier}
                  aria-describedby={
                    [fieldErrors.identifier ? 'login-identifier-error' : '', 'login-identifier-hint']
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  className={`input-field pl-10 ${fieldErrors.identifier ? 'beefs-field-invalid' : ''}`}
                  required
                />
              </div>
              {fieldErrors.identifier && (
                <p id="login-identifier-error" role="alert" className="text-red-400 text-xs mt-1.5 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
                  <span>{fieldErrors.identifier}</span>
                </p>
              )}
              <p id="login-identifier-hint" className="sr-only">
                Tu peux te connecter avec ton pseudo Beefs ou ton adresse e-mail.
              </p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="login-password" className="block text-sm font-medium text-gray-300">
                  Mot de passe
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-brand-400 hover:text-brand-300 transition-colors"
                  aria-label="Mot de passe oublié"
                >
                  Oublié ?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" aria-hidden />
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFieldErrors((p) => {
                      const { password: _pw, ...rest } = p;
                      return rest;
                    });
                  }}
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.password}
                  aria-describedby={fieldErrors.password ? 'login-password-error' : undefined}
                  className={`input-field pl-10 pr-11 ${fieldErrors.password ? 'beefs-field-invalid' : ''}`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" aria-hidden /> : <Eye className="w-4 h-4" aria-hidden />}
                </button>
              </div>
              {fieldErrors.password && (
                <p id="login-password-error" role="alert" className="text-red-400 text-xs mt-1.5 flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
                  <span>{fieldErrors.password}</span>
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              aria-busy={loading}
              className="w-full flex items-center justify-center gap-2 py-3 text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98] brand-gradient hover:shadow-glow"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden />
                  <span>Connexion…</span>
                </span>
              ) : (
                <>
                  <span>Se connecter</span>
                  <ArrowRight className="w-4 h-4" aria-hidden />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              Pas encore inscrit ?{' '}
              <Link href="/signup" className="text-brand-400 hover:text-brand-300 font-medium transition-colors">Créer un compte</Link>
            </p>
          </div>
        </div>
        </main>
      </motion.div>
    </div>
  );
}
