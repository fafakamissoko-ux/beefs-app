'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './AuthContext';

type Theme = 'dark' | 'light' | 'auto';
type FontSize = 'small' | 'normal' | 'large';

interface DisplayPreferences {
  theme: Theme;
  fontSize: FontSize;
  reduceAnimations: boolean;
  highContrast: boolean;
}

interface ThemeContextType {
  preferences: DisplayPreferences;
  effectiveTheme: 'dark' | 'light';
  updatePreferences: (prefs: Partial<DisplayPreferences>) => Promise<void>;
}

const defaultPrefs: DisplayPreferences = {
  theme: 'dark',
  fontSize: 'normal',
  reduceAnimations: false,
  highContrast: false,
};

const ThemeContext = createContext<ThemeContextType>({
  preferences: defaultPrefs,
  effectiveTheme: 'dark',
  updatePreferences: async () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [preferences, setPreferences] = useState<DisplayPreferences>(defaultPrefs);

  const getEffectiveTheme = (theme: Theme): 'dark' | 'light' => {
    if (theme === 'auto') {
      if (typeof window !== 'undefined') {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      }
      return 'dark';
    }
    return theme;
  };

  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('display_preferences')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_preferences) {
          const prefs = { ...defaultPrefs, ...data.display_preferences };
          setPreferences(prefs);
          setEffectiveTheme(getEffectiveTheme(prefs.theme));
        }
      });
  }, [user]);

  useEffect(() => {
    if (preferences.theme !== 'auto') {
      setEffectiveTheme(getEffectiveTheme(preferences.theme));
      return;
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setEffectiveTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    setEffectiveTheme(mq.matches ? 'dark' : 'light');
    return () => mq.removeEventListener('change', handler);
  }, [preferences.theme]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-dark', 'theme-light');
    root.classList.add(`theme-${effectiveTheme}`);

    root.classList.remove('text-sm-mode', 'text-lg-mode');
    if (preferences.fontSize === 'small') root.classList.add('text-sm-mode');
    if (preferences.fontSize === 'large') root.classList.add('text-lg-mode');

    if (preferences.reduceAnimations) root.classList.add('reduce-motion');
    else root.classList.remove('reduce-motion');

    if (preferences.highContrast) root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');
  }, [effectiveTheme, preferences]);

  const updatePreferences = async (partial: Partial<DisplayPreferences>) => {
    const newPrefs = { ...preferences, ...partial };
    setPreferences(newPrefs);
    setEffectiveTheme(getEffectiveTheme(newPrefs.theme));

    if (user) {
      await supabase.from('users').update({ display_preferences: newPrefs }).eq('id', user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ preferences, effectiveTheme, updatePreferences }}>
      {children}
    </ThemeContext.Provider>
  );
}
