/**
 * Politique de mot de passe (création / changement) — alignée sur les usages courants des apps web.
 */

export const PASSWORD_MIN_LENGTH = 8;

/** Caractères spéciaux acceptés (au moins un requis). */
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:'",.<>?/\\~`]/;

export type PasswordPolicyProgress = {
  lengthOk: boolean;
  lower: boolean;
  upper: boolean;
  digit: boolean;
  special: boolean;
};

export function getPasswordPolicyProgress(password: string): PasswordPolicyProgress {
  return {
    lengthOk: password.length >= PASSWORD_MIN_LENGTH,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    digit: /[0-9]/.test(password),
    special: SPECIAL_RE.test(password),
  };
}

export function isPasswordPolicySatisfied(password: string): boolean {
  const p = getPasswordPolicyProgress(password);
  return p.lengthOk && p.lower && p.upper && p.digit && p.special;
}

/**
 * Messages courts pour l’UI (liste de critères).
 */
export const PASSWORD_POLICY_LABELS = {
  length: `Au moins ${PASSWORD_MIN_LENGTH} caractères`,
  lower: 'Une minuscule (a-z)',
  upper: 'Une majuscule (A-Z)',
  digit: 'Un chiffre (0-9)',
  special: 'Un caractère spécial (!@#$…)',
} as const;

/**
 * Validation pour les formulaires : une seule chaîne d’erreur lisible ou liste.
 */
export function validatePasswordPolicy(password: string): { ok: true } | { ok: false; message: string } {
  const p = getPasswordPolicyProgress(password);
  if (isPasswordPolicySatisfied(password)) return { ok: true };

  const missing: string[] = [];
  if (!p.lengthOk) missing.push(PASSWORD_POLICY_LABELS.length);
  if (!p.lower) missing.push(PASSWORD_POLICY_LABELS.lower);
  if (!p.upper) missing.push(PASSWORD_POLICY_LABELS.upper);
  if (!p.digit) missing.push(PASSWORD_POLICY_LABELS.digit);
  if (!p.special) missing.push(PASSWORD_POLICY_LABELS.special);

  return {
    ok: false,
    message: `Mot de passe trop faible : ${missing.join(', ')}.`,
  };
}

/** Indice court pour les placeholders / aides. */
export const PASSWORD_POLICY_SHORT_HINT =
  `${PASSWORD_MIN_LENGTH} caractères min., majuscule, minuscule, chiffre et caractère spécial`;
