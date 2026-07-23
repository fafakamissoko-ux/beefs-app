import { NextRequest, NextResponse } from 'next/server';
import { COUNTRIES } from '@/lib/geo';

/** Évite l'erreur "Dynamic server usage: headers" pendant le build static. */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const code =
      request.headers.get('x-vercel-ip-country') ??
      request.headers.get('cf-ipcountry') ??
      request.geo?.country ??
      'FR';

    const data = COUNTRIES[code] ?? COUNTRIES.DEFAULT;

    return NextResponse.json({
      country: data.code,
      currency: data.currency,
      exchangeRate: data.exchangeRate,
      ppp: data.priceMultiplier,
    });
  } catch (error) {
    console.error('Geo API error:', error);
    return NextResponse.json({
      country: 'FR',
      currency: 'EUR',
      exchangeRate: 1.0,
      ppp: 1.0,
    });
  }
}
