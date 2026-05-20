/** Mode de rendu arène — grille pleine ou orbites autour du médiateur. */
export type ArenaLayoutMode = 'nexus' | 'constellation';

/**
 * Règle d'or : grille si tous les challengers attendus sont présents sur le call (panel != null).
 * Ne pas exiger videoTrack — la caméra peut mettre ~1s à publier la piste.
 */
export function resolveArenaLayoutMode(
  expectedCount: number,
  connectedCount: number,
): ArenaLayoutMode {
  if (expectedCount > 0 && connectedCount === expectedCount) {
    return 'nexus';
  }
  return 'constellation';
}
