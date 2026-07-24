'use client';

import { useState, useCallback } from 'react';

export interface AuthHookState {
  title: string;
  subtitle: string;
  mandatory?: boolean;
}

interface UseAuthGateReturn {
  authHook: AuthHookState | null;
  setAuthHook: (state: AuthHookState | null) => void;
  requireAuth: (title: string, subtitle: string) => boolean;
}

export function useAuthGate(userId: string | null): UseAuthGateReturn {
  const [authHook, setAuthHook] = useState<AuthHookState | null>(null);

  const requireAuth = useCallback(
    (title: string, subtitle: string): boolean => {
      if (!userId) {
        setAuthHook({ title, subtitle, mandatory: false });
        return true;
      }
      return false;
    },
    [userId],
  );

  return { authHook, setAuthHook, requireAuth };
}
