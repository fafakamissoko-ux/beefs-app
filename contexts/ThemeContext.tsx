'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from './AuthContext';

type Theme = 'dark' | 'light' | 'auto';
/** Quand `theme === 'auto'` : suivre le système ou l’heure locale (jour / nuit). */
export type AutoThemeSource = 'system' | 'schedule';
type FontSize = 'small' | 'normal' | 'large';

interface DisplayPreferences {
  theme: Theme;
  /** Utilisé uniquement si `theme === 'auto'`. Défaut : `schedule`. */
  autoThemeSource: AutoThemeSource;
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
  autoThemeSource: 'schedule',
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

  const theme =
    base.theme === 'dark' || base.theme === 'light' || base.theme === 'auto'
      ? base.theme
      : defaultPrefs.theme;

  const autoThemeSource =
    base.autoThemeSource === 'system' || base.autoThemeSource === 'schedule'
      ? base.autoThemeSource
      : defaultPrefs.autoThemeSource;

  const fontSize =
    base.fontSize === 'small' || base.fontSize === 'normal' || base.fontSize === 'large'
      ? base.fontSize
      : defaultPrefs.fontSize;

  return {
    theme,
    autoThemeSource,
    fontSize,
    reduceAnimations: Boolean(base.reduceAnimations),
    highContrast: Boolean(base.highContrast),
  };
}

/** Clair entre 7h et 20h (heure locale du navigateur), sombre sinon. */
export function effectiveThemeFromLocalSchedule(): 'dark' | 'light' {
  const h = new Date().getHours();
  return h >= 7 && h < 20 ? 'light' : 'dark';
}

function computeEffectiveTheme(prefs: DisplayPreferences): 'dark' | 'light' {
  if (prefs.theme === 'dark') return 'dark';
  if (prefs.theme === 'light') return 'light';
  if (prefs.theme === 'auto') {
    if (prefs.autoThemeSource === 'schedule') {
      return effectiveThemeFromLocalSchedule();
    }
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'dark';
  }
  return 'dark';
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
          const prefs = normalizeDisplayPreferences(data.display_preferences);
          setPreferences(prefs);
          setEffectiveTheme(computeEffectiveTheme(prefs));
        }
      });
  }, [user]);

  useEffect(() => {
    if (preferences.theme !== 'auto') {
      setEffectiveTheme(computeEffectiveTheme(preferences));
      return;
    }
    if (preferences.autoThemeSource === 'schedule') {
      const tick = () => setEffectiveTheme(effectiveThemeFromLocalSchedule());
      tick();
      const id = window.setInterval(tick, 60_000);
      return () => window.clearInterval(id);
    }
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setEffectiveTheme(e.matches ? 'dark' : 'light');
    mq.addEventListener('change', handler);
    setEffectiveTheme(mq.matches ? 'dark' : 'light');
    return () => mq.removeEventListener('change', handler);
  }, [preferences.theme, preferences.autoThemeSource]);

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
    const newPrefs = normalizeDisplayPreferences({ ...preferences, ...partial });
    setPreferences(newPrefs);
    setEffectiveTheme(computeEffectiveTheme(newPrefs));

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
