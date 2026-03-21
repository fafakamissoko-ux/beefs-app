import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@beefs.app';
const MIN_POINTS = 2000; // 20€ minimum

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, amountPoints, method, iban, accountHolderName, paypalEmail, mobileNumber, mobileOperator } = body;

    if (!userId || !amountPoints || !method) {
      return NextResponse.json({ error: 'Champs requis manquants' }, { status: 400 });
    }

    if (amountPoints < MIN_POINTS) {
      return NextResponse.json({ error: 'Minimum 2 000 pts (20€) requis' }, { status: 400 });
    }

    // Check user balance
    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('points, display_name, email, username')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return NextResponse.json({ error: 'Utilisateur introuvable' }, { status: 404 });
    }

    if (user.points < amountPoints) {
      return NextResponse.json({ error: 'Solde insuffisant' }, { status: 400 });
    }

    // Check no pending request already
    const { data: existing } = await supabaseAdmin
      .from('withdrawal_requests')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Une demande est déjà en attente' }, { status: 400 });
    }

    const amountEuros = amountPoints / 100;

    // Deduct points immediately (held until processed)
    const { error: deductError } = await supabaseAdmin
      .from('users')
      .update({ points: user.points - amountPoints })
      .eq('id', userId);

    if (deductError) {
      return NextResponse.json({ error: 'Erreur lors de la mise à jour du solde' }, { status: 500 });
    }

    // Create withdrawal request
    const { data: request, error: insertError } = await supabaseAdmin
      .from('withdrawal_requests')
      .insert({
        user_id: userId,
        amount_points: amountPoints,
        amount_euros: amountEuros,
        method,
        iban: iban || null,
        account_holder_name: accountHolderName || null,
        paypal_email: paypalEmail || null,
        mobile_number: mobileNumber || null,
        mobile_operator: mobileOperator || null,
        status: 'pending',
      })
      .select()
      .single();

    if (insertError) {
      // Rollback points
      await supabaseAdmin.from('users').update({ points: user.points }).eq('id', userId);
      return NextResponse.json({ error: 'Erreur lors de la création de la demande' }, { status: 500 });
    }

    // Send notification email to admin via Supabase (no extra dependency)
    try {
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({
          to: ADMIN_EMAIL,
          subject: `💰 Nouvelle demande de retrait — ${user.display_name || user.username}`,
          html: `
            <h2>Nouvelle demande de retrait</h2>
            <p><strong>Utilisateur :</strong> ${user.display_name || user.username} (@${user.username})</p>
            <p><strong>Email :</strong> ${user.email}</p>
            <p><strong>Montant :</strong> ${amountEuros.toFixed(2)}€ (${amountPoints} pts)</p>
            <p><strong>Méthode :</strong> ${method}</p>
            ${iban ? `<p><strong>IBAN :</strong> ${iban}</p>` : ''}
            ${accountHolderName ? `<p><strong>Titulaire :</strong> ${accountHolderName}</p>` : ''}
            ${paypalEmail ? `<p><strong>PayPal :</strong> ${paypalEmail}</p>` : ''}
            ${mobileNumber ? `<p><strong>Numéro mobile :</strong> ${mobileNumber} (${mobileOperator})</p>` : ''}
            <p><strong>ID demande :</strong> ${request.id}</p>
            <br/>
            <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/admin/retraits" style="background:#f97316;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold;">
              Gérer les retraits
            </a>
          `,
        }),
      });
    } catch (_) {
      // Email failure is non-blocking
    }

    return NextResponse.json({ success: true, requestId: request.id, amountEuros });
  } catch (error) {
    console.error('Withdrawal request error:', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
