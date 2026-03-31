import type { SupabaseClient } from '@supabase/supabase-js';

/** Utilise la RPC `update_user_balance` (écrit aussi dans `transactions`). */
export async function updateUserBalance(
  admin: SupabaseClient,
  params: {
    userId: string;
    amount: number;
    type: string;
    description: string;
    metadata?: Record<string, unknown>;
  }
) {
  const { data, error } = await admin.rpc('update_user_balance', {
    p_user_id: params.userId,
    p_amount: params.amount,
    p_type: params.type,
    p_description: params.description,
    p_metadata: (params.metadata ?? {}) as object,
  });
  if (error) throw error;
  return data as { new_balance?: number; old_balance?: number; transaction_id?: string };
}
