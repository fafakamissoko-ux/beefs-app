# Hook Auth « Before User Created » (e-mails jetables)

Ce dépôt contient une Edge Function : `supabase/functions/before-user-created/`. Elle rejette les inscriptions dont le domaine est dans la liste [disposable-email-domains](https://www.npmjs.com/package/disposable-email-domains) (fichier généré : `disposable-domains.json`).

Référence officielle : [Before User Created Hook](https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook).

---

## Prérequis

- [Supabase CLI](https://supabase.com/docs/guides/cli) installée (`supabase --version`), ou utilisation via **`npx supabase`** sans installation globale.
- Droits sur le projet Supabase **de production** (celui utilisé par Vercel : `NEXT_PUBLIC_SUPABASE_URL`).

---

## 1. Générer la liste des domaines jetables

Le fichier `disposable-domains.json` est **ignoré par Git** et créé par :

```bash
npm run sync-disposable-domains
```

À faire avant chaque déploiement de la fonction si tu veux une liste à jour (sinon celle du dernier `npm install` local est utilisée).

---

## 2. Lier le CLI au projet prod

```bash
supabase login
supabase link --project-ref <TON_PROJECT_REF>
```

(Si la commande `supabase` est introuvable : `npx supabase login`, etc.)

Le `project_ref` est l’identifiant dans l’URL du dashboard :  
`https://supabase.com/dashboard/project/<project_ref>`.

---

## 3. Déployer l’Edge Function

```bash
npm run sync-disposable-domains
supabase functions deploy before-user-created
```

La config `supabase/config.toml` désactive la vérification JWT pour cette fonction (`verify_jwt = false`), ce qui est **obligatoire** pour les hooks Auth (pas de JWT encore émis).

URL publique après déploiement :

```text
https://<PROJECT_REF>.supabase.co/functions/v1/before-user-created
```

---

## 4. Secret du hook (Standard Webhooks)

1. Ouvre le dashboard : **[Authentication → Hooks](https://supabase.com/dashboard/project/_/auth/hooks)** (remplace `_` par ton projet).
2. Ajoute un hook **Before User Created** en **HTTP**.
3. Indique l’URL exacte :  
   `https://<PROJECT_REF>.supabase.co/functions/v1/before-user-created`
4. Le dashboard fournit un secret au format **`v1,whsec_...`** — c’est celui que la fonction attend dans la variable **`BEFORE_USER_CREATED_HOOK_SECRET`**.

Enregistre le secret côté projet :

```bash
supabase secrets set BEFORE_USER_CREATED_HOOK_SECRET='v1,whsec_xxxxxxxx'
```

(Conserve les guillemets si le shell l’exige ; la valeur doit être **identique** à celle affichée pour ce hook.)

Les secrets sont pris en compte au prochain cold start des fonctions ; inutile de redéployer la fonction **sauf** si tu changes le code.

---

## 5. Vérification en production

1. **Logs**  
   Dashboard → **Edge Functions** → `before-user-created` → **Logs** : tu dois voir des invocations lors d’une inscription.

2. **Test métier (recommandé)**  
   - Inscription avec un domaine **jetable** connu (ex. une adresse `@yopmail.com` si toujours dans la liste) → doit **échouer** avec un message du type « e-mail temporaires ou jetables ».  
   - Inscription avec une adresse **non jetable** (Gmail, etc.) → doit **réussir**.

3. **Cohérence avec l’app**  
   Le client valide déjà les jetables (`lib/email-signup-policy.ts`). Le hook **double** la règle côté serveur : utile si quelqu’un contourne l’UI (API directe, OAuth, etc.).

---

## Dépannage

| Symptôme | Piste |
|----------|--------|
| **« Unexpected status code returned from hook: 500 »** (inscription / Google) | Souvent : **`disposable-domains.json` absent** du bundle Edge (fichier gitignoré, déploiement sans `npm run sync-disposable-domains`). Le code charge désormais la liste en **paresseux** et ne plante plus ; en prod, lance quand même `npm run sync-disposable-domains` puis `supabase functions deploy before-user-created` pour réactiver le blocage des e-mails jetables. |
| Toute inscription échoue (« Vérification du hook impossible ») | Secret incorrect ou absent : revérifie `BEFORE_USER_CREATED_HOOK_SECRET` (copier-coller complet `v1,whsec_...`). |
| Le hook ne semble jamais appelé | Hook non enregistré ou mauvaise URL dans Authentication → Hooks. |
| Erreur 401 sur l’URL de la fonction | Redéploie avec `verify_jwt = false` (voir `supabase/config.toml`). |
| Liste jetable vide / ancienne | Relance `npm run sync-disposable-domains` puis redéploie la fonction. |
| **Google OAuth** échoue après redirection | Vérifie **URL de callback** dans Supabase (Auth → URL) : `https://<ton-domaine>/auth/callback` ; dans Google Cloud Console, **URI de redirection autorisés** identiques. Côté app, `/auth/callback` appelle `exchangeCodeForSession` puis redirige vers le feed. |

---

## Inscription téléphone seul (futur)

Le code refuse explicitement l’absence d’e-mail tant que le flux SMS n’est pas activé. Quand tu ouvriras le SMS en prod, adapte le bloc commenté dans `index.ts` (voir commentaire dans le fichier).
