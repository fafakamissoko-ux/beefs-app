import { NextRequest, NextResponse } from 'next/server';

/** Web Share Target (PWA) : POST multipart depuis le système. GET = fallback navigateur. */
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/', request.url));
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const sharedUrl = String(form.get('url') || '').trim();
    const dest = new URL('/', request.url);
    if (sharedUrl) dest.searchParams.set('shared', sharedUrl.slice(0, 2000));
    return NextResponse.redirect(dest, 303);
  } catch {
    return NextResponse.redirect(new URL('/', request.url), 303);
  }
}
