'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type MessagesDrawerContextValue = {
  isDrawerOpen: boolean;
  targetUserId?: string;
  openDrawer: (userId?: string) => void;
  closeDrawer: () => void;
};

const MessagesDrawerContext = createContext<MessagesDrawerContextValue | null>(null);

export function MessagesDrawerProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | undefined>();

  const openDrawer = useCallback((userId?: string) => {
    setTargetUserId(userId);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => setTargetUserId(undefined), 300); // Délai pour l'animation de fermeture
  }, []);

  return (
    <MessagesDrawerContext.Provider value={{ isDrawerOpen, targetUserId, openDrawer, closeDrawer }}>
      {children}
    </MessagesDrawerContext.Provider>
  );
}

export function useMessagesDrawer(): MessagesDrawerContextValue {
  const ctx = useContext(MessagesDrawerContext);
  if (!ctx) {
    throw new Error('useMessagesDrawer doit être utilisé dans MessagesDrawerProvider');
  }
  return ctx;
}
