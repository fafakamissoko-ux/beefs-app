import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    await supabaseAdmin.from('notifications').delete().eq('user_id', user.id);
    await supabaseAdmin.from('direct_messages').delete().eq('sender_id', user.id);
    await supabaseAdmin.from('beef_participants').delete().eq('user_id', user.id);
    await supabaseAdmin.from('followers').delete().or(`follower_id.eq.${user.id},following_id.eq.${user.id}`);
    await supabaseAdmin.from('users').delete().eq('id', user.id);

    const { error: authError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (authError) {
      console.error('Error deleting auth user:', authError);
      return NextResponse.json({ error: 'Erreur lors de la suppression du compte auth' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
