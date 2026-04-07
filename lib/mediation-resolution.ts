/**
 * Catégories affichées dans « Résultats des médiations » (profil).
 * Aligné sur `beefs.resolution_status` + `beefs.status` (voir migration 10).
 */
export type MediationDisplayCategory = 'resolved' | 'unresolved' | 'in_progress' | 'abandoned';

export function mediationCategoryForBeef(beef: {
  status: string;
  resolution_status?: string | null;
}): MediationDisplayCategory {
  const s = beef.status;
  if (s === 'cancelled') return 'abandoned';

  if (
    s === 'live' ||
    s === 'scheduled' ||
    s === 'pending' ||
    s === 'ready' ||
    s === 'waiting'
  ) {
    return 'in_progress';
  }

  if (s === 'ended' || s === 'replay') {
    const r = beef.resolution_status;
    if (r === 'resolved' || r === 'unresolved' || r === 'abandoned' || r === 'in_progress') {
      return r;
    }
    // Fin sans statut explicite (données anciennes / bug) → plutôt « non abouti » que « résolu »
    return 'abandoned';
  }

  return 'in_progress';
}
