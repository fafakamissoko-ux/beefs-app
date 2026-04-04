import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import { userMayActOnBeef } from '@/lib/api/beef-access-context';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

const TRANSCRIPT_MAX = 12_000;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const roomId = typeof body?.roomId === 'string' ? body.roomId.trim() : '';
    const transcript = typeof body?.transcript === 'string' ? body.transcript : '';

    if (!roomId) {
      return NextResponse.json({ error: 'roomId requis' }, { status: 400 });
    }
    if (!transcript.trim()) {
      return NextResponse.json({ error: 'Transcript requis' }, { status: 400 });
    }
    if (transcript.length > TRANSCRIPT_MAX) {
      return NextResponse.json(
        { error: `Texte trop long (max ${TRANSCRIPT_MAX} caractères)` },
        { status: 400 },
      );
    }

    const access = await userMayActOnBeef(supabaseAdmin, roomId, user.id);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          claim: 'Déclaration analysée',
          verdict: 'needs-context' as const,
          explanation:
            'Service de fact-checking non configuré (OPENAI_API_KEY). Ajoute la clé côté serveur.',
          sources: [],
          timestamp: new Date().toISOString(),
        },
        { status: 503 },
      );
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `Tu es un fact-checker professionnel pour une plateforme de débat en direct. 
          Analyse la déclaration fournie et détermine sa véracité. 
          Réponds au format JSON avec: 
          - claim: la déclaration principale
          - verdict: "true", "false", "misleading", ou "needs-context"
          - explanation: une explication courte (2-3 phrases max)
          - sources: tableau de liens si disponibles (optionnel)`,
        },
        {
          role: 'user',
          content: transcript,
        },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const raw = completion.choices[0].message.content || '{}';
    const result = JSON.parse(raw) as {
      claim?: string;
      verdict?: string;
      explanation?: string;
      sources?: string[];
    };

    const verdict = (result.verdict || 'needs-context').toLowerCase();
    const safeVerdict = ['true', 'false', 'misleading', 'needs-context'].includes(verdict)
      ? verdict
      : 'needs-context';

    const line = `[Fact-check] ${safeVerdict.toUpperCase()}: ${result.explanation || ''}`.slice(0, 8000);

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('username, display_name')
      .eq('id', user.id)
      .maybeSingle();

    const username =
      profile?.username?.trim() ||
      profile?.display_name?.trim() ||
      user.email?.split('@')[0] ||
      'Utilisateur';

    const { error: insertErr } = await supabaseAdmin.from('beef_messages').insert({
      beef_id: roomId,
      user_id: user.id,
      username,
      display_name: profile?.display_name ?? null,
      content: line,
      is_pinned: false,
    });

    if (insertErr) {
      console.error('[fact-check] insert beef_messages:', insertErr);
    }

    return NextResponse.json({
      claim: result.claim || '',
      verdict: safeVerdict,
      explanation: result.explanation || '',
      sources: Array.isArray(result.sources) ? result.sources : [],
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    console.error('Fact-check error:', error);
    return NextResponse.json(
      {
        error: 'Erreur lors du fact-check',
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    );
  }
}
