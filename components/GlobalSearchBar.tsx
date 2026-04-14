'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';
import { useRouter, usePathname } from 'next/navigation';
import { hrefWithFrom } from '@/lib/navigation-return';

interface SearchResult {
  type: 'beef' | 'user';
  id: string;
  title?: string;
  name?: string;
  username?: string;
  tags?: string[];
  status?: string;
  avatar_url?: string;
}

export type GlobalSearchModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function GlobalSearchModal({ open, onOpenChange }: GlobalSearchModalProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'beefs' | 'users'>('beefs');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const performSearch = useCallback(async () => {
    setLoading(true);
    try {
      if (activeTab === 'beefs') {
        const { data, error } = await supabase
          .from('beefs')
          .select('id, title, tags, status, created_at, viewer_count')
          .or(`title.ilike.%${query}%,description.ilike.%${query}%`)
          .limit(5);

        if (error) throw error;

        const beefResults: SearchResult[] = (data || []).map((beef) => ({
          type: 'beef',
          id: beef.id,
          title: beef.title,
          tags: beef.tags,
          status: beef.status,
        }));

        setResults(beefResults);
      } else {
        const { data, error } = await supabase
          .from('user_public_profile')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(5);

        if (error) throw error;

        const userResults: SearchResult[] = (data || []).map((user) => ({
          type: 'user',
          id: user.id,
          name: user.display_name || user.username,
          username: user.username,
          avatar_url: user.avatar_url,
        }));

        setResults(userResults);
      }
    } catch (error) {
      console.error('Search error:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, activeTab]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    const timeoutId = setTimeout(() => {
      void performSearch();
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, activeTab, performSearch]);

  const handleResultClick = (result: SearchResult) => {
    if (result.type === 'beef') {
      router.push(hrefWithFrom(`/arena/${result.id}`, pathname));
    } else {
      router.push(hrefWithFrom(`/profile/${result.username}`, pathname));
    }
    onOpenChange(false);
    setQuery('');
  };

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'live':
        return <span className="text-red-500 text-xs font-bold">🔴 LIVE</span>;
      case 'scheduled':
        return <span className="text-blue-500 text-xs font-bold">📅 À VENIR</span>;
      case 'ended':
        return <span className="text-gray-500 text-xs font-bold">✓ Terminé</span>;
      default:
        return null;
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-modal-backdrop bg-black/60 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
            aria-hidden
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Recherche globale"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className="fixed left-4 right-4 top-[max(5rem,10vh)] z-modal mx-auto w-[min(100%,32rem)] md:left-1/2 md:right-auto md:w-[500px] md:-translate-x-1/2"
          >
            <div className="overflow-hidden rounded-xl border border-white/[0.1] bg-[#121214] shadow-2xl max-h-[min(80vh,560px)] flex flex-col">
              <div className="flex items-center border-b border-white/[0.08] shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveTab('beefs')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors relative ${
                    activeTab === 'beefs' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <Flame className="w-4 h-4" />
                    <span>Beefs</span>
                  </div>
                  {activeTab === 'beefs' && (
                    <motion.div
                      layoutId="searchTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 brand-gradient"
                    />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('users')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors relative ${
                    activeTab === 'users' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Utilisateurs</span>
                  </div>
                  {activeTab === 'users' && (
                    <motion.div
                      layoutId="searchTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 brand-gradient"
                    />
                  )}
                </button>
              </div>

              <div className="border-b border-white/[0.08] p-4 shrink-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={
                      activeTab === 'beefs'
                        ? 'Rechercher des beefs…'
                        : 'Rechercher des utilisateurs…'
                    }
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2.5 pl-10 pr-10 text-sm text-white placeholder:text-gray-500 focus:border-brand-500 focus:outline-none"
                    autoFocus
                  />
                  {query ? (
                    <button
                      type="button"
                      onClick={() => setQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                      aria-label="Effacer"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  </div>
                ) : results.length > 0 ? (
                  <div className="divide-y divide-white/[0.06]">
                    {results.map((result) => (
                      <button
                        key={result.id}
                        type="button"
                        onClick={() => handleResultClick(result)}
                        className="w-full p-4 text-left transition-colors hover:bg-white/[0.04]"
                      >
                        {result.type === 'beef' ? (
                          <div>
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <h4 className="line-clamp-1 text-sm font-semibold text-white">{result.title}</h4>
                              {getStatusBadge(result.status)}
                            </div>
                            {result.tags && result.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.tags.slice(0, 3).map((tag, idx) => (
                                  <span key={idx} className="text-xs text-brand-400">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full brand-gradient text-sm font-bold text-white">
                              {result.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-white">{result.name}</p>
                              <p className="truncate text-xs text-gray-400">@{result.username}</p>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : query.length >= 2 ? (
                  <div className="py-10 text-center">
                    <p className="text-sm text-gray-500">Aucun résultat</p>
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <Search className="mx-auto mb-2 h-12 w-12 text-gray-700" />
                    <p className="text-sm text-gray-500">Tape au moins 2 caractères</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
