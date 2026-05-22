export type PrestigeRank = { title: string; colorClass: string; tier: number };

export function getAuraRank(aura: number): PrestigeRank {
  if (aura >= 5000) return { title: 'Aura Suprême', colorClass: 'text-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]', tier: 5 };
  if (aura >= 2000) return { title: 'Sommité', colorClass: 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]', tier: 4 };
  if (aura >= 500) return { title: 'Éminent', colorClass: 'text-cyan-400', tier: 3 };
  if (aura >= 100) return { title: 'Initié', colorClass: 'text-emerald-400', tier: 2 };
  return { title: 'Citoyen', colorClass: 'text-gray-500', tier: 1 };
}
