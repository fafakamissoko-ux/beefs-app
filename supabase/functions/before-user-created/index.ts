/**
 * Auth Hook « before-user-created » — rejette les inscriptions avec domaine jetable.
 *
 * Déploiement + branchement prod : voir docs/supabase-auth-hook-before-user-created.md
 * (secret BEFORE_USER_CREATED_HOOK_SECRET, Authentication → Hooks, verify_jwt false).
 *
 * Liste : disposable-domains.json (généré par scripts/sync-disposable-domains.mjs au postinstall).
 * Quand tu activeras l’inscription uniquement par SMS : autoriser ici les cas sans email (voir commentaire).
 */
import { Webhook } from 'https://esm.sh/standardwebhooks@1.0.0';

const DISPOSABLE = new Set(
  (
    JSON.parse(
      Deno.readTextFileSync(new URL('./disposable-domains.json', import.meta.url)),
    ) as string[]
  ).map((d) => d.toLowerCase()),
);

function isDisposableEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 1) return false;
  const domain = email.slice(at + 1).toLowerCase().trim();
  if (!domain) return false;
  if (DISPOSABLE.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE.has(parts.slice(i).join('.'))) return true;
  }
  return false;
}

type HookUser = {
  email?: string | null;
  phone?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const payload = await req.text();
  const secretRaw = Deno.env.get('BEFORE_USER_CREATED_HOOK_SECRET') ?? '';
  const secret = secretRaw.replace(/^v1,whsec_/, '');
  const headers = Object.fromEntries(req.headers);
  const wh = new Webhook(secret);

  try {
    const body = wh.verify(payload, headers) as { user?: HookUser };
    const user = body.user;
    if (!user) {
      return new Response(JSON.stringify({ error: { message: 'Payload invalide', http_code: 400 } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const email = (user.email ?? '').trim();

    // Inscription par e-mail obligatoire : pas de compte « téléphone seul » tant que le flux SMS n’est pas voulu en prod.
    // Pour autoriser uniquement le SMS plus tard : if (user.phone && !email) return new Response("{}", { status: 200, ... });
    if (!email || !email.includes('@')) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Une adresse e-mail valide est obligatoire pour créer un compte.",
            http_code: 400,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (isDisposableEmail(email)) {
      return new Response(
        JSON.stringify({
          error: {
            message:
              'Les adresses e-mail temporaires ou jetables ne sont pas acceptées. Utilise une adresse personnelle ou professionnelle.',
            http_code: 400,
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[before-user-created]', e);
    return new Response(
      JSON.stringify({
        error: { message: 'Vérification du hook impossible.', http_code: 400 },
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
