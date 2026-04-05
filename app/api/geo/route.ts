import { NextRequest, NextResponse } from 'next/server';

/** Évite l’erreur "Dynamic server usage: headers" pendant le build static. */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    // Try Cloudflare headers (works on Vercel/Cloudflare)
    const country = request.headers.get('cf-ipcountry') || 
                    request.headers.get('x-vercel-ip-country') ||
                    request.geo?.country ||
                    'FR'; // Default

    const city = request.headers.get('cf-ipcity') || 
                 request.headers.get('x-vercel-ip-city') ||
                 request.geo?.city ||
                 'Paris';

    const region = request.headers.get('cf-region') || 
                   request.headers.get('x-vercel-ip-country-region') ||
                   request.geo?.region ||
                   'IDF';

    const timezone = request.headers.get('cf-timezone') || 
                     request.headers.get('x-vercel-ip-timezone') ||
                     'Europe/Paris';

    const latitude = request.headers.get('cf-iplatitude') || 
                     request.geo?.latitude ||
                     '48.8566';

    const longitude = request.headers.get('cf-iplongitude') || 
                      request.geo?.longitude ||
                      '2.3522';

    return NextResponse.json({
      country,
      city,
      region,
      timezone,
      latitude,
      longitude,
      headers: {
        cfCountry: request.headers.get('cf-ipcountry'),
        vercelCountry: request.headers.get('x-vercel-ip-country'),
      },
    });
  } catch (error) {
    console.error('Geo API error:', error);
    return NextResponse.json({
      country: 'FR',
      city: 'Paris',
      region: 'IDF',
      timezone: 'Europe/Paris',
      error: 'Failed to detect location',
    });
  }
}
