'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { GlobalSearchModal } from '@/components/GlobalSearchBar';

type GlobalSearchContextValue = {
  openSearch: () => void;
  closeSearch: () => void;
};

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null);

export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const openSearch = useCallback(() => setOpen(true), []);
  const closeSearch = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <GlobalSearchContext.Provider value={{ openSearch, closeSearch }}>
      {children}
      {/* === HOOK DE CONVERSION PREMIUM (RECHERCHE) === — priorité stacking absolue */}
      <div className="relative z-[999999]">
        <GlobalSearchModal open={open} onOpenChange={setOpen} />
      </div>
    </GlobalSearchContext.Provider>
  );
}

export function useGlobalSearch(): GlobalSearchContextValue {
  const ctx = useContext(GlobalSearchContext);
  if (!ctx) {
    throw new Error('useGlobalSearch doit être utilisé dans GlobalSearchProvider');
  }
  return ctx;
}
