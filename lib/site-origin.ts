/**
 * Origine publique du site pour les redirections auth (OAuth, reset, e-mail).
 * En prod : définir `NEXT_PUBLIC_APP_URL=https://beefs.live` (ou `https://www.beefs.live`)
 * pour que Supabase renvoie toujours vers le même host que les « Redirect URLs ».
 */
export function getBrowserSiteOrigin(): string {
  if (typeof window === 'undefined') {
    return '';
  }
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      return u.origin;
    } catch {
      /* ignore */
    }
  }
  return window.location.origin;
}
