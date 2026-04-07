export type OpenBuyPointsOptions = {
  /** Conservé pour compatibilité ; l’ouverture passe par un lien (nouvel onglet), pas par window.open. */
  onPopupBlocked?: () => void;
};

/**
 * Ouvre la boutique de points dans un **nouvel onglet** sans naviguer dans l’onglet courant
 * (indispensable pendant un live /room Daily).
 * Utilise un lien `<a target="_blank">` (fiable sur mobile, pas une pop-up bloquée).
 */
export function openBuyPointsPage(
  router: { push: (href: string) => void },
  _options?: OpenBuyPointsOptions,
): void {
  if (typeof window === 'undefined') {
    router.push('/buy-points');
    return;
  }
  const a = document.createElement('a');
  a.href = '/buy-points';
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
