/** Clé sessionStorage : page d’où l’utilisateur vient (mis à jour par NavigationReturnTracker). */
export const RETURN_STORAGE_KEY = 'beefs_return_to';

/**
 * Valide un chemin de retour interne (pas d’open redirect).
 */
export function sanitizeReturnPath(raw: string | null | undefined): string | null {
  if (raw == null || raw === '') return null;
  const trimmed = raw.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  if (trimmed.includes('://') || trimmed.includes('\\')) return null;
  return trimmed;
}

/** Ajoute ?from= ou &from= pour renforcer le retour explicite depuis une page donnée. */
export function hrefWithFrom(href: string, pathname: string): string {
  const sep = href.includes('?') ? '&' : '?';
  return `${href}${sep}from=${encodeURIComponent(pathname)}`;
}

type RouterLike = { push: (href: string) => void; back: () => void };

/**
 * Retour in-app (même logique qu’AppBackButton) — utile pour onCancel, handlers, etc.
 */
export function navigateSmartBack(router: RouterLike, fallback = '/feed'): void {
  if (typeof window === 'undefined') return;

  const params = new URLSearchParams(window.location.search);
  const fromQuery = sanitizeReturnPath(params.get('from'));
  if (fromQuery) {
    router.push(fromQuery);
    return;
  }

  try {
    const stored = sanitizeReturnPath(sessionStorage.getItem(RETURN_STORAGE_KEY));
    if (stored) {
      router.push(stored);
      return;
    }
  } catch {
    /* ignore */
  }

  if (window.history.length > 1) {
    router.back();
    return;
  }

  router.push(fallback);
}
