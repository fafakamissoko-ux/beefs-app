/** Règles alignées sur `slugUsername` / contrainte UX (min 3, max 28). */
export const ARENA_USERNAME_MIN = 3;
export const ARENA_USERNAME_MAX = 28;

const ARENA_USERNAME_RE = /^[a-zA-Z0-9_]+$/;

/**
 * Filtre la saisie : uniquement lettres non accentuées après normalisation NFKC,
 * chiffres et underscores (pas d’espaces ni caractères spéciaux).
 */
export function sanitizeArenaUsernameInput(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, ARENA_USERNAME_MAX)
    .toLowerCase();
}

export function isValidArenaUsername(username: string): boolean {
  const n = username.length;
  if (n < ARENA_USERNAME_MIN || n > ARENA_USERNAME_MAX) return false;
  return ARENA_USERNAME_RE.test(username);
}
