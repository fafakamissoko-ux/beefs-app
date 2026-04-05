import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { isValidUserId, validatePointPackFromMetadata } from '@/lib/stripe/validate-checkout-metadata';

/** Raw body requis par Stripe ; pas de cache. */
export const dynamic = 'force-dynamic';

// Create Supabase admin client (bypasses RLS)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, // Need this in .env.local
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Missing stripe-signature header' },
      { status: 400 }
    );
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err) {
    console.error('⚠️  Webhook signature verification failed:', err);
    return NextResponse.json(
      { error: 'Webhook signature verification failed' },
      { status: 400 }
    );
  }


  try {
    console.info('[stripe webhook]', event.type, event.id);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, event.id);
        break;
      }

      /** Paiements différés (SEPA, etc.) : completed peut arriver avant « paid » ; ce signal confirme le paiement. */
      case 'checkout.session.async_payment_succeeded': {
        const session = event.data.object as Stripe.Checkout.Session;
        await handleCheckoutCompleted(session, event.id);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionUpdate(subscription);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await handleSubscriptionDeleted(subscription);
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return NextResponse.json(
      { error: 'Webhook processing failed' },
      { status: 500 }
    );
  }
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, stripeEventId: string) {
  if (session.mode !== 'payment') {
    console.info('[stripe webhook] Ignorer session mode=', session.mode, session.id);
    return;
  }

  const paid =
    session.payment_status === 'paid' || session.payment_status === 'no_payment_required';
  if (!paid) {
    console.warn(
      '[stripe webhook] Pas de crédit — payment_status=',
      session.payment_status,
      'session=',
      session.id,
    );
    return;
  }

  const userId = session.metadata?.user_id?.trim();
  const packIdRaw = session.metadata?.pack_id;
  const pointsRaw = session.metadata?.points_amount;

  if (!isValidUserId(userId)) {
    console.error('[stripe webhook] user_id metadata invalide (UUID attendu):', session.id);
    return;
  }

  const packCheck = validatePointPackFromMetadata(packIdRaw, pointsRaw);
  if (!packCheck.ok) {
    console.error('[stripe webhook] Metadata pack invalide:', packCheck.reason, {
      sessionId: session.id,
      pack_id: packIdRaw,
      points_amount: pointsRaw,
    });
    return;
  }

  const { points: pointsAmount, packId } = packCheck;

  const { data: already, error: dupErr } = await supabaseAdmin
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('type', 'purchase')
    .filter('metadata->>stripe_session_id', 'eq', session.id)
    .maybeSingle();

  if (dupErr) {
    console.error('[stripe webhook] idempotence select:', dupErr);
  }

  if (already) {
    console.info('[stripe webhook] checkout.session.completed déjà traité:', session.id);
    return;
  }

  const { error } = await supabaseAdmin.rpc('update_user_balance', {
    p_user_id: userId,
    p_amount: pointsAmount,
    p_type: 'purchase',
    p_description: `Achat de ${pointsAmount} points`,
    p_metadata: {
      pack_id: packId,
      stripe_session_id: session.id,
      stripe_event_id: stripeEventId,
      stripe_payment_intent: session.payment_intent,
    },
  });

  if (error) {
    console.error('[stripe webhook] update_user_balance:', error);
    throw error;
  }

  console.info('[stripe webhook] Points crédités', {
    userId,
    points: pointsAmount,
    sessionId: session.id,
    eventId: stripeEventId,
  });

  try {
    await supabaseAdmin.rpc('add_xp_to_user', {
      p_user_id: userId,
      p_xp_amount: 100,
      p_source: 'purchase_bonus',
    });
  } catch (xpErr) {
    console.error('[stripe webhook] add_xp_to_user (non bloquant):', xpErr);
  }
}

async function handleSubscriptionUpdate(subscription: Stripe.Subscription) {
  const customerId = subscription.customer as string;
  
  // Find user by Stripe customer ID
  const { data: user, error: userError } = await supabaseAdmin
    .from('users')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (userError || !user) {
    console.error('User not found for customer:', customerId);
    return;
  }

  const subscriptionData: any = {
    user_id: user.id,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: customerId,
    plan_type: 'premium',
    status: subscription.status === 'active' ? 'active' : subscription.status,
    current_period_start: new Date((subscription as any).current_period_start * 1000).toISOString(),
    current_period_end: new Date((subscription as any).current_period_end * 1000).toISOString(),
    cancel_at: (subscription as any).cancel_at ? new Date((subscription as any).cancel_at * 1000).toISOString() : null,
  };

  // Upsert subscription
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(subscriptionData, {
      onConflict: 'stripe_subscription_id',
    });

  if (error) {
    console.error('Error upserting subscription:', error);
    throw error;
  }

  // Update user is_premium flag
  await supabaseAdmin
    .from('users')
    .update({ is_premium: subscription.status === 'active' })
    .eq('id', user.id);

}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      status: 'expired',
      cancelled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id);

  if (error) {
    console.error('Error deleting subscription:', error);
    throw error;
  }

  // Update user is_premium flag
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('user_id')
    .eq('stripe_subscription_id', subscription.id)
    .single();

  if (sub) {
    await supabaseAdmin
      .from('users')
      .update({ is_premium: false })
      .eq('id', sub.user_id);
  }

}
