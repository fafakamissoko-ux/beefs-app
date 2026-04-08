import { create } from 'zustand';

export type PulseSide = 'A' | 'B';

export type ArenaPulseVoicesState = {
  pulseA: number;
  pulseB: number;
  reset: () => void;
  /** Incrémente les « voix » pulse (delta ≥ 1). */
  addPulse: (side: PulseSide, delta?: number) => void;
};

export const useArenaPulseVoicesStore = create<ArenaPulseVoicesState>((set) => ({
  pulseA: 0,
  pulseB: 0,
  reset: () => set({ pulseA: 0, pulseB: 0 }),
  addPulse: (side, delta = 1) => {
    const d = Math.max(0, Math.floor(delta));
    if (!d) return;
    set((s) =>
      side === 'A' ? { pulseA: s.pulseA + d } : { pulseB: s.pulseB + d },
    );
  },
}));
