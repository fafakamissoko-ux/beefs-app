'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { validateSignupEmail } from '@/lib/email-signup-policy';
import { hydrateLocalPrefsFromUser } from '@/lib/sync-user-client-prefs';
import { ensurePublicUserProfile } from '@/lib/ensure-public-user-profile';
import { getBrowserSiteOrigin } from '@/lib/site-origin';
import type { User, Session } from '@supabase/supabase-js';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  userRole: 'user' | 'admin' | 'moderator' | null;
  signUp: (email: string, password: string, username: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signInWithGoogle: () => Promise<{ error: any }>;
  /** SMS — nécessite Phone activé dans Supabase + fournisseur (Twilio, etc.). */
  sendPhoneOtp: (phoneE164: string) => Promise<{ error: any }>;
  verifyPhoneOtp: (phoneE164: string, token: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: any }>;
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
        void ensurePublicUserProfile(supabase, session.user);
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
            void ensurePublicUserProfile(supabase, session.user);
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

      const { data, error } = await supabase.auth.signUp({
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

      if (error) return { error };

      // Create user profile in database
      if (data.user) {
        await supabase.from('users').insert({
          id: data.user.id,
          email: data.user.email,
          username,
          display_name: username,
          points: 0,
          is_verified: false,
          needs_arena_username: false,
        });
      }

      return { error: null };
    } catch (error) {
      return { error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    } catch (error) {
      return { error };
    }
  };

  // Requires Google OAuth setup in Supabase Dashboard:
  // Authentication → Providers → Google → Enable + add Client ID & Secret from Google Cloud Console
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
