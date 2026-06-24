import { create } from 'zustand';

export interface VisibleMessage {
  id: string;
  user_name: string;
  content: string;
  timestamp: number;
  initial: string;
}

export interface FlyingReaction {
  id: number;
  emoji: string;
  x: number;
  opacityMul: number;
  scaleMul: number;
}

interface ArenaVolatileStore {
  // --- MOTEUR DE CHAT ---
  messages: VisibleMessage[];
  addMessage: (msg: Omit<VisibleMessage, 'timestamp'>) => void;
  deleteMessage: (messageId: string) => void;
  clearMessages: () => void;

  // --- MOTEUR DE RÉACTIONS ---
  reactions: FlyingReaction[];
  addReaction: (reaction: Omit<FlyingReaction, 'id'>) => void;
  removeReaction: (id: number) => void;
  clearReactions: () => void;
}

let reactionIdSeq = 0;

export const useArenaVolatileStore = create<ArenaVolatileStore>((set) => ({
  // --- ACTIONS CHAT ---
  messages: [],
  addMessage: (msg) => set((state) => {
    // Déduplication stricte pour éviter les fantômes
    if (state.messages.some(m => m.id === msg.id)) return state;
    // Capacité maximale de 40 messages en mémoire pour préserver la RAM
    return { messages: [...state.messages, { ...msg, timestamp: Date.now() }].slice(-40) };
  }),
  deleteMessage: (id) => set((state) => ({
    messages: state.messages.filter(m => m.id !== id)
  })),
  clearMessages: () => set({ messages: [] }),

  // --- ACTIONS RÉACTIONS ---
  reactions: [],
  addReaction: (reaction) => set((state) => {
    const id = ++reactionIdSeq;
    // Limite stricte de 40 particules simultanées à l'écran pour éviter la surcharge GPU
    return { reactions: [...state.reactions, { ...reaction, id }].slice(-40) };
  }),
  removeReaction: (id) => set((state) => ({
    reactions: state.reactions.filter(r => r.id !== id)
  })),
  clearReactions: () => set({ reactions: [] }),
}));
