/** Préférences affichées côté profil public (stockées dans users.premium_settings.statsShortcuts). */
export type StatsShortcuts = {
  participations: boolean;
  mediations: boolean;
  followers: boolean;
  following: boolean;
};

export const DEFAULT_STATS_SHORTCUTS: StatsShortcuts = {
  participations: true,
  mediations: true,
  followers: true,
  following: true,
};

export function mergeStatsShortcuts(raw: unknown): StatsShortcuts {
  const d = DEFAULT_STATS_SHORTCUTS;
  if (!raw || typeof raw !== 'object') return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    participations: typeof o.participations === 'boolean' ? o.participations : d.participations,
    mediations: typeof o.mediations === 'boolean' ? o.mediations : d.mediations,
    followers: typeof o.followers === 'boolean' ? o.followers : d.followers,
    following: typeof o.following === 'boolean' ? o.following : d.following,
  };
}
