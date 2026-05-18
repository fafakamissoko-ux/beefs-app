'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { X, Lock } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';

interface AuraGiver {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

interface AuraGiversModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
}

export const AuraGiversModal: React.FC<AuraGiversModalProps> = ({ isOpen, onClose, targetId }) => {
  const router = useRouter();
  const [givers, setGivers] = useState<AuraGiver[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    async function load() {
      setIsLoading(true);

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (cancelled) return;

      setCurrentUser(session?.user?.id || null);

      if (session?.user?.id) {
        const { data } = await supabase.rpc('get_profile_aura_givers', { p_target_id: targetId });
        if (!cancelled) {
          setGivers((data as AuraGiver[] | null) || []);
        }
      } else {
        setGivers([]);
      }

      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen, targetId]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="aura-givers-title"
      >
        <div className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-xl text-prestige-gold" aria-hidden>
              ✦
            </span>
            <h3 id="aura-givers-title" className="text-base font-black uppercase tracking-wider text-white">
              Donateurs d&apos;Aura
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto p-5">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              <p className="text-sm font-bold text-cyan-400">Déchiffrement de l&apos;Aura...</p>
            </div>
          ) : !currentUser ? (
            <div className="py-8 text-center">
              <Lock className="mx-auto mb-3 h-10 w-10 text-white/30" />
              <p className="text-sm text-gray-400">L&apos;identité des donateurs est protégée.</p>
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="mt-4 w-full rounded-xl bg-white py-3 text-sm font-black uppercase text-black transition-colors hover:bg-gray-200"
              >
                Rejoindre l&apos;Agora
              </button>
            </div>
          ) : givers.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Personne n&apos;a encore envoyé d&apos;Aura.
            </p>
          ) : (
            <>
              {givers.map((giver) => (
                <div
                  key={giver.giver_id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {giver.avatar_url ? (
                      <img
                        src={giver.avatar_url}
                        alt=""
                        className="h-10 w-10 flex-shrink-0 rounded-full border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/20 to-slate-800 text-xs font-bold uppercase text-cyan-400">
                        {giver.display_name?.[0] || giver.username?.[0] || '?'}
                      </div>
                    )}
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-bold text-white">{giver.display_name}</span>
                      <span className="truncate text-xs text-cyan-400">@{giver.username}</span>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="flex-shrink-0 rounded-full bg-white/10 px-4 py-1.5 text-xs font-bold text-white transition-all hover:bg-white hover:text-black active:scale-95"
                  >
                    Suivre
                  </button>
                </div>
              ))}
              {currentUser !== targetId && givers.length === 7 && (
                <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Seul le propriétaire du profil peut voir la liste complète.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};