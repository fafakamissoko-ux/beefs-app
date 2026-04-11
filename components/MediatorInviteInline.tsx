'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Search, UserPlus, Check, Loader2, AlertCircle } from 'lucide-react';
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

function normalizeSearchQuery(raw: string): string {
  return raw.trim().replace(/^@+/u, '');
}

function mergeUserRows(
  a: MediatorInviteSearchUser[],
  b: MediatorInviteSearchUser[],
): MediatorInviteSearchUser[] {
  const seen = new Set<string>();
  const out: MediatorInviteSearchUser[] = [];
  for (const row of [...a, ...b]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
    if (out.length >= 25) break;
  }
  return out;
}

type MediatorInviteInlineProps = {
  excludeParticipantIds: string[];
  currentUserId: string | null | undefined;
  onInvite: (userId: string) => void | Promise<void>;
};

type SearchPhase = 'idle' | 'debouncing' | 'loading' | 'results' | 'empty' | 'error';

export function MediatorInviteInline({
  excludeParticipantIds,
  currentUserId,
  onInvite,
}: MediatorInviteInlineProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [invitedUsers, setInvitedUsers] = useState<string[]>([]);
  const [results, setResults] = useState<MediatorInviteSearchUser[]>([]);
  const [phase, setPhase] = useState<SearchPhase>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const requestSeq = useRef(0);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(searchQuery), 160);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const normalizedTyping = normalizeSearchQuery(searchQuery);
  const normalizedDebounced = normalizeSearchQuery(debouncedQuery);
  const isDebouncing =
    normalizedTyping.length > 0 && normalizedTyping !== normalizedDebounced;

  const runSearch = useCallback(async () => {
    const q = normalizeSearchQuery(debouncedQuery);
    if (!q) {
      requestSeq.current += 1;
      setResults([]);
      setPhase('idle');
      setErrorMessage(null);
      return;
    }

    const seq = ++requestSeq.current;
    setPhase('loading');
    setErrorMessage(null);

    const pattern = `%${escapeIlikePattern(q)}%`;

    try {
      const [byUsername, byDisplayName] = await Promise.all([
        supabase
          .from('users')
          .select('id, username, display_name, avatar_url')
          .ilike('username', pattern)
          .limit(20),
        supabase
          .from('users')
          .select('id, username, display_name, avatar_url')
          .ilike('display_name', pattern)
          .limit(20),
      ]);

      if (seq !== requestSeq.current) return;

      const err = byUsername.error || byDisplayName.error;
      if (err) {
        console.warn('[MediatorInvite] search users:', err.message, err);
        setResults([]);
        setPhase('error');
        setErrorMessage(
          'Les suggestions ne sont pas disponibles pour le moment. Vérifie ta connexion et réessaie.',
        );
        return;
      }

      const ex = new Set(excludeParticipantIds.filter(Boolean));
      const merged = mergeUserRows(
        (byUsername.data ?? []) as MediatorInviteSearchUser[],
        (byDisplayName.data ?? []) as MediatorInviteSearchUser[],
      ).filter((u) => !ex.has(u.id) && u.id !== currentUserId);

      setResults(merged);
      setPhase(merged.length > 0 ? 'results' : 'empty');
    } catch (e) {
      if (seq !== requestSeq.current) return;
      console.warn('[MediatorInvite] search exception:', e);
      setResults([]);
      setPhase('error');
      setErrorMessage('Erreur lors de la recherche. Réessaie dans un instant.');
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
      setPhase('idle');
      setErrorMessage(null);
    }, 900);
  };

  const feedbackLine = (() => {
    if (!normalizedTyping) {
      return 'Commence à taper un @pseudo ou un nom : les suggestions apparaissent ici.';
    }
    if (isDebouncing) {
      return 'Recherche des profils…';
    }
    if (phase === 'loading') {
      return 'Chargement des suggestions…';
    }
    if (phase === 'error' && errorMessage) {
      return errorMessage;
    }
    if (phase === 'empty') {
      return `Aucun profil pour « ${normalizedDebounced} ». Essaie un autre pseudo ou nom.`;
    }
    if (phase === 'results') {
      return `${results.length} suggestion${results.length > 1 ? 's' : ''} — touche une ligne pour inviter.`;
    }
    return null;
  })();

  return (
    <div className="space-y-3 border-t border-white/10 pt-3">
      <p className="font-mono text-[9px] leading-relaxed text-white/50">
        Invite un co-hôte : pseudo (@optionnel) ou nom affiché.
      </p>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="@pseudo ou nom…"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="w-full rounded-2xl border border-white/12 bg-black/40 py-2.5 pl-9 pr-3 font-mono text-[11px] text-white placeholder-white/30 focus:border-cobalt-500/50 focus:outline-none"
        />
      </div>

      <div
        role="status"
        aria-live="polite"
        className="flex min-h-[2.5rem] items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-2.5 py-2 font-mono text-[10px] leading-snug text-white/55"
      >
        {(isDebouncing || phase === 'loading') && (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-cobalt-400" aria-hidden />
        )}
        {phase === 'error' && (
          <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden />
        )}
        <span className="min-w-0 flex-1">{feedbackLine}</span>
      </div>

      <div className="space-y-1.5 pr-0.5">
        {normalizedTyping.length > 0 &&
          !isDebouncing &&
          phase !== 'loading' &&
          phase === 'results' &&
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
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
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
                  <div className="min-w-0 flex-1">
                    <p className="break-words font-mono text-[11px] font-bold leading-tight text-white">
                      {label}
                    </p>
                    <p className="break-all font-mono text-[9px] leading-tight text-cobalt-200/80">
                      @{u.username}
                    </p>
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
          })}
      </div>
    </div>
  );
}
