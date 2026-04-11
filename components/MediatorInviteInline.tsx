'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { Search, UserPlus, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabase/client';

export type MediatorInviteSearchUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

function escapeIlikePattern(q: string): string {
  return q.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
}

type MediatorInviteInlineProps = {
  excludeParticipantIds: string[];
  currentUserId: string | null | undefined;
  onInvite: (userId: string) => void | Promise<void>;
};

export function MediatorInviteInline({
  excludeParticipantIds,
  currentUserId,
  onInvite,
}: MediatorInviteInlineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [results, setResults] = useState<MediatorInviteSearchUser[]>([]);
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
        .or(`username.ilike.${pattern},display_name.ilike.${pattern}`)
        .limit(25);

      if (error) throw error;

      const ex = new Set(excludeParticipantIds.filter(Boolean));
      const rows = (data ?? []) as MediatorInviteSearchUser[];
      const filtered = rows.filter(
        (u) => !ex.has(u.id) && u.id !== currentUserId,
      );
      setResults(filtered);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [debouncedQuery, excludeParticipantIds, currentUserId]);

  useEffect(() => {
    void runSearch();
  }, [runSearch]);

  const handleInvite = async (uid: string) => {
    if (invitedUsers.includes(uid)) return;
    setInvitedUsers((prev) => [...prev, uid]);
    await onInvite(uid);
    setTimeout(() => {
      setInvitedUsers((prev) => prev.filter((x) => x !== uid));
      setSearchQuery('');
      setDebouncedQuery('');
      setResults([]);
    }, 900);
  };

  return (
    <div className="mt-1 space-y-3 border-t border-white/10 pt-3">
      <p className="font-mono text-[9px] leading-relaxed text-white/50">
        Invite un co-hôte : recherche par pseudo ou nom affiché.
      </p>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Rechercher…"
          className="w-full rounded-2xl border border-white/12 bg-black/40 py-2.5 pl-9 pr-3 font-mono text-[11px] text-white placeholder-white/30 focus:border-cobalt-500/50 focus:outline-none"
          autoComplete="off"
        />
      </div>

      <div className="max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
        {!debouncedQuery.trim() ? (
          <p className="py-4 text-center font-mono text-[10px] text-white/40">
            Tape un nom ou un @pseudo
          </p>
        ) : searching ? (
          <p className="py-4 text-center font-mono text-[10px] text-white/45">Recherche…</p>
        ) : results.length === 0 ? (
          <p className="py-4 text-center font-mono text-[10px] text-white/45">
            Aucun résultat
          </p>
        ) : (
          results.map((u) => {
            const isInvited = invitedUsers.includes(u.id);
            const label = u.display_name?.trim() || u.username;
            return (
              <motion.button
                key={u.id}
                type="button"
                disabled={isInvited}
                onClick={() => void handleInvite(u.id)}
                whileTap={!isInvited ? { scale: 0.98 } : {}}
                className={`flex w-full items-center justify-between gap-2 rounded-2xl border px-3 py-2.5 text-left transition-colors ${
                  isInvited
                    ? 'cursor-not-allowed border-emerald-500/35 bg-emerald-500/10'
                    : 'border-white/10 bg-white/[0.04] hover:border-cobalt-500/40 hover:bg-cobalt-500/10'
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full">
                    {u.avatar_url ? (
                      <Image
                        src={u.avatar_url}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-purple-500 to-pink-600 font-mono text-xs font-bold text-white">
                        {label.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-mono text-[11px] font-bold text-white">{label}</p>
                    <p className="truncate font-mono text-[9px] text-white/45">@{u.username}</p>
                  </div>
                </div>
                {isInvited ? (
                  <span className="flex shrink-0 items-center gap-1 font-mono text-[9px] font-bold uppercase tracking-wide text-emerald-300">
                    <Check className="h-4 w-4" strokeWidth={2} />
                    Envoyé
                  </span>
                ) : (
                  <UserPlus className="h-4 w-4 shrink-0 text-cobalt-300" strokeWidth={1.5} />
                )}
              </motion.button>
            );
          })
        )}
      </div>
    </div>
  );
}
