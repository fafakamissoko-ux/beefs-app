'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';
import { useToast } from '@/components/Toast';
import { emailChangeSchema, type EmailChangeFormValues } from '@/lib/schemas';
import { AlertCircle, Check, Mail } from 'lucide-react';

const SETTINGS_INPUT =
  'w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors';
const SETTINGS_BTN_SECONDARY =
  'mt-2 w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed';

interface EmailSettingsFormProps {
  currentEmail: string | undefined;
}

export function EmailSettingsForm({ currentEmail }: EmailSettingsFormProps) {
  const { toast } = useToast();
  const [pendingNewEmail, setPendingNewEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<EmailChangeFormValues>({
    resolver: zodResolver(emailChangeSchema),
    defaultValues: { new_email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: async (data: EmailChangeFormValues) => {
      if (!currentEmail) {
        throw new Error('Adresse e-mail actuelle introuvable.');
      }

      const throwawayClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } },
      );
      const { error: authErr } = await throwawayClient.auth.signInWithPassword({
        email: currentEmail,
        password: data.password,
      });

      if (authErr) throw new Error('Mot de passe actuel incorrect.');

      const { error: updateErr } = await supabase.auth.updateUser({
        email: data.new_email,
      });

      if (updateErr) throw updateErr;
      return data;
    },
    onSuccess: (data) => {
      setPendingNewEmail(data.new_email);
      reset({ new_email: data.new_email, password: '' });
      toast('Un lien de confirmation a été envoyé à ta nouvelle adresse.', 'success');
    },
    onError: (err: unknown) => {
      console.error(err);
      const message =
        err instanceof Error ? err.message : "Impossible de modifier l'adresse e-mail.";
      toast(message, 'error');
    },
  });

  if (pendingNewEmail) {
    return (
      <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-brand-400 text-sm shadow-lg">
        <p className="font-bold flex items-center gap-2">
          <Check className="w-4 h-4" aria-hidden />
          E-mail de confirmation envoyé
        </p>
        <p className="mt-1 opacity-80 leading-relaxed">
          Un lien a été envoyé à <strong>{pendingNewEmail}</strong>. Veuillez cliquer dessus pour
          valider le changement. Votre ancienne adresse reste active en attendant.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      <div>
        <label htmlFor="settings-new-email" className="mb-2 block text-sm font-semibold text-white">
          Nouvelle adresse e-mail
        </label>
        <div className="relative">
          <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            id="settings-new-email"
            type="email"
            {...register('new_email')}
            disabled={mutation.isPending}
            autoComplete="email"
            aria-invalid={!!errors.new_email}
            className={`${SETTINGS_INPUT} pl-12 ${errors.new_email ? 'border-red-500/50' : ''}`}
            placeholder="Nouvelle adresse e-mail"
          />
        </div>
        {errors.new_email && (
          <p role="alert" className="mt-1 text-xs text-red-400 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>{errors.new_email.message}</span>
          </p>
        )}
      </div>

      <div>
        <label htmlFor="settings-email-password" className="mb-2 block text-sm font-semibold text-white">
          Mot de passe de confirmation
        </label>
        <input
          id="settings-email-password"
          type="password"
          {...register('password')}
          disabled={mutation.isPending}
          autoComplete="current-password"
          aria-invalid={!!errors.password}
          className={`${SETTINGS_INPUT} ${errors.password ? 'border-red-500/50' : ''}`}
          placeholder="Mot de passe actuel (requis pour sécurité)"
        />
        {errors.password && (
          <p role="alert" className="mt-1 text-xs text-red-400 flex items-start gap-1.5">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
            <span>{errors.password.message}</span>
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        className={SETTINGS_BTN_SECONDARY}
      >
        {mutation.isPending ? 'Envoi de la demande...' : "Mettre à jour l'e-mail"}
      </button>
    </form>
  );
}
