import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface WalletState {
  balance: number;
  isInitialized: boolean;
  activeUserId: string | null;
  channel: RealtimeChannel | null;
  initialize: (userId: string) => Promise<void>;
  cleanup: () => void;
  optimisticDebit: (amount: number) => boolean;
  sync: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  isInitialized: false,
  activeUserId: null,
  channel: null,

  initialize: async (userId: string) => {
    const current = get();
    if (current.activeUserId === userId && current.isInitialized) return;
    current.cleanup();

    // 1. Fetch initial
    const { data } = await supabase.from('users').select('points').eq('id', userId).single();
    const initialBalance = data?.points ?? 0;

    // 2. Écoute Temps Réel (WebSockets)
    const channel = supabase
      .channel(`wallet_sync_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        (payload) => {
          const newPoints = payload.new?.points;
          if (typeof newPoints === 'number') {
            set({ balance: newPoints });
          }
        }
      )
      .subscribe();

    set({ balance: initialBalance, isInitialized: true, activeUserId: userId, channel });
  },

  cleanup: () => {
    const { channel } = get();
    if (channel) {
      supabase.removeChannel(channel);
    }
    set({ balance: 0, isInitialized: false, activeUserId: null, channel: null });
  },

  // Utilisé juste avant l'appel RPC pour une UI instantanée
  optimisticDebit: (amount: number) => {
    const { balance } = get();
    if (balance >= amount) {
      set({ balance: balance - amount });
      return true;
    }
    return false;
  },

  // Forcer une synchronisation manuelle si nécessaire
  sync: async () => {
    const { activeUserId } = get();
    if (!activeUserId) return;
    const { data } = await supabase.from('users').select('points').eq('id', activeUserId).single();
    if (data) set({ balance: data.points ?? 0 });
  }
}));
