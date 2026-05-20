/** Mode de rendu arène — grille pleine ou orbites autour du médiateur. */
export type ArenaLayoutMode = 'nexus' | 'constellation';

/**
 * Règle d'or : grille uniquement si tous les challengers attendus ont un flux vidéo actif.
 */
export function resolveArenaLayoutMode(
  expectedCount: number,
  activeVideoCount: number,
): ArenaLayoutMode {
  if (expectedCount > 0 && activeVideoCount === expectedCount) {
    return 'nexus';
  }
  return 'constellation';
}
