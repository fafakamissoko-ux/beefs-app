export type PrestigeRank = { title: string; colorClass: string; tier: number; description: string; threshold: number };

export const PRESTIGE_RANKS: PrestigeRank[] = [
  { title: 'Aura Suprême', colorClass: 'text-prestige-gold drop-shadow-[0_0_8px_rgba(212,175,55,0.6)]', tier: 5, threshold: 5000, description: 'Rang ultime. Seuls les membres les plus influents et respectés de toute la plateforme atteignent ce statut légendaire.' },
  { title: 'Sommité', colorClass: 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]', tier: 4, threshold: 2000, description: 'Rare sont ceux qui atteignent ce rang. Tu incarnes l\'excellence et l\'engagement — l\'Aura Suprême est à portée de main.' },
  { title: 'Éminent', colorClass: 'text-cyan-400', tier: 3, threshold: 500, description: 'Ton influence rayonne dans l\'Agora. Les membres te reconnaissent et ton Aura en témoigne. Prochain objectif : la Sommité.' },
  { title: 'Initié', colorClass: 'text-emerald-400', tier: 2, threshold: 100, description: 'L\'Agora te reconnaît. Tu as prouvé ton engagement — maintiens le cap pour devenir un pilier de la communauté.' },
  { title: 'Citoyen', colorClass: 'text-gray-500', tier: 1, threshold: 0, description: 'Bienvenue dans l\'Agora. Chaque interaction compte — suis, commente, et montre-toi pour accumuler de l\'Aura et évoluer.' },
];

export function getAuraRank(aura: number): PrestigeRank {
  return PRESTIGE_RANKS.find((r) => aura >= r.threshold) ?? PRESTIGE_RANKS[PRESTIGE_RANKS.length - 1];
}
