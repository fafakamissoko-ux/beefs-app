import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminRequest } from '@/lib/is-admin-request';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');

  let query = supabaseAdmin
    .from('withdrawal_requests')
    .select(`
      *,
      users (
        display_name,
        username
      )
    `)
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const masked = (data ?? []).map((row: Record<string, unknown>) => ({
    ...row,
    iban: maskSensitive(row.iban as string | undefined),
    paypal_email: maskSensitive(row.paypal_email as string | undefined),
    mobile_number: maskSensitive(row.mobile_number as string | undefined),
  }));

  return NextResponse.json({ data: masked });
}

function maskSensitive(value: string | null | undefined): string | null {
  if (!value) return null;
  const last4 = value.slice(-4);
  return `••••${last4}`;
}
