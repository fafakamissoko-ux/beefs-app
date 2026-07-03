# Rapport d'audit SQL — Onboarding & `public.users`

**Date :** 31 mai 2026  
**Source :** fichiers `supabase_migrations/` (repo local — **pas d’interrogation live du Dashboard Supabase**)  
**Aucun code ni base modifié.**

---

## Synthèse exécutive

| Question | Réponse (repo) |
|----------|----------------|
| Colonnes **NOT NULL sans DEFAULT** obligatoires à l’INSERT | **`id`**, **`email`**, **`username`** uniquement |
| Trigger sécurité self-update | `enforce_users_safe_self_update` — **version canonique : migration `32_fix_users_phone_and_premium_settings_update.sql`** |
| Triggers sur `public.users` | **2** : `trg_users_updated_at`, `enforce_users_safe_self_update` |
| Trigger `on_auth_user_created` sur `auth.users` | **AUCUN** dans tout le dépôt |

---

## 1. Schéma consolidé `public.users`

Schéma reconstruit à partir de :
- `init.sql` (CREATE TABLE de référence)
- `45_users_needs_arena_username.sql`
- `54_radar_aura_dynamic.sql`
- `59_users_original_media_urls.sql`
- `60_profile_media_likes.sql`

### 1.1 Définition CREATE TABLE (base) — `init.sql`

```sql
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identité
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  banner_url TEXT,
  accent_color TEXT DEFAULT '#E83A14',
  phone TEXT,

  -- Gamification
  points INTEGER DEFAULT 0,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  streak_days INTEGER DEFAULT 0,
  last_activity_date DATE,
  total_beefs_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,
  total_gifts_sent INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0,
  beefs_attended INTEGER DEFAULT 0,
  beefs_created INTEGER DEFAULT 0,
  beefs_mediated INTEGER DEFAULT 0,

  -- Premium
  is_premium BOOLEAN DEFAULT false,
  premium_until TIMESTAMPTZ,
  premium_settings JSONB DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb,

  -- Badges / vérification
  badges TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  banned_until TIMESTAMPTZ,
  ban_reason TEXT,

  -- Stripe
  stripe_customer_id TEXT UNIQUE,

  -- Rôle et préférences
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin', 'moderator')),
  notification_settings JSONB DEFAULT '{}'::jsonb,
  privacy_settings JSONB DEFAULT '{}'::jsonb,
  display_preferences JSONB DEFAULT '{"theme": "dark", "fontSize": "normal", "reduceAnimations": false, "highContrast": false}'::jsonb,

  -- Onboarding OAuth
  needs_arena_username BOOLEAN NOT NULL DEFAULT false
);
```

### 1.2 Colonnes ajoutées par migrations ultérieures

**`45_users_needs_arena_username.sql`** (déjà dans `init.sql` consolidé — migration idempotente) :

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS needs_arena_username BOOLEAN NOT NULL DEFAULT false;
```

**`54_radar_aura_dynamic.sql`** :

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS lifetime_points integer NOT NULL DEFAULT 0;
```

**`59_users_original_media_urls.sql`** :

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_original_url TEXT,
  ADD COLUMN IF NOT EXISTS banner_original_url TEXT;
```

**`60_profile_media_likes.sql`** :

```sql
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_likes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS banner_likes integer NOT NULL DEFAULT 0;
```

### 1.3 Inventaire complet des colonnes (état cible post-migrations)

| Colonne | Type | NOT NULL | DEFAULT | Notes |
|---------|------|----------|---------|-------|
| `id` | UUID PK → `auth.users` | ✅ | ❌ | Doit = `auth.users.id` |
| `created_at` | TIMESTAMPTZ | ❌ | `NOW()` | |
| `updated_at` | TIMESTAMPTZ | ❌ | `NOW()` | Maintenu par trigger |
| `email` | TEXT | ✅ | ❌ | **Obligatoire INSERT** |
| `username` | TEXT UNIQUE | ✅ | ❌ | **Obligatoire INSERT** |
| `display_name` | TEXT | ❌ | — | |
| `bio` | TEXT | ❌ | — | |
| `avatar_url` | TEXT | ❌ | — | |
| `banner_url` | TEXT | ❌ | — | |
| `accent_color` | TEXT | ❌ | `'#E83A14'` | |
| `phone` | TEXT | ❌ | — | |
| `points` | INTEGER | ❌ | `0` | Figé au self-update |
| `level` | INTEGER | ❌ | `1` | Figé |
| `xp` | INTEGER | ❌ | `0` | Figé |
| `streak_days` | INTEGER | ❌ | `0` | Figé |
| `last_activity_date` | DATE | ❌ | — | Figé |
| `total_beefs_completed` | INTEGER | ❌ | `0` | Figé |
| `average_rating` | DECIMAL(3,2) | ❌ | `0` | Figé |
| `total_gifts_sent` | INTEGER | ❌ | `0` | Figé |
| `total_gifts_received` | INTEGER | ❌ | `0` | Figé |
| `beefs_attended` | INTEGER | ❌ | `0` | Figé |
| `beefs_created` | INTEGER | ❌ | `0` | Figé |
| `beefs_mediated` | INTEGER | ❌ | `0` | Figé |
| `is_premium` | BOOLEAN | ❌ | `false` | Figé |
| `premium_until` | TIMESTAMPTZ | ❌ | — | Figé |
| `premium_settings` | JSONB | ❌ | JSON preset | **Modifiable** self-update (depuis mig. 32) |
| `badges` | TEXT[] | ❌ | `'{}'` | Figé |
| `is_verified` | BOOLEAN | ❌ | `false` | Figé |
| `is_banned` | BOOLEAN | ❌ | `false` | Figé |
| `banned_until` | TIMESTAMPTZ | ❌ | — | Figé |
| `ban_reason` | TEXT | ❌ | — | Figé |
| `stripe_customer_id` | TEXT UNIQUE | ❌ | — | Figé |
| `role` | TEXT CHECK | ❌ | `'user'` | Figé |
| `notification_settings` | JSONB | ❌ | `'{}'` | Figé |
| `privacy_settings` | JSONB | ❌ | `'{}'` | Figé |
| `display_preferences` | JSONB | ❌ | JSON preset | Modifiable self-update |
| `needs_arena_username` | BOOLEAN | ✅ | `false` | **Non figé** par le trigger |
| `lifetime_points` | INTEGER | ✅ | `0` | **Non figé** par le trigger |
| `avatar_original_url` | TEXT | ❌ | — | Non figé |
| `banner_original_url` | TEXT | ❌ | — | Non figé |
| `avatar_likes` | INTEGER | ✅ | `0` | Non figé (compteur maintenu par trigger sur `profile_media_likes`) |
| `banner_likes` | INTEGER | ✅ | `0` | Non figé |

### 1.4 Colonnes NOT NULL sans DEFAULT — impact trigger futur

| Colonne | INSERT trigger devra fournir |
|---------|------------------------------|
| **`id`** | Oui — `NEW.id` depuis `auth.users` |
| **`email`** | Oui — depuis `auth.users.email` (ou placeholder documenté côté app pour phone-only) |
| **`username`** | Oui — slug généré ou placeholder + `needs_arena_username = true` |

Toutes les autres colonnes NOT NULL ont un **DEFAULT** (`needs_arena_username`, `lifetime_points`, `avatar_likes`, `banner_likes`).

### 1.5 Écart repo / app — `invitation_privacy`

La colonne `invitation_privacy` est lue/écrite dans `app/settings/page.tsx` mais **aucune migration** du repo ne la définit. À vérifier en prod via :

```sql
SELECT column_name, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;
```

---

## 2. Trigger de sécurité — `enforce_users_safe_self_update`

### 2.1 Version canonique (la plus récente)

**Fichier :** `supabase_migrations/32_fix_users_phone_and_premium_settings_update.sql`  
**Remplace :** version initiale dans `31_phase6_rls_hardening.sql` et `init.sql`.

```sql
CREATE OR REPLACE FUNCTION public.enforce_users_safe_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_app_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Mise à jour de profil réservée au compte connecté';
  END IF;

  NEW.created_at := OLD.created_at;
  NEW.email := OLD.email;
  NEW.username := OLD.username;
  NEW.phone := OLD.phone;
  NEW.points := OLD.points;
  NEW.level := OLD.level;
  NEW.total_beefs_completed := OLD.total_beefs_completed;
  NEW.average_rating := OLD.average_rating;
  NEW.xp := OLD.xp;
  NEW.streak_days := OLD.streak_days;
  NEW.last_activity_date := OLD.last_activity_date;
  NEW.total_gifts_sent := OLD.total_gifts_sent;
  NEW.total_gifts_received := OLD.total_gifts_received;
  NEW.beefs_attended := OLD.beefs_attended;
  NEW.beefs_created := OLD.beefs_created;
  NEW.beefs_mediated := OLD.beefs_mediated;
  NEW.is_premium := OLD.is_premium;
  NEW.premium_until := OLD.premium_until;
  -- premium_settings : laissé à NEW (badges affichage, raccourcis stats, etc.)
  NEW.badges := OLD.badges;
  NEW.is_verified := OLD.is_verified;
  NEW.is_banned := OLD.is_banned;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.notification_settings := OLD.notification_settings;
  NEW.privacy_settings := OLD.privacy_settings;
  NEW.role := OLD.role;
  NEW.banned_until := OLD.banned_until;
  NEW.ban_reason := OLD.ban_reason;
  RETURN NEW;
END;
$$;
```

### 2.2 Comportement résumé

| Contexte | Effet |
|----------|-------|
| `auth.uid()` NULL (service role, jobs) | **Aucune modification** — ligne passée telle quelle |
| Admin (`is_app_admin()`) | **Aucune modification** |
| Self-update (`NEW.id = auth.uid()`) | Colonnes listées ci-dessus **réassignées à OLD** |
| Self-update autre `id` | **EXCEPTION** |

### 2.3 Colonnes **non figées** (self-update autorisé)

D’après migration `31` (commentaire) + absences dans mig. `32` :

- `display_name`, `bio`
- `avatar_url`, `banner_url`, `avatar_original_url`, `banner_original_url`
- `accent_color`, `display_preferences`
- `premium_settings` (depuis mig. 32)
- `needs_arena_username` (**critique onboarding** — peut passer à `false` sans changer `username`)
- `lifetime_points`, `avatar_likes`, `banner_likes` (non listés → modifiables par l’utilisateur)
- `updated_at` (via trigger séparé)

### 2.4 Delta mig. 31 → 32

| Aspect | Migration 31 | Migration 32 |
|--------|--------------|--------------|
| `premium_settings` | Figé (`NEW := OLD`) | **Laissé à NEW** |
| `privacy_settings` | Figé | Figé |
| Colonne `phone` | Requise dans fonction | `ADD COLUMN IF NOT EXISTS phone` |

---

## 3. Inventaire des triggers sur `public.users`

| Trigger | Timing | Événement | Fonction | Fichier source |
|---------|--------|-----------|----------|----------------|
| **`trg_users_updated_at`** | BEFORE | UPDATE | `public.update_updated_at_column()` | `init.sql` |
| **`enforce_users_safe_self_update`** | BEFORE | UPDATE | `public.enforce_users_safe_self_update()` | `31_phase6_rls_hardening.sql` (CREATE TRIGGER) + `32_*` (REPLACE FUNCTION) |

### 3.1 Fonction `update_updated_at_column` — `init.sql`

```sql
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
```

```sql
DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

**Note :** migration `00_base_users.sql` définit un trigger homologue `update_users_updated_at` (nom différent). L’état consolidé `init.sql` utilise `trg_users_updated_at`.

### 3.2 Triggers **indirects** (autres tables → compteurs `users`)

| Trigger | Table | Effet sur `users` |
|---------|-------|-------------------|
| `tr_profile_media_likes_counts` | `profile_media_likes` | Met à jour `avatar_likes` / `banner_likes` (`60_profile_media_likes.sql`) |

**Aucun autre trigger INSERT/DELETE direct sur `public.users` dans le repo.**

---

## 4. Trigger `auth.users` — confirmation absence

### 4.1 Recherche exhaustive dans le dépôt

Patterns recherchés sans résultat SQL :
- `on_auth_user_created`
- `handle_new_user`
- `CREATE TRIGGER` sur `auth.users`
- `AFTER INSERT ON auth.users`

**Résultat :** zéro définition dans `supabase_migrations/`, `supabase/`, ou tout fichier `.sql` du projet.

### 4.2 Création profil actuelle (application, hors trigger)

| Chemin | Mécanisme |
|--------|-----------|
| Inscription email | `AuthContext.signUp()` → INSERT client `public.users` |
| OAuth / session | `ensurePublicUserProfile()` → INSERT client si ligne absente |
| RLS INSERT | Policy `users_insert_self` (`52_fix_rls_users_insert_self.sql`) — **authenticated** uniquement |

```sql
CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND COALESCE(points,     0)     = 0
    AND COALESCE(xp,         0)     = 0
    AND COALESCE(is_premium, false) = false
  );
```

**Implication trigger futur :** un handler `on_auth_user_created` en **SECURITY DEFINER** s’exécutera typiquement **sans JWT utilisateur** → `enforce_users_safe_self_update` ne s’applique qu’au UPDATE ; l’INSERT devra bypasser RLS (DEFINER + `SET role` ou policy service_role).

### 4.3 Réserve prod

Le repo peut être **incomplet** vs Dashboard Supabase (triggers créés manuellement). Requête de vérification recommandée **avant déploiement** :

```sql
-- Triggers auth.users
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal;

-- Triggers public.users
SELECT tgname, pg_get_triggerdef(t.oid)
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relname = 'users' AND NOT t.tgisinternal;
```

---

## 5. INSERT minimal pour futur trigger `handle_new_user`

Champs **strictement requis** (NOT NULL sans DEFAULT) :

```sql
INSERT INTO public.users (id, email, username)
VALUES (
  NEW.id,
  COALESCE(NEW.email, ''),  -- attention contrainte NOT NULL email
  <username_généré>
);
```

Champs **recommandés** pour alignement app actuelle :

```sql
display_name,
points := 0,
is_verified := (NEW.email_confirmed_at IS NOT NULL),
needs_arena_username := true,  -- si progressive profiling OAuth
-- lifetime_points, avatar_likes, banner_likes : DEFAULT DB suffisent
```

---

## 6. Risques identifiés pour refonte onboarding

1. **`username` figé au UPDATE** — onboarding `/onboarding` ne peut pas changer le pseudo via UPDATE client ; seul INSERT initial ou admin/service_role compte.
2. **`needs_arena_username` non figé** — peut être mis à `false` sans valider un vrai pseudo.
3. **Pas de trigger auth** — race / profil manquant si INSERT client échoue (RLS 42501 documenté dans mig. 52).
4. **`init.sql` vs migrations numérotées** — policy INSERT dans `init.sql` (`is_verified = false`) **obsolète** ; prod alignée sur mig. **52** si migrations appliquées dans l’ordre.
5. **Colonnes likes / lifetime_points** non protégées par `enforce_users_safe_self_update`.

---

## 7. Fichiers migrations de référence

| Fichier | Rôle |
|---------|------|
| `init.sql` | Schéma consolidé + triggers + RLS baseline |
| `00_base_users.sql` | Ancienne base (historique) |
| `31_phase6_rls_hardening.sql` | Création trigger `enforce_users_safe_self_update` |
| `32_fix_users_phone_and_premium_settings_update.sql` | **Version actuelle** de la fonction enforce |
| `45_users_needs_arena_username.sql` | Colonne onboarding |
| `52_fix_rls_users_insert_self.sql` | Policy INSERT assouplie (`is_verified`) |
| `54_radar_aura_dynamic.sql` | `lifetime_points` |
| `59_users_original_media_urls.sql` | URLs médias originaux |
| `60_profile_media_likes.sql` | Compteurs likes avatar/bannière |

---

**Fin du rapport — extraction SQL brute, zéro modification.**
