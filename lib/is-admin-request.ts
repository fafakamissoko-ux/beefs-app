import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ADMIN_SECRET = process.env.ADMIN_SECRET;

/** Admin : rôle `users.role === 'admin'` ou en-tête `x-admin-secret` si `ADMIN_SECRET` est défini. */
export async function isAdminRequest(req: NextRequest): Promise<boolean> {
  const adminSecret = req.headers.get('x-admin-secret');
  if (ADMIN_SECRET && adminSecret === ADMIN_SECRET) return true;

  const authHeader = req.headers.get('authorization');
  if (!authHeader) return false;

  const supabaseAuth = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return false;

  const { data } = await supabaseAdmin.from('users').select('role').eq('id', user.id).single();
  return data?.role === 'admin';
}
