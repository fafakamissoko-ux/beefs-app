'use client';

import { useCallback } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { postBeefManage, type BeefManageAction, type BeefManageResult } from '@/lib/beef-manage-client';
import type { ToastType } from '@/components/Toast';

type ToastFn = (message: string, type?: ToastType) => void;

interface UseBeefManageReturn {
  runBeefManage: (body: BeefManageAction) => Promise<BeefManageResult>;
}

export function useBeefManage(supabaseClient: SupabaseClient, toast: ToastFn): UseBeefManageReturn {
  const runBeefManage = useCallback(
    async (body: BeefManageAction): Promise<BeefManageResult> => {
      const {
        data: { session },
      } = await supabaseClient.auth.getSession();
      if (!session?.access_token) {
        toast('Session expirée', 'error');
        return { ok: false, error: 'Session' };
      }
      const r = await postBeefManage(session.access_token, body);
      if (!r.ok) toast(r.error, 'error');
      return r;
    },
    [supabaseClient, toast],
  );

  return { runBeefManage };
}
