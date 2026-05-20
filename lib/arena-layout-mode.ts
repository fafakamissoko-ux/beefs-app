/** Mode de rendu arène — grille pleine ou orbites autour du médiateur. */
export type ArenaLayoutMode = 'nexus' | 'constellation';

/**
 * Règle d'or : grille si tous les challengers attendus ont une vidéo effective
 * (active ou en période de grâce bootstrap — voir ArenaLayoutManager).
 */
export function resolveArenaLayoutMode(
  expectedCount: number,
  effectiveVideoCount: number,
): ArenaLayoutMode {
  if (expectedCount > 0 && effectiveVideoCount === expectedCount) {
    return 'nexus';
  }
  return 'constellation';
}
