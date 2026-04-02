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
 * Retour in-app : **un pas** dans l’historique du navigateur à chaque appel (comme le bouton
 * « Précédent » du navigateur). Pas de saut via `?from=` ni sessionStorage (évite boucles et
 * pages ignorées). Si l’historique ne permet plus de revenir en arrière, redirection vers
 * `fallback` (souvent `/feed` ou `/admin`).
 */
export function navigateSmartBack(router: RouterLike, fallback = '/feed'): void {
  if (typeof window === 'undefined') return;

  if (window.history.length > 1) {
    router.back();
    return;
  }

  const safe = sanitizeReturnPath(fallback) || '/feed';
  router.push(safe);
}
