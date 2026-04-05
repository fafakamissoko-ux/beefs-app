/**
 * UI publique Stripe : le bandeau « carte 4242 » ne doit pas apparaître sur le site de production,
 * même si une clé pk_test est mal déployée par erreur.
 */
export function isStripePublishableTestKey(): boolean {
  const k = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  return typeof k === 'string' && k.startsWith('pk_test');
}

/** Domaines où on masque toute aide « mode test » (checkout). */
export function isProductionBeefsHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === 'www.beefs.live' || h === 'beefs.live' || h.endsWith('.beefs.live');
}
