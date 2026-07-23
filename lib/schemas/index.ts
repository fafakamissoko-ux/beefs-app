import { z } from 'zod';
import { isDisposableEmailDomain, validateSignupEmail } from '@/lib/email-signup-policy';
import { validatePasswordPolicy } from '@/lib/password-policy';

// --- SCHÉMA PROFIL ---
const stripHtml = (v: string) => v.replace(/<[^>]*>/g, '');

export const profileSchema = z.object({
  display_name: z
    .string()
    .min(2, 'Minimum 2 caractères')
    .max(30, 'Maximum 30 caractères')
    .transform(stripHtml),
  bio: z
    .string()
    .max(160, 'Maximum 160 caractères')
    .transform(stripHtml)
    .optional()
    .nullable(),
  accent_color: z.string().optional().nullable(),
});
export type ProfileFormValues = z.infer<typeof profileSchema>;

// --- SCHÉMA CHANGEMENT D'EMAIL ---
export const emailChangeSchema = z.object({
  new_email: z
    .string()
    .email("Format d'e-mail invalide")
    .refine((val) => validateSignupEmail(val).ok, 'Adresse non autorisée.')
    .refine((val) => !isDisposableEmailDomain(val), 'Les e-mails jetables sont interdits.'),
  password: z.string().min(1, 'Mot de passe requis pour confirmer'),
});
export type EmailChangeFormValues = z.infer<typeof emailChangeSchema>;

// --- SCHÉMA CHANGEMENT DE MOT DE PASSE ---
export const passwordChangeSchema = z
  .object({
    current_password: z.string().min(1, 'Mot de passe actuel requis'),
    new_password: z.string().refine((val) => {
      const res = validatePasswordPolicy(val);
      return res.ok === true;
    }, 'Le mot de passe ne respecte pas les critères de sécurité.'),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: 'Les mots de passe ne correspondent pas',
    path: ['confirm_password'],
  });
export type PasswordChangeFormValues = z.infer<typeof passwordChangeSchema>;
