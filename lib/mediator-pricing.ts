/**
 * Prix (points) pour la suite du visionnage après la prévisualisation gratuite.
 * Plus le médiateur a de beefs résolus, plus le tarif augmente (plafonné).
 * Modifie ces constantes pour ajuster l'économie du produit.
 */
export const MEDIATOR_PRICE_DEFAULTS = {
  base: 5,
  perResolved: 2,
  cap: 150,
} as const;

export function continuationPriceFromResolvedCount(resolvedCount: number): number {
  const { base, perResolved, cap } = MEDIATOR_PRICE_DEFAULTS;
  const n = Math.max(0, Math.floor(resolvedCount));
  const raw = base + n * perResolved;
  return Math.min(cap, Math.max(base, raw));
}
