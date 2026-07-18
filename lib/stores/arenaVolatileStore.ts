import { create } from 'zustand';

export type ArenaBigGiftPayload = {
  cost: number;
  label: string;
  emoji: string;
  giftTypeId: string;
  senderName: string;
  recipientName: string;
  messageTemplate: string;
  queueId?: string;
};

export interface VisibleMessage {
  id: string;
  user_name: string;
  content: string;
  timestamp: number;
  initial: string;
  type?: 'text' | 'gift';
  giftSender?: string;
  giftRecipient?: string;
  giftTemplate?: string;
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

  // --- MOTEUR DE CADEAUX PREMIUM (FIFO) ---
  bigGiftQueue: ArenaBigGiftPayload[];
  enqueueBigGift: (gift: Omit<ArenaBigGiftPayload, 'queueId'>) => void;
  shiftBigGift: () => void;
}

let reactionIdSeq = 0;

export const useArenaVolatileStore = create<ArenaVolatileStore>((set) => ({
  // --- ACTIONS CHAT ---
  messages: [],
  addMessage: (msg) => set((state) => {
    // Déduplication stricte pour éviter les fantômes
    if (state.messages.some(m => m.id === msg.id)) return state;
    // Capacité maximale de 80 messages en mémoire pour préserver la RAM
    return { messages: [...state.messages, { ...msg, timestamp: Date.now() }].slice(-80) };
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

  // --- ACTIONS CADEAUX PREMIUM ---
  bigGiftQueue: [],
  enqueueBigGift: (gift) => set((state) => ({
    bigGiftQueue: [...state.bigGiftQueue, { ...gift, queueId: `g_${Date.now()}_${Math.random()}` }],
  })),
  shiftBigGift: () => set((state) => ({
    bigGiftQueue: state.bigGiftQueue.slice(1),
  })),
}));
