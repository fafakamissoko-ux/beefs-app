'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Mail, Lock, User, Eye, EyeOff, AlertCircle, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { BeefLogo } from '@/components/BeefLogo';
import { supabase } from '@/lib/supabase/client';
import {
  getPasswordPolicyProgress,
  PASSWORD_POLICY_LABELS,
  PASSWORD_POLICY_SHORT_HINT,
  validatePasswordPolicy,
} from '@/lib/password-policy';
import { validateSignupEmail } from '@/lib/email-signup-policy';

type SignupFieldKey = 'username' | 'email' | 'password' | 'confirmPassword' | 'oauth';

const SIGNUP_FIELD_ORDER: Array<Exclude<SignupFieldKey, 'oauth'>> = [
  'username',
  'email',
  'password',
  'confirmPassword',
];

function focusSignupInput(key: Exclude<SignupFieldKey, 'oauth'>) {
  const id =
    key === 'confirmPassword' ? 'signup-confirm-password' : `signup-${key}`;
  const el = document.getElementById(id);
  el?.focus({ preventScroll: false });
  el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function focusFirstSignupError(next: Partial<Record<SignupFieldKey, string>>) {
  requestAnimationFrame(() => {
    for (const k of SIGNUP_FIELD_ORDER) {
      if (next[k]) {
        focusSignupInput(k);
        break;
      }
    }
  });
}

function mapSignUpApiError(message: string): { key: SignupFieldKey; text: string } {
  const m = message.toLowerCase();
  if (
    m.includes('already registered') ||
    m.includes('already been registered') ||
    m.includes('user already exists') ||
    m.includes('email address is already')
  ) {
    return { key: 'email', text: 'Cette adresse e-mail est déjà utilisée.' };
  }
  if (m.includes('invalid login credentials') || m.includes('invalid email or password')) {
    return { key: 'email', text: message || 'Inscription impossible. Vérifie l’e-mail et le mot de passe.' };
  }
  if (m.includes('password') && (m.includes('weak') || m.includes('short') || m.includes('least'))) {
    return { key: 'password', text: message };
  }
  if (m.includes('email') && m.includes('invalid')) {
    return { key: 'email', text: 'Adresse e-mail invalide.' };
  }
  if (m.includes('jetable') || m.includes('disposable') || m.includes('temporaire')) {
    return { key: 'email', text: message };
  }
  return { key: 'email', text: message || 'Inscription impossible. Réessaie ou contacte le support.' };
}

function InlineFieldError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-red-400 text-xs mt-1.5 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, signInWithGoogle, user } = useAuth();
  
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SignupFieldKey, string>>>({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken'>('idle');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [confirmedAge, setConfirmedAge] = useState(false);
  const usernameDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Redirect if already logged in
  useEffect(() => {
    if (user) {
      router.push('/live');
    }
  }, [user, router]);

  const checkUsernameAvailability = useCallback(async (username: string) => {
    if (username.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus('checking');
    const { data: available, error } = await supabase.rpc('check_username_available', {
      p_username: username,
    });
    if (error) {
      setUsernameStatus('idle');
      return;
    }
    setUsernameStatus(available === true ? 'available' : 'taken');
  }, []);

  const handleUsernameChange = (value: string) => {
    setFormData({ ...formData, username: value });
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (value.length < 3) {
      setUsernameStatus('idle');
      return;
    }
    usernameDebounceRef.current = setTimeout(() => {
      checkUsernameAvailability(value);
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, []);

  const passwordProgress = getPasswordPolicyProgress(formData.password);

  const validateUsernameBlur = useCallback((raw: string) => {
    const v = raw.trim();
    setFieldErrors((prev) => {
      const { username: _u, ...rest } = prev;
      if (v.length === 0) return rest;
      if (v.length < 3) {
        return { ...rest, username: 'Le pseudo doit contenir au moins 3 caractères.' };
      }
      return rest;
    });
  }, []);

  const validateEmailBlur = useCallback((raw: string) => {
    const trimmed = raw.trim();
    setFieldErrors((prev) => {
      const { email: _e, ...rest } = prev;
      if (trimmed.length === 0) return rest;
      const policy = validateSignupEmail(trimmed);
      if (!policy.ok) return { ...rest, email: policy.message };
      return rest;
    });
  }, []);

  const validatePasswordBlur = useCallback((raw: string) => {
    setFieldErrors((prev) => {
      const { password: _pw, ...rest } = prev;
      if (raw.length === 0) return rest;
      const policy = validatePasswordPolicy(raw);
      if (!policy.ok) {
        return {
          ...rest,
          password:
            'Le mot de passe ne respecte pas encore tous les critères (voir la liste ci-dessous).',
        };
      }
      return rest;
    });
  }, []);

  const validateConfirmBlur = useCallback((password: string, confirm: string) => {
    setFieldErrors((prev) => {
      const { confirmPassword: _c, ...rest } = prev;
      if (confirm.length === 0) return rest;
      if (password !== confirm) {
        return { ...rest, confirmPassword: 'Les deux mots de passe doivent être identiques.' };
      }
      return rest;
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});
    setLoading(true);

    const next: Partial<Record<SignupFieldKey, string>> = {};

    if (formData.username.trim().length < 3) {
      next.username = 'Le pseudo doit contenir au moins 3 caractères.';
    }

    const emailPolicy = validateSignupEmail(formData.email);
    if (!emailPolicy.ok) {
      next.email = emailPolicy.message;
    }

    const policy = validatePasswordPolicy(formData.password);
    if (!policy.ok) {
      /* La liste à coches détaille les critères ; éviter le long paragraphe qui ressemble à un seul bandeau. */
      next.password =
        'Le mot de passe ne respecte pas encore tous les critères (voir la liste ci-dessous).';
    }

    if (formData.password !== formData.confirmPassword) {
      next.confirmPassword = 'Les deux mots de passe doivent être identiques.';
    }

    if (Object.keys(next).length > 0) {
      setFieldErrors(next);
      setLoading(false);
      focusFirstSignupError(next);
      return;
    }

    const { data: isBanned, error: banCheckErr } = await supabase.rpc('is_email_banned', {
      p_email: formData.email.toLowerCase(),
    });

    if (banCheckErr || isBanned === true) {
      if (banCheckErr) {
        setFieldErrors({ email: 'Vérification impossible. Réessaie dans un instant.' });
        setLoading(false);
        focusFirstSignupError({ email: 'Vérification impossible. Réessaie dans un instant.' });
        return;
      }
      setFieldErrors({
        email: 'Cette adresse e-mail ne peut pas être utilisée pour créer un compte.',
      });
      setLoading(false);
      focusFirstSignupError({ email: 'Cette adresse e-mail ne peut pas être utilisée pour créer un compte.' });
      return;
    }

    const { error: signUpError } = await signUp(
      formData.email,
      formData.password,
      formData.username
    );

    if (signUpError) {
      const msg =
        typeof signUpError === 'object' && signUpError !== null && 'message' in signUpError
          ? String((signUpError as { message?: string }).message || '')
          : 'Une erreur est survenue.';
      const mapped = mapSignUpApiError(msg);
      setFieldErrors({ [mapped.key]: mapped.text });
      setLoading(false);
      focusFirstSignupError({ [mapped.key]: mapped.text });
    } else {
      setSuccess(true);
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
            Vérifie ta boîte email et clique sur le lien pour activer ton compte.
          </p>
          <Link
            href="/login"
            className="inline-block brand-gradient text-black font-bold px-6 py-3 rounded-lg"
          >
            Se connecter
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
        {/* Logo */}
        <div className="text-center mb-8">
          <BeefLogo size={64} className="mx-auto mb-4" />
          <h1 className="text-3xl font-black text-gradient">
            Beefs
          </h1>
          <p className="text-gray-400 mt-2">Créer un compte</p>
        </div>

        {/* Form */}
        <div className="card rounded-2xl p-8">
          {/* Google Sign-Up */}
          <button
            type="button"
            onClick={async () => {
              setGoogleLoading(true);
              setFieldErrors((prev) => {
                const { oauth: _o, ...rest } = prev;
                return rest;
              });
              const { error: gError } = await signInWithGoogle();
              if (gError) {
                setFieldErrors((prev) => ({
                  ...prev,
                  oauth: gError.message || 'Erreur lors de la connexion avec Google.',
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
          <InlineFieldError id="signup-oauth-error" message={fieldErrors.oauth} />

          {/* Separator */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-gray-500 text-xs font-medium">ou</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Username */}
            <div>
              <label htmlFor="signup-username" className="block text-white font-semibold mb-2">
                Pseudo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden />
                <input
                  id="signup-username"
                  type="text"
                  name="username"
                  autoComplete="username"
                  value={formData.username}
                  onChange={(e) => {
                    handleUsernameChange(e.target.value);
                    setFieldErrors((p) => {
                      const { username: _u, ...rest } = p;
                      return rest;
                    });
                  }}
                  onBlur={(e) => validateUsernameBlur(e.target.value)}
                  placeholder="ton_pseudo"
                  aria-invalid={!!fieldErrors.username}
                  aria-describedby={
                    fieldErrors.username ? 'signup-username-error' : undefined
                  }
                  className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-3 pl-10 pr-10 text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none ${
                    fieldErrors.username ? 'beefs-field-invalid' : ''
                  }`}
                  required
                />
                {usernameStatus !== 'idle' && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {usernameStatus === 'checking' && <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />}
                    {usernameStatus === 'available' && <Check className="w-5 h-5 text-green-500" />}
                    {usernameStatus === 'taken' && <X className="w-5 h-5 text-red-500" />}
                  </div>
                )}
              </div>
              {usernameStatus === 'available' && (
                <p className="text-green-500 text-xs mt-1">Disponible</p>
              )}
              {usernameStatus === 'taken' && (
                <p className="text-red-500 text-xs mt-1">Pseudo déjà pris</p>
              )}
              <InlineFieldError id="signup-username-error" message={fieldErrors.username} />
            </div>

            {/* Email */}
            <div>
              <label htmlFor="signup-email" className="block text-white font-semibold mb-2">
                Email
              </label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden />
                <input
                  id="signup-email"
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    setFieldErrors((p) => {
                      const { email: _e, ...rest } = p;
                      return rest;
                    });
                  }}
                  onBlur={(e) => validateEmailBlur(e.target.value)}
                  placeholder="ton@email.com"
                  autoCapitalize="none"
                  aria-invalid={!!fieldErrors.email}
                  aria-describedby={fieldErrors.email ? 'signup-email-error' : undefined}
                  className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-3 pl-10 pr-4 text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none ${
                    fieldErrors.email ? 'beefs-field-invalid' : ''
                  }`}
                  required
                />
              </div>
              <InlineFieldError id="signup-email-error" message={fieldErrors.email} />
            </div>

            {/* Password */}
            <div>
              <label htmlFor="signup-password" className="block text-white font-semibold mb-2">
                Mot de passe
              </label>
              <p id="signup-password-hint" className="text-gray-500 text-xs mb-2">
                {PASSWORD_POLICY_SHORT_HINT}
              </p>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden />
                <input
                  id="signup-password"
                  type={showPassword ? 'text' : 'password'}
                  name="new-password"
                  autoComplete="new-password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    setFieldErrors((p) => {
                      const { password: _pw, ...rest } = p;
                      return rest;
                    });
                  }}
                  onBlur={(e) => validatePasswordBlur(e.target.value)}
                  placeholder="••••••••"
                  aria-describedby={
                    [
                      'signup-password-hint',
                      'signup-password-criteria',
                      fieldErrors.password ? 'signup-password-error' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  aria-invalid={!!fieldErrors.password}
                  className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-3 pl-10 pr-12 text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none ${
                    fieldErrors.password ? 'beefs-field-invalid' : ''
                  }`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                </button>
              </div>
              <InlineFieldError id="signup-password-error" message={fieldErrors.password} />
              <ul
                id="signup-password-criteria"
                className="mt-3 space-y-1.5 text-xs"
                aria-label="Critères du mot de passe"
              >
                {(
                  [
                    ['lengthOk', PASSWORD_POLICY_LABELS.length] as const,
                    ['lower', PASSWORD_POLICY_LABELS.lower] as const,
                    ['upper', PASSWORD_POLICY_LABELS.upper] as const,
                    ['digit', PASSWORD_POLICY_LABELS.digit] as const,
                    ['special', PASSWORD_POLICY_LABELS.special] as const,
                  ] as const
                ).map(([key, label]) => {
                  const ok = passwordProgress[key];
                  return (
                    <li
                      key={key}
                      className={`flex items-center gap-2 ${ok ? 'text-emerald-400' : 'text-gray-500'}`}
                    >
                      {ok ? (
                        <Check className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
                      ) : (
                        <X className="w-3.5 h-3.5 flex-shrink-0 opacity-50" aria-hidden />
                      )}
                      <span>{label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="signup-confirm-password" className="block text-white font-semibold mb-2">
                Confirmer le mot de passe
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" aria-hidden />
                <input
                  id="signup-confirm-password"
                  type={showPassword ? 'text' : 'password'}
                  name="confirm-password"
                  autoComplete="new-password"
                  value={formData.confirmPassword}
                  onChange={(e) => {
                    setFormData({ ...formData, confirmPassword: e.target.value });
                    setFieldErrors((p) => {
                      const { confirmPassword: _c, ...rest } = p;
                      return rest;
                    });
                  }}
                  onBlur={(e) => {
                    const pwd =
                      (document.getElementById('signup-password') as HTMLInputElement | null)
                        ?.value ?? '';
                    validateConfirmBlur(pwd, e.target.value);
                  }}
                  placeholder="••••••••"
                  aria-invalid={!!fieldErrors.confirmPassword}
                  aria-describedby={
                    fieldErrors.confirmPassword ? 'signup-confirm-password-error' : undefined
                  }
                  className={`w-full rounded-xl border border-white/[0.06] bg-white/[0.04] py-3 pl-10 pr-4 text-white placeholder-gray-500 transition-colors focus:border-brand-500 focus:outline-none ${
                    fieldErrors.confirmPassword ? 'beefs-field-invalid' : ''
                  }`}
                  required
                />
              </div>
              <InlineFieldError
                id="signup-confirm-password-error"
                message={fieldErrors.confirmPassword}
              />
            </div>

            {/* CGU Checkbox */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="acceptTerms"
                checked={acceptedTerms}
                onChange={(e) => setAcceptedTerms(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-brand-500"
              />
              <label htmlFor="acceptTerms" className="text-sm text-gray-400">
                J&apos;accepte les{' '}
                <Link href="/cgu" className="text-brand-400 hover:underline">
                  Conditions Générales d&apos;Utilisation
                </Link>{' '}
                et la{' '}
                <Link href="/privacy" className="text-brand-400 hover:underline">
                  Politique de Confidentialité
                </Link>
              </label>
            </div>

            {/* Age Confirmation */}
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                id="confirmAge"
                checked={confirmedAge}
                onChange={(e) => setConfirmedAge(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-white/[0.04] accent-brand-500"
              />
              <label htmlFor="confirmAge" className="text-sm text-gray-400">
                Je confirme avoir 13 ans ou plus
              </label>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !acceptedTerms || !confirmedAge}
              className="w-full brand-gradient text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90"
            >
              {loading ? 'Création en cours...' : "S'inscrire"}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-400">
              Déjà un compte?{' '}
              <Link href="/login" className="text-brand-400 hover:text-brand-300 font-semibold">
                Se connecter
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
