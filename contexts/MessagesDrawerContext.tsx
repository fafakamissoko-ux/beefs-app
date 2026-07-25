'use client';

import { create } from 'zustand';

interface MessagesDrawerContextValue {
  isDrawerOpen: boolean;
  targetUserId: string | undefined;
  openDrawer: (userId?: string) => void;
  closeDrawer: () => void;
  clearTarget: () => void;
}

export const useMessagesDrawer = create<MessagesDrawerContextValue>((set) => ({
  isDrawerOpen: false,
  targetUserId: undefined,
  openDrawer: (userId) => set({ isDrawerOpen: true, targetUserId: userId }),
  closeDrawer: () => {
    set({ isDrawerOpen: false });
  },
  clearTarget: () => set({ targetUserId: undefined }),
}));

// Coquille vide pour éviter de faire planter le `layout.tsx`
// avant son nettoyage, et préserver le contrat d'import.
export function MessagesDrawerProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
