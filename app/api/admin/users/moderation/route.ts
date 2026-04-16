import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminRequest } from '@/lib/is-admin-request';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

type BanBody = {
  action: 'ban' | 'unban';
  userId: string;
  bannedUntil?: string | null;
  banReason?: string | null;
  /** ID admin (JWT) pour banned_by */
  bannedBy?: string | null;
};

/**
 * Bannissement / débannissement : accès email et table banned_emails côté serveur uniquement
 * (aucun email dans les réponses JSON list / GET users).
 */
export async function POST(request: NextRequest) {
  try {
    if (!(await isAdminRequest(request))) {
      return NextResponse.json({ error: 'Accès réservé aux administrateurs' }, { status: 403 });
    }

    const body = (await request.json()) as BanBody;
    const { action, userId } = body;
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'userId requis' }, { status: 400 });
    }
    if (action !== 'ban' && action !== 'unban') {
      return NextResponse.json({ error: 'action invalide' }, { status: 400 });
    }

    const { data: userRow, error: fetchErr } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('id', userId)
      .maybeSingle();

    if (fetchErr || !userRow?.email) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    const email = userRow.email as string;

    if (action === 'unban') {
      const { error: upErr } = await supabaseAdmin
        .from('users')
        .update({ is_banned: false, banned_until: null, ban_reason: null })
        .eq('id', userId);
      if (upErr) {
        return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 });
      }
      await supabaseAdmin.from('banned_emails').delete().eq('email', email);
      return NextResponse.json({ success: true });
    }

    const bannedUntil =
      body.bannedUntil === undefined ? null : (body.bannedUntil as string | null);
    const banReason = typeof body.banReason === 'string' ? body.banReason : null;
    const bannedBy = typeof body.bannedBy === 'string' ? body.bannedBy : null;

    const { error: upErr } = await supabaseAdmin
      .from('users')
      .update({
        is_banned: true,
        banned_until: bannedUntil,
        ban_reason: banReason,
      })
      .eq('id', userId);

    if (upErr) {
      return NextResponse.json({ error: 'Mise à jour impossible' }, { status: 500 });
    }

    const { error: banErr } = await supabaseAdmin.from('banned_emails').upsert(
      {
        email,
        reason: banReason || 'Banni par admin',
        banned_by: bannedBy,
      },
      { onConflict: 'email' },
    );

    if (banErr) {
      return NextResponse.json({ error: 'Liste de blocage : écriture impossible' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
