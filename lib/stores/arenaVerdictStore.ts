import { create } from 'zustand';

/** Verdict triple médiateur — persistance session (scopée par roomId côté UI). */
export type MediatorVerdict = 'resolved' | 'closed' | 'rematch' | null;

export type ArenaVerdictState = {
  verdict: MediatorVerdict;
  /** Dernier beef concerné (pour éviter fuites entre navigations). */
  roomId: string | null;
  setVerdict: (verdict: MediatorVerdict, roomId: string | null) => void;
  reset: () => void;
};

export const useArenaVerdictStore = create<ArenaVerdictState>((set) => ({
  verdict: null,
  roomId: null,
  setVerdict: (verdict, roomId) => set({ verdict, roomId }),
  reset: () => set({ verdict: null, roomId: null }),
}));
