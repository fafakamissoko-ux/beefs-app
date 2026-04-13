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

/**
 * Chargement paresseux : si `disposable-domains.json` est absent du bundle (déploiement sans
 * `npm run sync-disposable-domains`), un import au top-level provoquait un crash → hook HTTP 500
 * et message « Unexpected status code returned from hook: 500 » côté client.
 */
let disposableCache: Set<string> | null = null;
let disposableLoadErrorLogged = false;

function getDisposableDomains(): Set<string> {
  if (disposableCache !== null) return disposableCache;
  try {
    const raw = Deno.readTextFileSync(new URL('./disposable-domains.json', import.meta.url));
    const arr = JSON.parse(raw) as string[];
    disposableCache = new Set(arr.map((d) => String(d).toLowerCase()));
  } catch (e) {
    if (!disposableLoadErrorLogged) {
      console.error(
        '[before-user-created] disposable-domains.json absent ou invalide — filtre jetables désactivé. Lance `npm run sync-disposable-domains` puis redéploie la fonction.',
        e,
      );
      disposableLoadErrorLogged = true;
    }
    disposableCache = new Set();
  }
  return disposableCache;
}

function isDisposableEmail(email: string): boolean {
  const DISPOSABLE = getDisposableDomains();
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

function isGoogleOAuthUser(user: HookUser): boolean {
  const meta = user.app_metadata ?? {};
  const primary = typeof meta.provider === 'string' ? meta.provider : '';
  const provs = Array.isArray(meta.providers) ? meta.providers : [];
  return primary === 'google' || provs.includes('google');
}

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

    // OAuth Google : le payload du hook peut arriver sans e-mail exploitable selon la version / timing ;
    // on laisse GoTrue finaliser le profil plutôt que de renvoyer 400 et bloquer « Continuer avec Google ».
    if ((!email || !email.includes('@')) && isGoogleOAuthUser(user)) {
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

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
