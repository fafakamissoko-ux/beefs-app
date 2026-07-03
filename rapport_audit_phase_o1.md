# Rapport d'audit — Phase O.1 (Circuit de Monétisation)

**Date d'extraction :** 2026-07-03  
**Branche :** `main` (post N.1 — commit `959ce51`)  
**Objectifs O.1 :** Auditer Lingots, transactions, catalogue cadeaux avant refonte logique transactionnelle.  
**Contrainte :** Zéro modification du code source.

---

## Observations Architecte (synthèse)

| Domaine | État actuel |
|---------|-------------|
| **Solde Lingots** | Colonne `users.points` (INTEGER, défaut 0) — **pas de table `wallets`** |
| **Historique** | Table `transactions` (ledger append-only avec `balance_after`) |
| **Catalogue cadeaux** | Table DB `gift_types` + **duplication hardcodée** dans `TikTokStyleArena.tsx` (12 items) |
| **Envoi cadeau** | RPC `send_gift` (service_role) via `POST /api/gifts/send` |
| **Achat Lingots** | Stripe checkout → webhook → RPC `update_user_balance` |
| **Types TS Supabase** | **Stub partiel** dans `lib/supabase/client.ts` — **ne reflète pas** `users` / `transactions` / `gift_types` |
| **Store global solde** | **Absent** — `AuthContext` = session uniquement ; solde en `useState` local (arène) ou React Query (`/points`) |
| **Temps réel solde** | Polling manuel après achat popup ; pas de Supabase Realtime sur `users.points` |

---

## 1. Schéma Base de Données (Supabase)

### 1a. Fichier types TypeScript généré

**Chemin :** `lib/supabase/client.ts` — type `Database` **manuel / incomplet** (pas de `types/supabase.ts` ni `database.types.ts` dans le repo).

**Tables présentes dans le stub :** `rooms`, `challenger_queue`, `messages`, `gifts` (ancien schéma room-based, **≠** schéma beef actuel).

```typescript
// lib/supabase/client.ts (l.9–68) — extrait intégral du type Database
export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          title: string;
          host_id: string;
          host_name: string;
          tension_level: number;
          status: 'waiting' | 'live' | 'ended';
          current_challenger_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rooms']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['rooms']['Insert']>;
      };
      challenger_queue: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          position: number;
          status: 'waiting' | 'active' | 'done';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['challenger_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['challenger_queue']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          content: string;
          type: 'chat' | 'source' | 'fact_check';
          is_pinned: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      gifts: {
        Row: {
          id: string;
          room_id: string;
          from_user_id: string;
          to_user_id: string;
          gift_type: 'flame' | 'crown' | 'lightning' | 'diamond';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['gifts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['gifts']['Insert']>;
      };
    };
  };
};
```

**⚠️ Risque O.1 :** le typage client ne couvre pas le modèle monétisation réel — les requêtes `users.points`, `transactions`, `gift_types` passent sans contrat TS strict.

---

### 1b. Table `users` — solde Lingots (SQL source : `supabase_migrations/00_base_users.sql`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Identity
  email TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  bio TEXT,
  avatar_url TEXT,
  phone TEXT,

  -- Gamification
  points INTEGER DEFAULT 0,          -- ← SOLDE LINGOTS
  level INTEGER DEFAULT 1,
  total_beefs_completed INTEGER DEFAULT 0,
  average_rating DECIMAL(3,2) DEFAULT 0,

  -- Premium
  is_premium BOOLEAN DEFAULT false,
  premium_until TIMESTAMPTZ,
  premium_settings JSONB DEFAULT '{"showPremiumBadge": true, "showPremiumFrame": true, "showPremiumAnimations": true}'::jsonb,

  badges TEXT[] DEFAULT '{}',
  is_verified BOOLEAN DEFAULT false,
  is_banned BOOLEAN DEFAULT false,
  stripe_customer_id TEXT,
  notification_settings JSONB DEFAULT '{}'::jsonb,
  privacy_settings JSONB DEFAULT '{}'::jsonb
);
```

**Équivalent TypeScript (reconstitué pour O.1) :**

```typescript
interface UsersRow {
  id: string;
  created_at: string;
  updated_at: string;
  email: string;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone: string | null;
  points: number;              // Lingots
  level: number;
  total_beefs_completed: number;
  average_rating: number;
  is_premium: boolean;
  premium_until: string | null;
  premium_settings: Record<string, unknown>;
  badges: string[];
  is_verified: boolean;
  is_banned: boolean;
  stripe_customer_id: string | null;
  notification_settings: Record<string, unknown>;
  privacy_settings: Record<string, unknown>;
  role?: 'user' | 'admin' | 'moderator'; // chargé par AuthContext, colonne ajoutée migrations ultérieures
}
```

**Table `wallets` :** **N'existe pas** — solde unique sur `users.points`.

---

### 1c. Table `transactions` (SQL : `supabase_migrations/05_monetization_gamification.sql`)

```sql
CREATE TABLE IF NOT EXISTS transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'purchase', 'gift_sent', 'gift_received', 'beef_access', 'reward', 'subscription'
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

```typescript
interface TransactionRow {
  id: string;
  user_id: string;
  type: 'purchase' | 'gift_sent' | 'gift_received' | 'beef_access' | 'beef_access_revenue' | 'withdrawal_hold' | 'refund' | 'reward' | 'subscription' | string;
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}
```

---

### 1d. Tables cadeaux

**`gift_types` (catalogue) :**

```sql
CREATE TABLE IF NOT EXISTS gift_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL,
  price INTEGER NOT NULL,
  animation_url TEXT,
  tier INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`gifts` (envois) :**

```sql
CREATE TABLE IF NOT EXISTS gifts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  beef_id UUID REFERENCES beefs(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID REFERENCES users(id) ON DELETE SET NULL,
  gift_type_id TEXT REFERENCES gift_types(id),
  points_amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**`gift_logs` (audit arène — migration 53) :**

```sql
CREATE TABLE IF NOT EXISTS gift_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  gift_type_id TEXT NOT NULL REFERENCES gift_types(id),
  points_amount INTEGER NOT NULL CHECK (points_amount > 0),
  gift_id UUID REFERENCES gifts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 1e. RPC / fonctions stockées (signatures)

| Fonction | Signature | Rôle |
|----------|-----------|------|
| **`update_user_balance`** | `(p_user_id UUID, p_amount INTEGER, p_type TEXT, p_description TEXT, p_metadata JSONB DEFAULT '{}') → JSONB` | Débit/crédit atomique + insert `transactions` |
| **`send_gift`** | `(p_beef_id UUID, p_sender_id UUID, p_recipient_id UUID, p_gift_type_id TEXT, p_points_amount INTEGER) → JSONB` | Envoi cadeau arène (service_role) |
| **`distribute_gift_revenue`** | `(p_gift_id UUID) → JSONB` | Split 70/30 médiateur/plateforme |
| **`add_xp_to_user`** | `(p_user_id UUID, p_xp_amount INTEGER, p_source TEXT) → …` | Bonus XP post-achat Stripe |
| **`login_precheck`** | `(p_identifier TEXT) → …` | Auth par @pseudo (AuthContext) |
| **`user_has_beef_access`** | `(…) → …` | Accès payant beef |

**Corps `update_user_balance` (extrait) :**

```sql
CREATE OR REPLACE FUNCTION update_user_balance(
  p_user_id UUID,
  p_amount INTEGER,
  p_type TEXT,
  p_description TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS JSONB AS $$
-- SELECT points → v_new_balance := v_old_balance + p_amount
-- UPDATE users SET points = v_new_balance
-- INSERT INTO transactions (...)
-- RETURN jsonb_build_object('transaction_id', ..., 'new_balance', v_new_balance, ...)
```

**Corps `send_gift` (migration 53 — intégral) :**

```sql
CREATE OR REPLACE FUNCTION public.send_gift(
  p_beef_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID,
  p_gift_type_id TEXT,
  p_points_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
-- Retour: { success: true, new_balance: INTEGER, gift_id: UUID }
-- GRANT EXECUTE TO service_role ONLY
-- Validations: beef live, recipient = mediator, gift_type.price = p_points_amount, solde suffisant
-- Débit sender (gift_sent) + crédit recipient (gift_received) via update_user_balance
-- INSERT gifts + gift_logs
```

---

## 2. Gestionnaire d'état utilisateur — `contexts/AuthContext.tsx`

**Pas de `userStore.ts` / `authStore.ts` Zustand.** Session React Context uniquement — **sans solde Lingots**.

**Fichier source complet (262 lignes) :**

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { validateSignupEmail } from '@/lib/email-signup-policy';
import { hydrateLocalPrefsFromUser } from '@/lib/sync-user-client-prefs';
import { getBrowserSiteOrigin } from '@/lib/site-origin';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: 'user' | 'admin' | 'moderator' | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: unknown }>;
  signIn: (identifier: string, password: string) => Promise<{ error: unknown }>;
  signInWithGoogle: () => Promise<{ error: unknown }>;
  signInWithApple: () => Promise<{ error: unknown }>;
  signInWithMagicLink: (email: string) => Promise<{ error: unknown }>;
  /** SMS — nécessite Phone activé dans Supabase + fournisseur (Twilio, etc.). */
  sendPhoneOtp: (phoneE164: string) => Promise<{ error: unknown }>;
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<{ error: unknown }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: unknown }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<'user' | 'admin' | 'moderator' | null>(null);

  const loadUserRole = useCallback(async (userId: string) => {
    try {
      const { data } = await supabase.from('users').select('role').eq('id', userId).single();
      setUserRole((data?.role as 'user' | 'admin' | 'moderator') ?? 'user');
    } catch {
      setUserRole('user');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubAuth: () => void = () => {};

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;

      setSession(session);
      setUser(session?.user ?? null);

      if (session?.user) {
        hydrateLocalPrefsFromUser(session.user);
        await loadUserRole(session.user.id);
      } else {
        setUserRole(null);
      }
      setLoading(false);

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((_event, session) => {
        void (async () => {
          setSession(session);
          setUser(session?.user ?? null);

          if (session?.user) {
            hydrateLocalPrefsFromUser(session.user);
            await loadUserRole(session.user.id);
          } else {
            setUserRole(null);
          }

          if (!cancelled) setLoading(false);
        })();
      });
      unsubAuth = () => subscription.unsubscribe();
    })();

    return () => {
      cancelled = true;
      unsubAuth();
    };
  }, [loadUserRole]);

  const signUp = async (email: string, password: string, username: string) => {
    try {
      const emailPolicy = validateSignupEmail(email);
      if (!emailPolicy.ok) {
        return { error: { message: emailPolicy.message, name: 'EmailNotAllowed' } };
      }

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: username,
          },
          emailRedirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });

      return { error: error ?? null };
    } catch (error) {
      return { error };
    }
  };

  const signIn = async (identifier: string, password: string) => {
    try {
      let targetEmail = identifier;

      if (!identifier.includes('@')) {
        const { data, error: rpcError } = await supabase.rpc('login_precheck', {
          p_identifier: identifier,
        });
        if (rpcError || !data || data.length === 0 || !data[0].email) {
          return { error: { message: 'Identifiant introuvable ou compte banni.' } };
        }
        targetEmail = data[0].email;
      }

      const { error } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signInWithGoogle = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signInWithApple = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signInWithMagicLink = async (email: string) => {
    try {
      const emailPolicy = validateSignupEmail(email);
      if (!emailPolicy.ok) {
        return { error: { message: emailPolicy.message, name: 'EmailNotAllowed' } };
      }

      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${getBrowserSiteOrigin()}/auth/callback`,
        },
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const sendPhoneOtp = async (phoneE164: string) => {
    try {
      const { error } = await supabase.auth.signInWithOtp({
        phone: phoneE164,
        options: {
          shouldCreateUser: true,
        },
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const verifyPhoneOtp = async (phoneE164: string, token: string) => {
    try {
      const { error } = await supabase.auth.verifyOtp({
        phone: phoneE164,
        token: token.trim(),
        type: 'sms',
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    if (typeof window !== 'undefined') {
      window.location.href = '/feed';
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${getBrowserSiteOrigin()}/auth/reset-password`,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      userRole,
      signUp,
      signIn,
      signInWithGoogle,
      signInWithApple,
      signInWithMagicLink,
      sendPhoneOtp,
      verifyPhoneOtp,
      signOut,
      resetPassword,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- méthodes auth stables par render suffisant ; deps = états session
    [user, session, loading, userRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### Injection solde aujourd'hui (hors AuthContext)

**Arène — `TikTokStyleArena.tsx` :**

```tsx
const [userPoints, setUserPoints] = useState(0);

useEffect(() => {
  if (!userId) return;
  (async () => {
    const { data } = await supabase.from('users').select('points').eq('id', userId).single();
    if (data) setUserPoints(data.points || 0);
  })();
}, [userId]);

// Après envoi cadeau :
setUserPoints(data.newBalance);

// Après achat popup Stripe (polling 3s) :
setUserPoints(data.points);
```

**Dashboard — `app/points/page.tsx` :**

```tsx
useQuery({
  queryKey: ['wallet', user?.id],
  queryFn: async () => {
    const [{ data: pointsData }, { data: txData }] = await Promise.all([
      supabase.from('users').select('points').eq('id', user.id).single(),
      supabase.from('transactions').select('...').eq('user_id', user.id).limit(80),
    ]);
    return { points: pointsData?.points ?? 0, transactions: txData };
  },
});
```

**Stores Zustand existants (`lib/stores/`) :** `arenaVolatileStore`, `arenaVerdictStore`, `arenaPulseVoicesStore` — **aucun store wallet/lingots**.

---

## 3. Catalogue de cadeaux

### 3a. Fichier dédié `lib/constants/gifts.ts` — **N'EXISTE PAS**

Pas de `types/gifts.ts` non plus. Catalogue **dupliqué** :

| Source | Contenu |
|--------|---------|
| **DB** `gift_types` | Seed migration 53 (12 cadeaux arène) |
| **UI** `TikTokStyleArena.tsx` | Array inline identique (hardcodé) |
| **Archive** `components/_archive/GiftSystem.tsx` | Ancien système (non prod) |

### 3b. Seed DB — `supabase_migrations/53_send_gift_rpc_gift_logs.sql`

```sql
INSERT INTO gift_types (id, name, emoji, price, tier, is_active) VALUES
  ('salt', 'Sel', '🧂', 1, 1, true),
  ('mic_drop', 'Mic Drop', '🎤', 5, 1, true),
  ('spicy', 'Spicy', '🌶️', 10, 1, true),
  ('big_brain', 'Big Brain', '🧠', 25, 1, true),
  ('lightning', 'Foudre', '⚡', 50, 2, true),
  ('ko', 'K.O.', '🥊', 99, 2, true),
  ('banger', 'Banger', '💣', 199, 2, true),
  ('wolf', 'Loup', '🐺', 500, 3, true),
  ('meteor', 'Météore', '☄️', 1000, 3, true),
  ('volcano', 'Éruption', '🌋', 2500, 3, true),
  ('champion', 'Champion', '🏆', 5000, 3, true),
  ('goat', 'G.O.A.T', '🐐', 10000, 3, true)
ON CONFLICT (id) DO UPDATE SET ...;
```

### 3c. Catalogue UI inline — `TikTokStyleArena.tsx` (l.3722–3734)

```tsx
{[
  { emoji: '🧂', label: 'Sel', id: 'salt', cost: 1 },
  { emoji: '🎤', label: 'Mic Drop', id: 'mic_drop', cost: 5 },
  { emoji: '🌶️', label: 'Spicy', id: 'spicy', cost: 10 },
  { emoji: '🧠', label: 'Big Brain', id: 'big_brain', cost: 25 },
  { emoji: '⚡', label: 'Foudre', id: 'lightning', cost: 50 },
  { emoji: '🥊', label: 'K.O.', id: 'ko', cost: 99 },
  { emoji: '💣', label: 'Banger', id: 'banger', cost: 199 },
  { emoji: '🐺', label: 'Loup', id: 'wolf', cost: 500 },
  { emoji: '☄️', label: 'Météore', id: 'meteor', cost: 1000 },
  { emoji: '🌋', label: 'Éruption', id: 'volcano', cost: 2500 },
  { emoji: '🏆', label: 'Champion', id: 'champion', cost: 5000 },
  { emoji: '🐐', label: 'G.O.A.T', id: 'goat', cost: 10000 },
].map((gift) => ( /* ... */ ))}
```

**Flux envoi :** `POST /api/gifts/send` → RPC `send_gift` — validation stricte `gift_type.price == p_points_amount`.

---

## 4. Circuit achat Stripe (annexe O.1)

- **Checkout :** `app/api/stripe/checkout/route.ts`
- **Webhook :** `app/api/stripe/webhook/route.ts` → `update_user_balance(p_type: 'purchase')`
- **UI achat :** `app/buy-points/page.tsx`, popup `goBuyPoints()` dans arène

---

## Recommandations Phase O.1 (observations, hors scope extraction)

1. **Générer / étendre** `Database` types Supabase (`users`, `transactions`, `gift_types`).
2. **Centraliser catalogue** : `lib/constants/gifts.ts` ou fetch `gift_types` + cache React Query.
3. **Store wallet global** (Zustand ou extension AuthContext) avec Realtime `users.points` ou invalidation query unifiée.
4. **Désynchronisation** : stub `gifts` room-based vs schéma beef — nettoyer `lib/supabase/client.ts`.

---

*Fin du rapport — extraction Phase O.1 (zéro modification).*
