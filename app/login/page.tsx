'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, AlertCircle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefLogo } from '@/components/BeefLogo';
import { sanitizeReturnPath } from '@/lib/navigation-return';

function loginPostAuthPath(searchParams: ReturnType<typeof useSearchParams>): string {
  const raw = searchParams.get('redirect') ?? searchParams.get('next');
  return sanitizeReturnPath(raw) ?? '/feed';
}

function normalizeIdentifier(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('@') ? trimmed.slice(1) : trimmed;
}

function AppleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { signIn, signInWithGoogle, signInWithApple, signInWithMagicLink, user } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isMagicLinkMode, setIsMagicLinkMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [identifierError, setIdentifierError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    router.push(loginPostAuthPath(searchParams));
  }, [user, router, searchParams]);

  useEffect(() => {
    const q = searchParams.get('error');
    if (!q) return;
    const msg =
      q === 'verification_failed'
        ? 'La vérification a échoué. Réessaie avec un autre mode de connexion.'
        : decodeURIComponent(q.replace(/\+/g, ' '));
    setOauthError(msg);
  }, [searchParams]);

  const trimmedIdentifier = normalizeIdentifier(identifier);

  const handleApple = async () => {
    setAppleLoading(true);
    setOauthError(null);
    const { error } = await signInWithApple();
    if (error) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Erreur lors de la connexion avec Apple.';
      setOauthError(msg);
      setAppleLoading(false);
    }
  };

  const handleGoogle = async () => {
    setGoogleLoading(true);
    setOauthError(null);
    const { error } = await signInWithGoogle();
    if (error) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Erreur lors de la connexion avec Google.';
      setOauthError(msg);
      setGoogleLoading(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdentifierError(null);
    setMagicLinkSent(false);
    if (!trimmedIdentifier) {
      setIdentifierError('Indique ton adresse e-mail.');
      return;
    }
    setMagicLoading(true);
    const { error } = await signInWithMagicLink(trimmedIdentifier);
    setMagicLoading(false);
    if (error) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : "Impossible d'envoyer le lien magique.";
      setIdentifierError(msg);
      return;
    }
    setMagicLinkSent(true);
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIdentifierError(null);
    setPasswordError(null);
    if (!trimmedIdentifier) {
      setIdentifierError('Indique ton e-mail ou @pseudo.');
      return;
    }
    if (!password) {
      setPasswordError('Indique ton mot de passe.');
      return;
    }
    setPasswordLoading(true);
    const { error } = await signIn(trimmedIdentifier, password);
    setPasswordLoading(false);
    if (error) {
      const msg =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Identifiant ou mot de passe incorrect.';
      if (msg.includes('introuvable') || msg.includes('banni')) {
        setIdentifierError(msg);
      } else {
        setPasswordError('Identifiant ou mot de passe incorrect.');
      }
      return;
    }
    router.push(loginPostAuthPath(searchParams));
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-transparent p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="w-full max-w-md mx-auto"
      >
        <main
          aria-labelledby="login-heading"
          className="rounded-3xl border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-md"
        >
          <div className="mb-8 text-center">
            <BeefLogo size={52} className="mx-auto mb-4" aria-hidden />
            <h1 id="login-heading" className="text-2xl font-extrabold tracking-tight text-white">
              Beefs
            </h1>
            <p id="login-subtitle" className="mt-1 text-sm text-white/50">
              Entre dans l&apos;arène
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleApple()}
            disabled={appleLoading}
            aria-busy={appleLoading}
            aria-label="Continuer avec Apple"
            className="mb-3 flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white py-3.5 text-sm font-semibold text-black transition-all hover:bg-white/90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {appleLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800" />
            ) : (
              <>
                <AppleIcon className="h-5 w-5" />
                <span>Continuer avec Apple</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={() => void handleGoogle()}
            disabled={googleLoading}
            aria-busy={googleLoading}
            aria-label="Continuer avec Google"
            className="mb-5 flex w-full items-center justify-center gap-3 rounded-full border border-white/10 bg-white/95 py-3.5 text-sm font-semibold text-gray-800 transition-all hover:bg-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {googleLoading ? (
              <span className="h-5 w-5 animate-spin rounded-full border-2 border-gray-400 border-t-gray-800" />
            ) : (
              <>
                <Image
                  alt="Google Logo"
                  className="object-contain"
                  height={20}
                  src="/google-oauth-logo-120.png"
                  width={20}
                />
                <span>Continuer avec Google</span>
              </>
            )}
          </button>

          {oauthError && (
            <p role="alert" className="mb-4 flex items-start gap-1.5 text-xs text-red-400">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              <span>{oauthError}</span>
            </p>
          )}

          <div className="mb-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-xs font-medium text-white/40">ou</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <form
            onSubmit={isMagicLinkMode ? handleMagicLink : handlePasswordLogin}
            className="space-y-4"
          >
            <div>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
                <input
                  id="login-identifier"
                  type={isMagicLinkMode ? 'email' : 'text'}
                  name={isMagicLinkMode ? 'email' : 'username'}
                  autoComplete={isMagicLinkMode ? 'email' : 'username'}
                  value={identifier}
                  onChange={(e) => {
                    setIdentifier(e.target.value);
                    setIdentifierError(null);
                    setMagicLinkSent(false);
                  }}
                  placeholder={isMagicLinkMode ? 'toi@exemple.com' : 'E-mail ou @pseudo...'}
                  aria-invalid={!!identifierError}
                  className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-11 pr-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
                />
              </div>
              {identifierError && (
                <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-xs text-red-400">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>{identifierError}</span>
                </p>
              )}
              {magicLinkSent && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-emerald-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span>Lien magique envoyé — vérifie ta boîte mail.</span>
                </p>
              )}
            </div>

            {!isMagicLinkMode && (
              <>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    name="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      setPasswordError(null);
                    }}
                    placeholder="Mot de passe"
                    aria-invalid={!!passwordError}
                    className="w-full rounded-full border border-white/10 bg-white/5 py-3 pl-11 pr-11 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {passwordError && (
                  <p role="alert" className="flex items-start gap-1.5 text-xs text-red-400">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{passwordError}</span>
                  </p>
                )}
              </>
            )}

            {!isMagicLinkMode && (
              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-white/45 transition-colors hover:text-white/70"
                >
                  Mot de passe oublié ?
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={magicLoading || passwordLoading}
              className="brand-gradient flex w-full items-center justify-center gap-2 rounded-full py-3 text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
            >
              {magicLoading || passwordLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <>
                  <span>{isMagicLinkMode ? 'Recevoir le lien magique' : 'Se connecter'}</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => {
                setIsMagicLinkMode(!isMagicLinkMode);
                setIdentifierError(null);
                setPasswordError(null);
                setMagicLinkSent(false);
              }}
              className="text-xs font-medium text-white/50 transition-colors hover:text-white"
            >
              {isMagicLinkMode
                ? 'Utiliser un mot de passe à la place'
                : 'Connexion sans mot de passe (Lien Magique)'}
            </button>
          </div>
        </main>
      </motion.div>
    </div>
  );
}

function LoginLoadingFallback() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-transparent p-4">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginLoadingFallback />}>
      <LoginPageContent />
    </Suspense>
  );
}
