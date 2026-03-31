import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isAdminRequest } from '@/lib/is-admin-request';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  if (!(await isAdminRequest(req))) {
    return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { requestId, action, adminNote } = body;

    if (!requestId || !action) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    if (!['paid', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'Action invalide' }, { status: 400 });
    }

    // Fetch the request
    const { data: request, error: fetchError } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('*, users(email, display_name, username, points)')
      .eq('id', requestId)
      .single();

    if (fetchError || !request) {
      return NextResponse.json({ error: 'Demande introuvable' }, { status: 404 });
    }

    if (request.status !== 'pending') {
      return NextResponse.json({ error: 'Cette demande a déjà été traitée' }, { status: 400 });
    }

    // Update request status
    const { error: updateError } = await supabaseAdmin
      .from('withdrawal_requests')
      .update({
        status: action,
        admin_note: adminNote || null,
        processed_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (updateError) {
      return NextResponse.json({ error: 'Erreur lors de la mise à jour' }, { status: 500 });
    }

    // If rejected, refund points
    if (action === 'rejected') {
      const currentPoints = (request.users as any)?.points || 0;
      await supabaseAdmin
        .from('users')
        .update({ points: currentPoints + request.amount_points })
        .eq('id', request.user_id);
    }

    // Notify the creator by email
    const user = request.users as any;
    const isPaid = action === 'paid';

    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to: user.email,
          subject: isPaid
            ? `✅ Votre retrait de ${request.amount_euros}€ a été effectué`
            : `❌ Votre demande de retrait a été refusée`,
          html: isPaid
            ? `
              <h2>Votre retrait a été effectué !</h2>
              <p>Bonjour ${user.display_name || user.username},</p>
              <p>Votre retrait de <strong>${parseFloat(request.amount_euros).toFixed(2)}€</strong> a été traité avec succès.</p>
              <p>Le virement devrait apparaître sur votre compte dans les prochains jours ouvrés.</p>
              ${adminNote ? `<p><em>Note : ${adminNote}</em></p>` : ''}
              <p>Merci de faire confiance à Beefs !</p>
            `
            : `
              <h2>Demande de retrait refusée</h2>
              <p>Bonjour ${user.display_name || user.username},</p>
              <p>Votre demande de retrait de <strong>${parseFloat(request.amount_euros).toFixed(2)}€</strong> a été refusée.</p>
              ${adminNote ? `<p><strong>Raison :</strong> ${adminNote}</p>` : ''}
              <p>Vos points ont été <strong>recrédités</strong> sur votre compte.</p>
              <p>Si vous avez des questions, contactez-nous.</p>
            `,
        }),
      });
    } catch (_) {
      // Email failure is non-blocking
    }

    return NextResponse.json({ success: true, action });
  } catch (error) {
    console.error('Process withdrawal error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
