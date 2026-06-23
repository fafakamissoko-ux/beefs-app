'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { profileSchema, type ProfileFormValues } from '@/lib/schemas';
import { Save } from 'lucide-react';

const SETTINGS_INPUT =
  'w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors';
const SETTINGS_TEXTAREA =
  'w-full rounded-2xl border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors resize-none';
const SETTINGS_BTN_PRIMARY =
  'brand-gradient flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';

interface ProfileSettingsFormProps {
  userId: string;
  initialData: {
    display_name: string | null;
    bio: string | null;
    accent_color: string | null;
  };
  onSaved?: (data: Pick<ProfileFormValues, 'display_name' | 'bio'>) => void;
}

export function ProfileSettingsForm({ userId, initialData, onSaved }: ProfileSettingsFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      display_name: initialData.display_name || '',
      bio: initialData.bio || '',
      accent_color: initialData.accent_color || '',
    },
  });

  const bioValue = watch('bio') ?? '';

  const mutation = useMutation({
    mutationFn: async (data: ProfileFormValues) => {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: data.display_name.trim(),
          bio: data.bio?.trim() || null,
        })
        .eq('id', userId);

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast('Profil mis à jour avec succès.', 'success');
      queryClient.invalidateQueries({ queryKey: ['owner-profile', userId] });
      onSaved?.({
        display_name: data.display_name.trim(),
        bio: data.bio?.trim() || null,
      });
    },
    onError: (err) => {
      console.error(err);
      toast('Erreur lors de la mise à jour du profil.', 'error');
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="space-y-4">
      <div>
        <label htmlFor="settings-display-name" className="block text-white font-semibold mb-2 text-sm">
          Nom affiché
        </label>
        <input
          id="settings-display-name"
          type="text"
          {...register('display_name')}
          placeholder="Comment voulez-vous être appelé ?"
          autoComplete="nickname"
          aria-invalid={!!errors.display_name}
          className={`${SETTINGS_INPUT} ${errors.display_name ? 'border-red-500/50' : ''}`}
        />
        {errors.display_name && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {errors.display_name.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="settings-bio" className="block text-white font-semibold mb-2 text-sm">
          Bio
        </label>
        <textarea
          id="settings-bio"
          {...register('bio')}
          placeholder="Parlez-nous de vous..."
          rows={3}
          aria-describedby="settings-bio-count"
          aria-invalid={!!errors.bio}
          className={`${SETTINGS_TEXTAREA} ${errors.bio ? 'border-red-500/50' : ''}`}
        />
        <p id="settings-bio-count" className="text-gray-400 text-xs mt-1">
          {bioValue.length}/160 caractères
        </p>
        {errors.bio && (
          <p role="alert" className="mt-1 text-xs text-red-400">
            {errors.bio.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={mutation.isPending}
        className={SETTINGS_BTN_PRIMARY}
      >
        {mutation.isPending ? (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
        ) : (
          <Save className="w-5 h-5" />
        )}
        {mutation.isPending ? 'Enregistrement...' : 'Enregistrer les modifications'}
      </button>
    </form>
  );
}
