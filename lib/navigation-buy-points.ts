/**
 * Ouvre la page d’achat de points dans un **nouvel onglet** pour ne pas quitter
 * la room Daily. Sinon le médiateur disparaît du flux et d’autres clients peuvent
 * lancer la fin automatique du beef (grâce « médiateur absent »).
 */
export function openBuyPointsPage(router: { push: (href: string) => void }): void {
  if (typeof window === 'undefined') {
    router.push('/buy-points');
    return;
  }
  const w = window.open('/buy-points', '_blank', 'noopener,noreferrer');
  if (!w) router.push('/buy-points');
}
