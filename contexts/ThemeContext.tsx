'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './AuthContext';

type FontSize = 'small' | 'normal' | 'large';

export interface DisplayPreferences {
  fontSize: FontSize;
  reduceAnimations: boolean;
  highContrast: boolean;
}

interface ThemeContextType {
  preferences: DisplayPreferences;
  /** Toujours sombre (Liquid Luxury / Obsidian). */
  effectiveTheme: 'dark';
  updatePreferences: (prefs: Partial<DisplayPreferences>) => Promise<void>;
}

const defaultPrefs: DisplayPreferences = {
  fontSize: 'normal',
  reduceAnimations: false,
  highContrast: false,
};

/** Fusionne avec les défauts et corrige les valeurs invalides (JSONB / anciennes données). */
function normalizeDisplayPreferences(raw: unknown): DisplayPreferences {
  const base =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? { ...defaultPrefs, ...(raw as Record<string, unknown>) }
      : { ...defaultPrefs };

  const fontSize =
    base.fontSize === 'small' || base.fontSize === 'normal' || base.fontSize === 'large'
      ? base.fontSize
      : defaultPrefs.fontSize;

  return {
    fontSize,
    reduceAnimations: Boolean(base.reduceAnimations),
    highContrast: Boolean(base.highContrast),
  };
}

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

  useEffect(() => {
    if (!user) return;
    supabase
      .from('users')
      .select('display_preferences')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_preferences) {
          const prefs = normalizeDisplayPreferences(data.display_preferences);
          setPreferences(prefs);
        }
      });
  }, [user]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove('theme-light');
    root.classList.add('theme-dark');

    root.classList.remove('text-sm-mode', 'text-lg-mode');
    if (preferences.fontSize === 'small') root.classList.add('text-sm-mode');
    if (preferences.fontSize === 'large') root.classList.add('text-lg-mode');

    if (preferences.reduceAnimations) root.classList.add('reduce-motion');
    else root.classList.remove('reduce-motion');

    if (preferences.highContrast) root.classList.add('high-contrast');
    else root.classList.remove('high-contrast');
  }, [preferences]);

  const updatePreferences = async (partial: Partial<DisplayPreferences>) => {
    const newPrefs = normalizeDisplayPreferences({ ...preferences, ...partial });
    setPreferences(newPrefs);

    if (user) {
      await supabase.from('users').update({ display_preferences: newPrefs }).eq('id', user.id);
    }
  };

  return (
    <ThemeContext.Provider value={{ preferences, effectiveTheme: 'dark', updatePreferences }}>
      {children}
    </ThemeContext.Provider>
  );
}
