/**
 * Normalisation E.164 et création de profil pour les comptes créés par SMS (Supabase Phone).
 */

/** E-mail de remplissage si auth.users n’a pas d’e-mail (contrainte NOT NULL sur public.users.email). */
export function placeholderEmailForPhoneUser(user: { id: string; email?: string | null }): string {
  if (user.email && user.email.trim()) return user.email.trim();
  return `phone-${user.id.replace(/-/g, '')}@users.beefs.app`;
}

/**
 * Concatène indicatif + numéro national (chiffres). Pour +33, enlève un 0 initial français.
 */
export function buildE164Phone(countryDial: string, nationalDigits: string): string {
  let d = nationalDigits.replace(/\D/g, '');
  if (countryDial === '+33' && d.startsWith('0')) d = d.slice(1);
  const dial = countryDial.startsWith('+') ? countryDial : `+${countryDial}`;
  return `${dial}${d}`;
}

export function isLikelyValidE164(e164: string): boolean {
  const digits = e164.replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15;
}
