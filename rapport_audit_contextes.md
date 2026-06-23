# Rapport d'audit source — Contextes React (Phase B.4)

**Date :** 31 mai 2026  
**Périmètre :** extraction intégrale, zéro modification du code source  
**Objectif :** préparer la migration **Zustand** (`MessagesDrawer`) et l'optimisation **Auth** sans casser session ni UI.

---

## Fichiers extraits

| Fichier | Lignes | Rôle |
|---------|--------|------|
| `contexts/MessagesDrawerContext.tsx` | 42 | État global drawer messages |
| `contexts/AuthContext.tsx` | 258 | Session Supabase + méthodes auth |

---

## Synthèse — `MessagesDrawerContext.tsx`

### Contrat (`MessagesDrawerContextValue`)

| Membre | Type | Rôle |
|--------|------|------|
| `isDrawerOpen` | `boolean` | Visibilité du drawer |
| `targetUserId` | `string \| undefined` | Conversation cible (optionnelle) |
| `openDrawer` | `(userId?: string) => void` | Ouvre + fixe la cible |
| `closeDrawer` | `() => void` | Ferme + reset cible après 300 ms (animation) |

### Implémentation

- **États :** 2 `useState` (`isDrawerOpen`, `targetUserId`)
- **Méthodes :** `openDrawer` et `closeDrawer` en `useCallback` (deps `[]`)
- **Provider value :** objet inline `{ isDrawerOpen, targetUserId, openDrawer, closeDrawer }` — **pas de `useMemo`**
  - À chaque changement d'état → nouvelle référence `value` → re-render de **tous** les consommateurs `useMessagesDrawer`

### Consommateurs identifiés

| Fichier | Usage |
|---------|-------|
| `app/layout.tsx` | `MessagesDrawerProvider` (racine) |
| `components/GlobalMessagesDrawer.tsx` | `isDrawerOpen`, `closeDrawer` |
| `components/MessagesUI.tsx` | `targetUserId`, `isDrawerOpen` |
| `components/Header.tsx` | `openDrawer` |
| `components/TikTokStyleArena.tsx` | `openDrawer` |

### Cible store Zustand (B.4)

```typescript
// Esquisse — à implémenter en B.4
interface MessagesDrawerStore {
  isDrawerOpen: boolean;
  targetUserId?: string;
  openDrawer: (userId?: string) => void;
  closeDrawer: () => void;
}
```

**Note migration :** conserver le `setTimeout(300)` dans `closeDrawer` pour l'animation vaul/drawer.

---

## Synthèse — `AuthContext.tsx`

### Contrat (`AuthContextType`)

| Membre | Type | Rôle |
|--------|------|------|
| `user` | `User \| null` | Utilisateur Supabase |
| `session` | `Session \| null` | Session JWT |
| `loading` | `boolean` | Boot + transitions auth |
| `userRole` | `'user' \| 'admin' \| 'moderator' \| null` | Rôle table `users` |
| `signUp` | email/password/username | Inscription + `validateSignupEmail` |
| `signIn` | identifier/password | Login email ou RPC `login_precheck` |
| `signInWithGoogle` / `signInWithApple` | OAuth | Redirect `/auth/callback` |
| `signInWithMagicLink` | email OTP | Magic link |
| `sendPhoneOtp` / `verifyPhoneOtp` | SMS | OTP téléphone |
| `signOut` | — | `signOut` + redirect `/feed` |
| `resetPassword` | email | Reset email Supabase |

### Cycle de vie session

1. **Mount :** `getSession()` → `setSession` / `setUser` → `hydrateLocalPrefsFromUser` → `loadUserRole` → `setLoading(false)`
2. **Subscription :** `onAuthStateChange` — même séquence async à chaque événement
3. **Cleanup :** `cancelled` flag + `subscription.unsubscribe()`

### Analyse mémoïsation — ⚠️ Problèmes identifiés

| Élément | Mémoïsé ? | Impact |
|---------|-----------|--------|
| `loadUserRole` | ✅ `useCallback([])` | Stable |
| `signUp`, `signIn`, OAuth, OTP, `signOut`, `resetPassword` | ❌ fonctions recréées à **chaque render** | Nouvelle ref à chaque render du Provider |
| Objet `value` (L232–246) | ❌ **pas de `useMemo`** | Nouvel objet à **chaque render** |
| `user`, `session`, `loading`, `userRole` | États React normaux | Re-render Provider à chaque changement |

**Conclusion Architecte :** toute mutation d'état (`loading`, `userRole`, etc.) recrée `value` → **re-render en cascade** de tous les ~40 consommateurs `useAuth()`, même ceux qui n'utilisent qu'une slice (ex. `user?.id`).

### Dépendances externes

- `@/lib/supabase/client`
- `@/lib/email-signup-policy` (`validateSignupEmail`)
- `@/lib/sync-user-client-prefs` (`hydrateLocalPrefsFromUser`)
- `@/lib/site-origin` (`getBrowserSiteOrigin`)
- RPC `login_precheck`

### Pistes B.4 (sans modifier ici)

1. **Zustand auth store** : séparer `session` / `user` / `userRole` / `loading` avec sélecteurs fins
2. **Actions stables** : méthodes auth en dehors du composant ou `useCallback` + `useMemo` sur `value`
3. **Conserver** : `onAuthStateChange`, `hydrateLocalPrefsFromUser`, `loadUserRole`, politique email signup

---

## Code source — `contexts/MessagesDrawerContext.tsx`

```tsx
'use client';

import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

type MessagesDrawerContextValue = {
  isDrawerOpen: boolean;
  targetUserId?: string;
  openDrawer: (userId?: string) => void;
  closeDrawer: () => void;
};

const MessagesDrawerContext = createContext<MessagesDrawerContextValue | null>(null);

export function MessagesDrawerProvider({ children }: { children: ReactNode }) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | undefined>();

  const openDrawer = useCallback((userId?: string) => {
    setTargetUserId(userId);
    setIsDrawerOpen(true);
  }, []);

  const closeDrawer = useCallback(() => {
    setIsDrawerOpen(false);
    setTimeout(() => setTargetUserId(undefined), 300); // Délai pour l'animation de fermeture
  }, []);

  return (
    <MessagesDrawerContext.Provider value={{ isDrawerOpen, targetUserId, openDrawer, closeDrawer }}>
      {children}
    </MessagesDrawerContext.Provider>
  );
}

export function useMessagesDrawer(): MessagesDrawerContextValue {
  const ctx = useContext(MessagesDrawerContext);
  if (!ctx) {
    throw new Error('useMessagesDrawer doit être utilisé dans MessagesDrawerProvider');
  }
  return ctx;
}
```

---

## Code source — `contexts/AuthContext.tsx`

```tsx
'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
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

  const value = {
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
  };

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

---

*Fin du rapport — aucune modification du code source.*
