'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, User, Flame, Clock } from 'lucide-react';
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

export function GlobalSearchBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'beefs' | 'users'>('beefs');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

        const beefResults: SearchResult[] = (data || []).map(beef => ({
          type: 'beef',
          id: beef.id,
          title: beef.title,
          tags: beef.tags,
          status: beef.status,
        }));

        setResults(beefResults);
      } else {
        const { data, error } = await supabase
          .from('users')
          .select('id, username, display_name, avatar_url')
          .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
          .limit(5);

        if (error) throw error;

        const userResults: SearchResult[] = (data || []).map(user => ({
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

  // Search with debounce
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
    setIsOpen(false);
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
    <div ref={searchRef} className="relative">
      {/* Search Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white px-4 py-2 rounded-lg transition-colors"
      >
        <Search className="w-4 h-4" />
        <span className="hidden md:inline text-sm">Rechercher...</span>
      </button>

      {/* Search Modal */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed left-0 right-0 top-14 bottom-0 bg-black/50 backdrop-blur-sm z-modal-backdrop"
              onClick={() => setIsOpen(false)}
              aria-hidden
            />

            {/* Search Panel */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed top-[50%] -translate-y-1/2 left-4 right-20 md:left-1/2 md:-translate-x-1/2 md:right-auto w-auto md:w-[500px] md:top-24 md:translate-y-0 bg-gray-900 rounded-xl border border-gray-700 shadow-2xl z-modal overflow-hidden max-h-[80vh] md:max-h-[75vh]"
            >
              {/* Tabs */}
              <div className="flex items-center border-b border-gray-800">
                <button
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
                  onClick={() => setActiveTab('users')}
                  className={`flex-1 px-4 py-3 text-sm font-semibold transition-colors relative ${
                    activeTab === 'users' ? 'text-white' : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <User className="w-4 h-4" />
                    <span>Users</span>
                  </div>
                  {activeTab === 'users' && (
                    <motion.div
                      layoutId="searchTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 brand-gradient"
                    />
                  )}
                </button>
              </div>

              {/* Search Input */}
              <div className="p-4 border-b border-gray-800">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={activeTab === 'beefs' ? 'Rechercher des beefs...' : 'Rechercher des users...'}
                    className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl pl-10 pr-10 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                    autoFocus
                  />
                  {query && (
                    <button
                      onClick={() => setQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              {/* Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : results.length > 0 ? (
                  <div className="divide-y divide-gray-800">
                    {results.map((result) => (
                      <button
                        key={result.id}
                        onClick={() => handleResultClick(result)}
                        className="w-full p-4 hover:bg-gray-800 transition-colors text-left"
                      >
                        {result.type === 'beef' ? (
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <h4 className="text-white font-semibold text-sm line-clamp-1">{result.title}</h4>
                              {getStatusBadge(result.status)}
                            </div>
                            {result.tags && result.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {result.tags.slice(0, 3).map((tag, idx) => (
                                  <span key={idx} className="text-xs text-brand-400">
                                    ${tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full brand-gradient flex items-center justify-center text-white font-bold">
                              {result.name?.[0]?.toUpperCase() || '?'}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-white font-semibold text-sm truncate">{result.name}</p>
                              <p className="text-gray-400 text-xs truncate">@{result.username}</p>
                            </div>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : query.length >= 2 ? (
                  <div className="py-8 text-center">
                    <p className="text-gray-500 text-sm">Aucun résultat trouvé</p>
                  </div>
                ) : (
                  <div className="py-8 text-center">
                    <Search className="w-12 h-12 text-gray-700 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">Tape au moins 2 caractères</p>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
