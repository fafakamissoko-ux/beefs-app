'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { passwordChangeSchema, type PasswordChangeFormValues } from '@/lib/schemas';
import { PASSWORD_POLICY_SHORT_HINT } from '@/lib/password-policy';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

const SETTINGS_INPUT =
  'w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors';
const SETTINGS_BTN_PRIMARY =
  'brand-gradient flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

function PasswordInlineError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-red-400 text-xs mt-1.5 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

type PasswordMutationResult = { needsOtp: true } | { needsOtp: false };

function isInvalidCredentialMessage(msg: string): boolean {
  const lower = msg.toLowerCase();
  return (
    lower.includes('invalid') &&
    (lower.includes('credential') || lower.includes('password') || lower.includes('login'))
  );
}

function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: string }).message);
  }
  return 'Erreur lors du changement de mot de passe';
}

export function PasswordSettingsForm() {
  const { toast } = useToast();
  const [passwordStep, setPasswordStep] = useState<'form' | 'otp'>('form');
  const [passwordOtp, setPasswordOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<PasswordChangeFormValues>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const resetPasswordChangeForm = () => {
    reset();
    setPasswordOtp('');
    setPasswordStep('form');
    setOtpError('');
    clearErrors();
  };

  const changePasswordMutation = useMutation({
    mutationFn: async (data: PasswordChangeFormValues): Promise<PasswordMutationResult> => {
      const { error } = await supabase.auth.updateUser({
        password: data.new_password,
        current_password: data.current_password,
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'reauthentication_needed' || code === 'reauth_nonce_missing') {
          const { error: reErr } = await supabase.auth.reauthenticate();
          if (reErr) throw reErr;
          return { needsOtp: true };
        }
        throw error;
      }

      return { needsOtp: false };
    },
    onSuccess: (result) => {
      if (result.needsOtp) {
        setPasswordStep('otp');
        setOtpError('');
        toast(
          'Un code de confirmation a été envoyé (e-mail, ou SMS si l’e-mail n’est pas vérifié). Saisis-le ci-dessous pour valider le changement.',
          'success',
        );
        return;
      }
      toast('Mot de passe modifié avec succès !', 'success');
      resetPasswordChangeForm();
    },
    onError: (error: unknown) => {
      const msg = getErrorMessage(error);
      if (isInvalidCredentialMessage(msg)) {
        setError('current_password', {
          message: 'Mot de passe actuel incorrect ou session expirée.',
        });
        return;
      }
      toast(msg, 'error');
    },
  });

  const confirmOtpMutation = useMutation({
    mutationFn: async ({ data, otp }: { data: PasswordChangeFormValues; otp: string }) => {
      const { error } = await supabase.auth.updateUser({
        password: data.new_password,
        current_password: data.current_password,
        nonce: otp,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Mot de passe modifié avec succès !', 'success');
      resetPasswordChangeForm();
    },
    onError: (error: unknown) => {
      const msg = getErrorMessage(error);
      if (isInvalidCredentialMessage(msg)) {
        setError('current_password', {
          message: 'Mot de passe actuel incorrect ou session expirée.',
        });
        return;
      }
      toast(msg, 'error');
    },
  });

  const resendOtpMutation = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
    },
    onSuccess: () => {
      toast('Un nouveau code a été envoyé.', 'success');
    },
    onError: (error: unknown) => {
      const msg = error instanceof Error ? error.message : 'Impossible d’envoyer le code.';
      toast(msg, 'error');
    },
  });

  const onSubmitForm = (data: PasswordChangeFormValues) => {
    clearErrors();
    changePasswordMutation.mutate(data);
  };

  const onSubmitOtp = () => {
    setOtpError('');
    const code = passwordOtp.trim();
    if (!code) {
      setOtpError('Saisis le code reçu par e-mail ou SMS.');
      return;
    }

    const data = getValues();
    if (!data.current_password.trim()) {
      setError('current_password', { message: 'Saisis ton mot de passe actuel.' });
      return;
    }

    confirmOtpMutation.mutate({ data, otp: code });
  };

  const isPending =
    changePasswordMutation.isPending || confirmOtpMutation.isPending || resendOtpMutation.isPending;

  return (
    <div className="space-y-4">
      <p className="text-gray-500 text-xs">
        Saisis d’abord ton mot de passe actuel. Si ton projet Supabase impose une confirmation (session
        &gt; 24 h ou option sécurisée), un <strong className="text-gray-400">code</strong> t’est envoyé
        par <strong className="text-gray-400">e-mail</strong> (ou par{' '}
        <strong className="text-gray-400">SMS</strong> si l’e-mail n’est pas confirmé).
      </p>
      <p className="text-gray-500 text-xs mb-1" id="settings-password-policy-hint">
        {PASSWORD_POLICY_SHORT_HINT}
      </p>

      <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
        <div>
          <label htmlFor="settings-current-password" className="block text-white font-semibold mb-2 text-sm">
            Mot de passe actuel
          </label>
          <div className="relative">
            <input
              id="settings-current-password"
              type={showPasswords.current ? 'text' : 'password'}
              {...register('current_password')}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={passwordStep === 'otp' || isPending}
              aria-invalid={!!errors.current_password}
              aria-describedby={
                errors.current_password ? 'settings-current-password-error' : undefined
              }
              className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                errors.current_password ? 'beefs-field-invalid border-red-500/50' : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((p) => ({ ...p, current: !p.current }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
              disabled={passwordStep === 'otp'}
              aria-label={
                showPasswords.current ? 'Masquer le mot de passe actuel' : 'Afficher le mot de passe actuel'
              }
            >
              {showPasswords.current ? (
                <EyeOff className="w-5 h-5" aria-hidden />
              ) : (
                <Eye className="w-5 h-5" aria-hidden />
              )}
            </button>
          </div>
          <PasswordInlineError
            id="settings-current-password-error"
            message={errors.current_password?.message}
          />
        </div>

        <div>
          <label htmlFor="settings-new-password" className="block text-white font-semibold mb-2 text-sm">
            Nouveau mot de passe
          </label>
          <div className="relative">
            <input
              id="settings-new-password"
              type={showPasswords.new ? 'text' : 'password'}
              {...register('new_password')}
              placeholder="••••••••"
              autoComplete="new-password"
              disabled={passwordStep === 'otp' || isPending}
              aria-describedby={
                ['settings-password-policy-hint', errors.new_password ? 'settings-new-password-error' : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={!!errors.new_password}
              className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                errors.new_password ? 'beefs-field-invalid border-red-500/50' : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((p) => ({ ...p, new: !p.new }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
              disabled={passwordStep === 'otp'}
              aria-label={
                showPasswords.new ? 'Masquer le nouveau mot de passe' : 'Afficher le nouveau mot de passe'
              }
            >
              {showPasswords.new ? (
                <EyeOff className="w-5 h-5" aria-hidden />
              ) : (
                <Eye className="w-5 h-5" aria-hidden />
              )}
            </button>
          </div>
          <PasswordInlineError id="settings-new-password-error" message={errors.new_password?.message} />
        </div>

        <div>
          <label htmlFor="settings-confirm-password" className="block text-white font-semibold mb-2 text-sm">
            Confirmer le mot de passe
          </label>
          <div className="relative">
            <input
              id="settings-confirm-password"
              type={showPasswords.confirm ? 'text' : 'password'}
              {...register('confirm_password')}
              placeholder="Répétez le mot de passe"
              autoComplete="new-password"
              disabled={passwordStep === 'otp' || isPending}
              aria-invalid={!!errors.confirm_password}
              aria-describedby={
                errors.confirm_password ? 'settings-confirm-password-error' : undefined
              }
              className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                errors.confirm_password ? 'beefs-field-invalid border-red-500/50' : ''
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPasswords((p) => ({ ...p, confirm: !p.confirm }))}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
              disabled={passwordStep === 'otp'}
              aria-label={
                showPasswords.confirm
                  ? 'Masquer la confirmation du mot de passe'
                  : 'Afficher la confirmation du mot de passe'
              }
            >
              {showPasswords.confirm ? (
                <EyeOff className="w-5 h-5" aria-hidden />
              ) : (
                <Eye className="w-5 h-5" aria-hidden />
              )}
            </button>
          </div>
          <PasswordInlineError
            id="settings-confirm-password-error"
            message={errors.confirm_password?.message}
          />
        </div>

        {passwordStep === 'otp' && (
          <div>
            <label htmlFor="settings-password-otp" className="block text-white font-semibold mb-2 text-sm">
              Code de confirmation
            </label>
            <input
              id="settings-password-otp"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={passwordOtp}
              onChange={(e) => {
                setPasswordOtp(e.target.value.replace(/\s/g, ''));
                setOtpError('');
              }}
              placeholder="Code reçu par e-mail ou SMS"
              aria-describedby={
                ['settings-otp-hint', otpError ? 'settings-password-otp-error' : '']
                  .filter(Boolean)
                  .join(' ') || undefined
              }
              aria-invalid={!!otpError}
              className={`${SETTINGS_INPUT} tracking-widest text-center text-lg ${
                otpError ? 'beefs-field-invalid border-red-500/50' : ''
              }`}
            />
            <p id="settings-otp-hint" className="text-gray-500 text-xs mt-2">
              Colle le code à une seule utilisation envoyé par Supabase (vérifie les spams).
            </p>
            <PasswordInlineError id="settings-password-otp-error" message={otpError} />
            <button
              type="button"
              onClick={() => resendOtpMutation.mutate()}
              disabled={isPending}
              className="mt-2 text-sm font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50"
            >
              Renvoyer le code
            </button>
          </div>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          {passwordStep === 'form' ? (
            <button type="submit" disabled={isPending} className={SETTINGS_BTN_PRIMARY}>
              {changePasswordMutation.isPending ? 'Modification...' : 'Changer le mot de passe'}
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onSubmitOtp}
                disabled={isPending || !passwordOtp.trim()}
                className={SETTINGS_BTN_PRIMARY}
              >
                {confirmOtpMutation.isPending ? 'Modification...' : 'Valider avec le code'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPasswordStep('form');
                  setPasswordOtp('');
                  setOtpError('');
                }}
                className="w-full py-3 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-sm font-semibold"
              >
                Retour
              </button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
