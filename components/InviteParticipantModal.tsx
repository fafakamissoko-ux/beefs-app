'use client';

import { useCallback, useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Search, UserPlus, Check } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

interface SearchUser {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface InviteParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInvite: (userId: string) => void;
  currentParticipants: string[];
}

function escapeIlikePattern(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

export function InviteParticipantModal({
  isOpen,
  onClose,
  onInvite,
  currentParticipants,
}: InviteParticipantModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [results, setResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const runSearch = useCallback(async () => {
    const q = debouncedQuery.trim();
    if (!q) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    try {
      const pattern = `%${escapeIlikePattern(q)}%`;
      const { data, error } = await supabase
        .from('users')
        .select('id, username, display_name, avatar_url')
        .or(
          `username.ilike.${pattern},display_name.ilike.${pattern}`
        )
        .limit(25);

      if (error) throw error;

      const rows = (data ?? []) as SearchUser[];
      const filtered = rows.filter(
        (u) =>
          !currentParticipants.includes(u.id) && u.id !== user?.id
      );
      setResults(filtered);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [debouncedQuery, currentParticipants, user?.id]);

  useEffect(() => {
    if (!isOpen) return;
    runSearch();
  }, [isOpen, runSearch]);

  const handleInvite = (userId: string) => {
    if (!invitedUsers.includes(userId)) {
      setInvitedUsers([...invitedUsers, userId]);
      onInvite(userId);

      setTimeout(() => {
        onClose();
        setInvitedUsers([]);
        setSearchQuery('');
        setDebouncedQuery('');
        setResults([]);
      }, 1000);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-2xl p-6 max-w-md w-full border-2 border-orange-500/50 shadow-2xl max-h-[80vh] overflow-hidden flex flex-col"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-black text-white flex items-center gap-2">
              <UserPlus className="w-6 h-6 text-orange-500" />
              Inviter sur le ring
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          <p className="text-gray-400 text-sm mb-4">
            Invite un témoin ou une personne impliquée à monter sur le ring pour
            s&apos;exprimer.
          </p>

          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Rechercher un utilisateur..."
              className="w-full bg-black/40 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 mb-4 min-h-[120px]">
            {!debouncedQuery.trim() ? (
              <div className="text-center py-8">
                <p className="text-gray-500">
                  Tape un nom ou un @pseudo pour rechercher
                </p>
              </div>
            ) : searching ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Recherche…</p>
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-500">Aucun utilisateur trouvé</p>
              </div>
            ) : (
              results.map((u) => {
                const isInvited = invitedUsers.includes(u.id);
                const label = u.display_name?.trim() || u.username;

                return (
                  <motion.button
                    key={u.id}
                    type="button"
                    onClick={() => handleInvite(u.id)}
                    disabled={isInvited}
                    whileHover={!isInvited ? { scale: 1.02 } : {}}
                    whileTap={!isInvited ? { scale: 0.98 } : {}}
                    className={`w-full p-4 rounded-xl border-2 transition-all flex items-center justify-between ${
                      isInvited
                        ? 'bg-green-500/20 border-green-500 cursor-not-allowed'
                        : 'bg-black/40 border-gray-700 hover:border-orange-500'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative shrink-0">
                        {u.avatar_url ? (
                          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full">
                            <Image src={u.avatar_url} alt="" fill className="object-cover" sizes="48px" />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-lg font-bold text-white">
                            {label.slice(0, 1).toUpperCase()}
                          </div>
                        )}
                      </div>

                      <div className="text-left min-w-0">
                        <p className="text-white font-bold truncate">
                          {label}
                        </p>
                        <p className="text-gray-400 text-sm truncate">
                          @{u.username}
                        </p>
                      </div>
                    </div>

                    {isInvited ? (
                      <div className="flex items-center gap-2 text-green-400 font-bold text-sm shrink-0">
                        <Check className="w-5 h-5" />
                        Invité
                      </div>
                    ) : (
                      <UserPlus className="w-5 h-5 text-orange-500 shrink-0" />
                    )}
                  </motion.button>
                );
              })
            )}
          </div>

          <div className="p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <p className="text-orange-400 text-xs">
              💡 <strong>Astuce:</strong> La personne invitée recevra une
              notification et pourra accepter ou refuser de monter sur le ring.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
