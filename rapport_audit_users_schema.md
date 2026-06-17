# Rapport d'audit — Schéma `users` & trigger d'inscription

**Date :** 31 mai 2026  
**Instance :** `clsztcvmhvccvjxdwapt` — https://clsztcvmhvccvjxdwapt.supabase.co  
**Objectif :** vérification avant Phase 1 refonte onboarding (sas obligatoire, Display Name, Bio)  
**Statut :** extraction uniquement (aucune modification)

---

## 0. Synthèse

| Élément | Prod Supabase | Repo `supabase/migrations/` |
|---------|---------------|-----------------------------|
| Colonnes ciblées | ✅ Présentes | Définies dans `supabase_migrations/init.sql` + `45_users_needs_arena_username.sql` |
| Trigger `on_auth_user_created` | ✅ **Actif** sur `auth.users` | ❌ **Absent** — non versionné dans le dépôt |
| Fonction `handle_new_user()` | ✅ Déployée | ❌ **Absent** du repo |

**Implication Phase 1 :** la migration SQL devra **capturer / recréer** `handle_new_user` + trigger dans `supabase/migrations/` pour aligner repo ↔ prod.

---

## 1. Requête SQL — colonnes ciblées (`public.users`)

**Requête exécutée :**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name IN ('display_name', 'bio', 'needs_arena_username', 'username');
```

**Résultat brut (prod) :**

```json
[
  { "column_name": "bio",                  "data_type": "text" },
  { "column_name": "display_name",         "data_type": "text" },
  { "column_name": "needs_arena_username", "data_type": "boolean" },
  { "column_name": "username",             "data_type": "text" }
]
```

**Complément nullabilité / default (prod) :**

```json
[
  { "column_name": "bio",                  "data_type": "text",    "is_nullable": "YES", "column_default": null },
  { "column_name": "display_name",         "data_type": "text",    "is_nullable": "YES", "column_default": null },
  { "column_name": "needs_arena_username", "data_type": "boolean", "is_nullable": "NO",  "column_default": "false" },
  { "column_name": "username",             "data_type": "text",    "is_nullable": "NO",  "column_default": null }
]
```

| column_name | data_type | Nullable | Default prod | Lecture Phase 1 |
|-------------|-----------|----------|--------------|-----------------|
| `username` | text | **NO** | — | Obligatoire à l'INSERT ; trigger met `temp_<uuid8>` |
| `display_name` | text | **YES** | — | Optionnel aujourd'hui ; PO veut **obligatoire onboarding** |
| `bio` | text | **YES** | — | Optionnel aujourd'hui ; PO veut **obligatoire onboarding** |
| `needs_arena_username` | boolean | **NO** | `false` | Trigger force `true` à l'inscription ; sas le passe à `false` |

---

## 2. Trigger sur `auth.users` (prod)

**Requête :**

```sql
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE NOT t.tgisinternal AND n.nspname = 'auth' AND c.relname = 'users';
```

**Résultat :**

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

---

## 3. Fonction `public.handle_new_user()` — code intégral (prod)

> Source : `pg_get_functiondef()` sur prod — **non trouvée** dans `supabase/migrations/` ni `supabase_migrations/`.

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base_username text;
    v_final_username text;
    v_display_name text;
BEGIN
    -- Génération d'un pseudo temporaire unique
    v_final_username := 'temp_' || substr(NEW.id::text, 1, 8);

    -- Récupération du nom d'affichage s'il vient de Google/Apple
    v_display_name := COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        'Nouveau Citoyen'
    );

    -- Insertion Sécurisée avec le verrou (needs_arena_username = true)
    INSERT INTO public.users (
        id,
        email,
        username,
        display_name,
        avatar_url,
        needs_arena_username
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.email, 'no-email-' || NEW.id), -- Fallback Apple Private Relay
        v_final_username,
        v_display_name,
        NEW.raw_user_meta_data->>'avatar_url',
        true -- Le verrou qui forcera le passage dans le sas
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$function$;
```

### 3a. Ce qui est inséré à chaque signup (`auth.users` INSERT)

| Colonne | Valeur |
|---------|--------|
| `id` | `NEW.id` (UUID auth) |
| `email` | `NEW.email` ou `'no-email-' \|\| NEW.id` |
| `username` | `'temp_' \|\| substr(NEW.id::text, 1, 8)` |
| `display_name` | OAuth `full_name` / `name` ou `'Nouveau Citoyen'` |
| `avatar_url` | `raw_user_meta_data->>'avatar_url'` (nullable) |
| `needs_arena_username` | **`true`** |
| `bio` | **Non inséré** (reste `NULL`) |

**Non utilisé :** `v_base_username` (déclaré mais jamais assigné).

**Idempotence :** `ON CONFLICT (id) DO NOTHING`.

---

## 4. Recherche repo — `supabase/migrations/`

Fichiers présents dans `supabase/migrations/` :

- `99_aura_absolute_economy.sql`
- `100_gift_split.sql`
- `101_prestige_ledger_adjust_prestige_aura.sql`
- `102_gamification_aura_triggers.sql`

**Aucun fichier** ne contient `handle_new_user`, `on_auth_user_created` ni `AFTER INSERT ON auth.users`.

Référence historique repo (`supabase_migrations/45_users_needs_arena_username.sql`) — ajout colonne uniquement :

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS needs_arena_username BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.users.needs_arena_username IS
  'Si true, l''utilisateur doit valider un pseudo arène (lettres, chiffres, _) avant d''accéder au feed / live.';
```

---

## 5. Points d'attention pour Phase 1 (lecture seule)

1. **`bio` absent du trigger** — pour bio obligatoire au onboarding, pas de changement trigger strictement requis (reste NULL jusqu'au sas) ; ou contrainte CHECK / NOT NULL après backfill.
2. **`display_name` pré-rempli OAuth** — le sas devra permettre édition si PO exige choix explicite (actuellement placeholder « Nouveau Citoyen »).
3. **Username temporaire `temp_*`** — compatible avec sas actuel qui remplace username ; valider unicité format `temp_` vs règles arène.
4. **Versionner le trigger** — priorité migration `103_*` pour éviter drift prod/repo.
5. **Client legacy** — ancien flux `ensurePublicUserProfile` (supprimé localement ?) insérait `needs_arena_username: false` ; le trigger prod **prend le dessus** sur nouveaux comptes via `ON CONFLICT DO NOTHING` si ligne déjà existante.

---

*Fin du rapport — extraction prod + repo, zéro modification.*
