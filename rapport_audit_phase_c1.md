# Rapport d'audit — Phase C.1 (Système financier : Wallet & Acquisition Stripe)

**Date d'extraction :** 2026-07-18  
**Commit de référence :** `1c5d68b feat(arena): propagate gift type through chat pipeline (Phase Z.2-B)`  
**Contrainte :** Zéro modification du code source.

---

## Synthèse diagnostic Phase C.1

### A. Store client (`walletStore.ts`)

| Champ / méthode | Rôle |
|-----------------|------|
| `balance` | Miroir de `users.points` (Supabase) |
| `initialize(userId)` | Fetch initial + Realtime `postgres_changes` sur `users` |
| `optimisticDebit(amount)` | Débit UI instantané avant RPC cadeau |
| `sync()` | Re-fetch manuel `users.points` |
| **Pas de lingots séparés** | Une seule colonne `points` côté client |

### B. Pipeline acquisition Stripe

| Étape | Fichier | Action |
|-------|---------|--------|
| Catalogue packs | `lib/stripe/client.ts` | `POINT_PACKS` (500→10k points, bonus %) |
| Checkout | `app/api/stripe/checkout/route.ts` | Session Stripe + metadata `user_id`, `pack_id`, `points_amount`, `total_points` |
| Validation metadata | `lib/stripe/validate-checkout-metadata.ts` | Anti-tampering pack/points |
| Webhook | `app/api/stripe/webhook/route.ts` | `checkout.session.completed` → RPC `update_user_balance` type `purchase` |
| Idempotence | webhook L.137–152 | Dedup via `transactions.metadata.stripe_session_id` |
| Bonus XP | webhook L.179–187 | RPC `add_xp_to_user` (+100, non bloquant) |

### C. Schéma & persistance soldes

| Source | Détail |
|--------|--------|
| `users.points` | Solde spendable (lingots/points UI) |
| `users.lifetime_points` | Prestige cumulatif (incrémenté par `update_user_balance` migration 99) |
| `transactions` | Ledger : `type`, `amount`, `balance_after`, `metadata` |
| RPC `update_user_balance` | `SECURITY DEFINER`, `service_role` only — UPDATE users + INSERT transactions |

**Séparation actuelle :** acquisition (Stripe → RPC) et stockage (`users.points` + ledger) sont couplés via une seule RPC ; le store Zustand ne fait que synchroniser `points`.

---

## 1. Code source intégral — `lib/stores/walletStore.ts`

```ts
import { create } from 'zustand';
import { supabase } from '@/lib/supabase/client';
import type { RealtimeChannel } from '@supabase/supabase-js';

interface WalletState {
  balance: number;
  isInitialized: boolean;
  activeUserId: string | null;
  channel: RealtimeChannel | null;
  initialize: (userId: string) => Promise<void>;
  cleanup: () => void;
  optimisticDebit: (amount: number) => boolean;
  sync: () => Promise<void>;
}

export const useWalletStore = create<WalletState>((set, get) => ({
  balance: 0,
  isInitialized: false,
  activeUserId: null,
  channel: null,

  initialize: async (userId: string) => {
    const current = get();
    if (current.activeUserId === userId && current.isInitialized) return;
    current.cleanup();

    // 1. Fetch initial
    const { data } = await supabase.from('users').select('points').eq('id', userId).single();
    const initialBalance = data?.points ?? 0;

    // 2. Écoute Temps Réel (WebSockets)
    const channel = supabase
      .channel(`wallet_sync_${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${userId}` },
        (payload) => {
          const newPoints = payload.new?.points;
          if (typeof newPoints === 'number') {
            set({ balance: newPoints });
          }
        }
      )
      .subscribe();

    set({ balance: initialBalance, isInitialized: true, activeUserId: userId, channel });
  },

  cleanup: () => {
    const { channel } = get();
    if (channel) {
      supabase.removeChannel(channel);
    }
    set({ balance: 0, isInitialized: false, activeUserId: null, channel: null });
  },

  // Utilisé juste avant l'appel RPC pour une UI instantanée
  optimisticDebit: (amount: number) => {
    const { balance } = get();
    if (balance >= amount) {
      set({ balance: balance - amount });
      return true;
    }
    return false;
  },

  // Forcer une synchronisation manuelle si nécessaire
  sync: async () => {
    const { activeUserId } = get();
    if (!activeUserId) return;
    const { data } = await supabase.from('users').select('points').eq('id', activeUserId).single();
    if (data) set({ balance: data.points ?? 0 });
  }
}));
```

---

## 2a. Code source intégral — `lib/stripe/client.ts` (catalogue POINT_PACKS)

```ts
import { loadStripe, Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null>;

export const getStripe = () => {
  if (!stripePromise) {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      console.error('Missing NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY');
      return null;
    }
    stripePromise = loadStripe(key);
  }
  return stripePromise;
};

// Point pack configurations
export const POINT_PACKS = [
  {
    id: 'starter',
    name: 'Starter',
    emoji: '🔥',
    points: 500,
    price: 4.99,
    bonus: 5,
    priceId: process.env.STRIPE_PRICE_STARTER,
    popular: false,
  },
  {
    id: 'popular',
    name: 'Popular',
    emoji: '💎',
    points: 1200,
    price: 9.99,
    bonus: 20,
    priceId: process.env.STRIPE_PRICE_POPULAR,
    popular: true, // Best value
  },
  {
    id: 'premium',
    name: 'Premium',
    emoji: '👑',
    points: 3000,
    price: 19.99,
    bonus: 50,
    priceId: process.env.STRIPE_PRICE_PREMIUM,
    popular: false,
  },
  {
    id: 'vip',
    name: 'VIP',
    emoji: '🚀',
    points: 10000,
    price: 49.99,
    bonus: 100,
    priceId: process.env.STRIPE_PRICE_VIP,
    popular: false,
  },
] as const;

export type PointPackId = typeof POINT_PACKS[number]['id'];
```

---

## 2b. Code source intégral — `lib/stripe/validate-checkout-metadata.ts`

```ts
import { POINT_PACKS } from '@/lib/stripe/client';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUserId(userId: string | undefined): userId is string {
  return typeof userId === 'string' && UUID_RE.test(userId.trim());
}

/** Vérifie que pack + points correspondent au catalogue serveur (anti-tampering metadata). */
export function validatePointPackFromMetadata(
  packId: string | undefined,
  pointsAmountRaw: string | undefined,
): { ok: true; points: number; packId: string } | { ok: false; reason: string } {
  if (!packId || typeof packId !== 'string') {
    return { ok: false, reason: 'pack_id manquant' };
  }
  const pack = POINT_PACKS.find((p) => p.id === packId.trim());
  if (!pack) {
    return { ok: false, reason: 'pack_id inconnu' };
  }
  const parsed = parseInt(pointsAmountRaw || '0', 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return { ok: false, reason: 'points_amount invalide' };
  }
  if (parsed !== pack.points) {
    return { ok: false, reason: 'points_amount ne correspond pas au pack' };
  }
  return { ok: true, points: parsed, packId: pack.id };
}
```

---

## 2c. Code source intégral — `app/api/stripe/checkout/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { POINT_PACKS } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import { detectUserCountry, calculatePrice, calculateFraudScore, COUNTRIES } from '@/lib/geo';
import { publicAppOrigin } from '@/lib/app-url';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId, returnTo: returnToRaw } = body;
    const returnTo =
      typeof returnToRaw === 'string' && returnToRaw.startsWith('/') && !returnToRaw.startsWith('//')
        ? returnToRaw
        : '/feed';

    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user: authUser } } = await supabaseAuth.auth.getUser();
    if (!authUser) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const userId = authUser.id;


    // Find the selected pack
    const pack = POINT_PACKS.find(p => p.id === packId);
    
    if (!pack || !pack.priceId) {
      return NextResponse.json(
        { error: 'Invalid pack selected' },
        { status: 400 }
      );
    }


    // Get user email from Supabase
    let customerEmail = null;
    if (userId && userId !== 'temp') {
      const supabaseAdmin = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );
      
      const { data: user } = await supabaseAdmin
        .from('users')
        .select('email')
        .eq('id', userId)
        .single();
      
      if (user) customerEmail = user.email;
    }

    // 🌍 STEP 1: Detect user's country
    const country = await detectUserCountry();

    // 💰 STEP 2: Calculate adapted price
    const adaptedPrice = calculatePrice(pack.price, country);

    // 🧪 TEST MODE: Check if test-country parameter is present
    const url = new URL(request.url);
    const testCountry = url.searchParams.get('test-country');
    const isTestMode = testCountry && COUNTRIES[testCountry.toUpperCase()];

    if (isTestMode) {
    }

    // 🛡️ STEP 3: Anti-fraud check (skip in test mode)
    let fraudScore = { score: 0, risk: 'low' as string, shouldBlock: false };

    if (!isTestMode) {
      const browserLanguage = request.headers.get('accept-language');
      const timezone = request.headers.get('x-timezone') || Intl.DateTimeFormat().resolvedOptions().timeZone;
      
      fraudScore = calculateFraudScore(
        country.code,
        undefined, // Card country will be checked in webhook
        browserLanguage || undefined,
        timezone,
        [] // User history (can be enhanced later)
      );


      // Block critical fraud attempts
      if (fraudScore.shouldBlock) {
        console.warn('⚠️ FRAUD DETECTED - Blocking transaction');
        return NextResponse.json(
          { 
            error: 'Transaction blocked for security reasons',
            message: 'Veuillez contacter le support si vous pensez qu\'il s\'agit d\'une erreur.'
          },
          { status: 403 }
        );
      }

      // Log suspicious activity for review
      if (fraudScore.risk === 'high') {
        console.warn('⚠️ HIGH RISK transaction - Monitoring required');
        // TODO: Save to fraud_logs table in Supabase
      }
    }

    const appOrigin = publicAppOrigin(request);

    // `link` = Stripe Link. Apple Pay / Google Pay s’affichent souvent avec la carte quand le domaine
    // est vérifié dans le Dashboard Stripe (Wallet).
    const session = await stripe.checkout.sessions.create({
      locale: 'fr',
      customer_email: customerEmail || undefined,
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: adaptedPrice.currency.toLowerCase(),
            product_data: {
              name: `${pack.emoji} ${pack.name} - ${pack.points.toLocaleString()} points`,
              description: `Pack de ${pack.points.toLocaleString()} points pour Beefs`,
              images: [`${appOrigin}/icon-512.png`],
            },
            unit_amount: Math.round(adaptedPrice.amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${appOrigin}${returnTo}?purchase=success`,
      cancel_url: `${appOrigin}/buy-points?purchase=cancelled`,
      metadata: {
        user_id: userId || 'temp',
        pack_id: packId,
        points_amount: pack.points.toString(),
        total_points: String(pack.points + (pack.points * (pack.bonus || 0) / 100)),
        country_code: country.code,
        detected_price: adaptedPrice.amount.toString(),
        original_price: pack.price.toString(),
        fraud_score: isTestMode ? '999' : fraudScore.score.toString(),
        fraud_risk: isTestMode ? 'test' : fraudScore.risk,
        test_mode: isTestMode ? 'true' : 'false',
      },
    });


    return NextResponse.json({ sessionId: session.id, url: session.url });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erreur lors de la création de la session de paiement' },
      { status: 500 }
    );
  }
}
```

---

## 2d. Code source intégral — `app/api/stripe/webhook/route.ts`

```ts
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
    console.error('[stripe webhook] Metadata pack invalide:', packCheck.reason);
    return;
  }

  const { points: basePoints, packId } = packCheck;
  const totalPointsRaw = session.metadata?.total_points;
  let pointsAmount = basePoints;
  if (totalPointsRaw) {
    const parsed = parseInt(totalPointsRaw, 10);
    if (Number.isFinite(parsed) && parsed >= 1) {
      pointsAmount = parsed;
    }
  }

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
```

---

## 3a. Code source intégral — `lib/supabase/client.ts` (types Database users/transactions)

```ts
import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// createBrowserClient gère automatiquement la synchronisation des cookies pour le Middleware
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          username: string;
          points: number;
          // (autres champs omis pour concision)
        };
        Insert: Partial<Database['public']['Tables']['users']['Row']>;
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          amount: number;
          balance_after: number;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['transactions']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['transactions']['Insert']>;
      };
      rooms: {
        Row: {
          id: string;
          title: string;
          host_id: string;
          host_name: string;
          tension_level: number;
          status: 'waiting' | 'live' | 'ended';
          current_challenger_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rooms']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['rooms']['Insert']>;
      };
      challenger_queue: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          position: number;
          status: 'waiting' | 'active' | 'done';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['challenger_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['challenger_queue']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          content: string;
          type: 'chat' | 'source' | 'fact_check';
          is_pinned: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      gifts: {
        Row: {
          id: string;
          room_id: string;
          from_user_id: string;
          to_user_id: string;
          gift_type: 'flame' | 'crown' | 'lightning' | 'diamond';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['gifts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['gifts']['Insert']>;
      };
    };
  };
};
```

---

## 3b. Code source intégral — `lib/updateUserBalance.ts`

```ts
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
```

---

## 3c. Code source intégral — `supabase/migrations/99_aura_absolute_economy.sql` (RPC update_user_balance)

```sql
CREATE OR REPLACE FUNCTION public.update_user_balance(
  p_user_id UUID, p_amount INTEGER, p_type TEXT,
  p_description TEXT, p_metadata JSONB DEFAULT '{}'
) RETURNS JSONB 
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql AS $$
DECLARE
  v_current INTEGER;
  v_new INTEGER;
  v_aura_increase INTEGER := 0;
BEGIN
  SELECT points INTO v_current FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF v_current IS NULL THEN
    RAISE EXCEPTION 'Utilisateur introuvable';
  END IF;

  v_new := v_current + p_amount;
  IF v_new < 0 AND p_type != 'refund' THEN
    RAISE EXCEPTION 'Solde insuffisant';
  END IF;

  -- Mécanique Gamification : Tout flux (positif ou négatif) augmente l'Aura, sauf retraits
  IF p_type NOT IN ('withdrawal_hold', 'refund_withdrawal') THEN
    v_aura_increase := ABS(p_amount);
  END IF;

  UPDATE public.users 
  SET 
    points = v_new, 
    lifetime_points = COALESCE(lifetime_points, 0) + v_aura_increase,
    updated_at = NOW() 
  WHERE id = p_user_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, description, metadata)
  VALUES (p_user_id, p_type, p_amount, v_new, p_description, p_metadata);

  RETURN jsonb_build_object('success', true, 'newBalance', v_new, 'auraAdded', v_aura_increase);
END;
$$;

REVOKE ALL ON FUNCTION public.update_user_balance FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_user_balance TO service_role;
```

---
