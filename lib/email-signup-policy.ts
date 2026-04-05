import disposableDomains from 'disposable-email-domains/index.json';

/** Domaines jetables / temporaires (liste communautaire, mise à jour via le package npm). */
const DISPOSABLE = new Set((disposableDomains as string[]).map((d) => d.toLowerCase()));

/**
 * Détecte si le domaine (ou un suffixe du domaine) est connu comme jetable.
 * Ex. `sub.yopmail.com` → correspond à `yopmail.com` si présent dans la liste.
 */
export function isDisposableEmailDomain(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;
  if (DISPOSABLE.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const suffix = parts.slice(i).join('.');
    if (DISPOSABLE.has(suffix)) return true;
  }
  return false;
}

export function validateSignupEmail(email: string): { ok: true } | { ok: false; message: string } {
  const trimmed = email.trim();
  if (!trimmed || !trimmed.includes('@')) {
    return { ok: false, message: 'Adresse e-mail invalide.' };
  }
  const local = trimmed.split('@')[0];
  if (!local || !local.length) {
    return { ok: false, message: 'Adresse e-mail invalide.' };
  }
  if (isDisposableEmailDomain(trimmed)) {
    return {
      ok: false,
      message:
        'Les adresses e-mail temporaires ou jetables (yopmail, etc.) ne sont pas acceptées. Utilise une adresse personnelle ou professionnelle.',
    };
  }
  return { ok: true };
}
