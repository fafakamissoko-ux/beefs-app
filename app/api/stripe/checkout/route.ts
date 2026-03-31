import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/server';
import { POINT_PACKS } from '@/lib/stripe/client';
import { createClient } from '@supabase/supabase-js';
import { detectUserCountry, calculatePrice, calculateFraudScore, COUNTRIES } from '@/lib/geo';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { packId } = body;

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

    // Create Checkout Session with adapted pricing
    // Create Checkout Session with adapted pricing
    // `link` = Stripe Link (email / one-tap). Apple Pay / Google Pay s’affichent souvent dans Checkout
    // avec la carte quand le domaine est vérifié dans le Dashboard Stripe (Wallet).
    const session = await stripe.checkout.sessions.create({
      customer_email: customerEmail || undefined,
      payment_method_types: ['card', 'link'],
      line_items: [
        {
          price_data: {
            currency: adaptedPrice.currency.toLowerCase(),
            product_data: {
              name: `${pack.emoji} ${pack.name} - ${pack.points.toLocaleString()} points`,
              description: `Pack de ${pack.points.toLocaleString()} points pour Beefs`,
              images: [`${request.nextUrl.origin}/icon-512.png`],
            },
            unit_amount: Math.round(adaptedPrice.amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${request.nextUrl.origin}/live?purchase=success`,
      cancel_url: `${request.nextUrl.origin}/buy-points?purchase=cancelled`,
      metadata: {
        user_id: userId || 'temp',
        pack_id: packId,
        points_amount: pack.points.toString(),
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
