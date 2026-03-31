import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabase } from '@/lib/supabase/client';
import { createClient } from '@supabase/supabase-js';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || '',
});

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
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

    const { roomId, transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: 'Transcript is required' },
        { status: 400 }
      );
    }

    // Call OpenAI for fact-checking
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

    const result = JSON.parse(completion.choices[0].message.content || '{}');

    // Store fact-check in database
    await supabase.from('messages').insert({
      room_id: roomId,
      user_id: 'system_ai',
      user_name: 'AI Fact-Checker',
      content: `${result.verdict.toUpperCase()}: ${result.explanation}`,
      type: 'fact_check',
      is_pinned: false,
    });

    return NextResponse.json({
      ...result,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Fact-check error:', error);
    
    // Return mock response if API fails (for demo purposes)
    return NextResponse.json({
      claim: 'Déclaration analysée',
      verdict: 'needs-context',
      explanation: 'Service de fact-checking temporairement indisponible. Configurez OPENAI_API_KEY dans .env.local',
      sources: [],
      timestamp: new Date().toISOString(),
    });
  }
}
