'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lock } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

interface AuraGiver {
  giver_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  created_at: string;
}

interface BeefViewerRow {
  viewer_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  viewed_at: string;
}

type AuraGiversQueryData = {
  givers: AuraGiver[];
  currentUserId: string | null;
};

interface AuraGiversModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  type: 'profile' | 'beef' | 'teaser' | 'avatar' | 'banner' | 'views';
  ownerId: string;
}

export const AuraGiversModal: React.FC<AuraGiversModalProps> = ({
  isOpen,
  onClose,
  targetId,
  type,
  ownerId,
}) => {
  const router = useRouter();

  const { data, isLoading: loading } = useQuery({
    queryKey: ['aura-givers', targetId, type],
    enabled: isOpen && !!targetId,
    queryFn: async (): Promise<AuraGiversQueryData> => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const currentUserId = session?.user?.id ?? null;

      if (!currentUserId) {
        return { givers: [], currentUserId: null };
      }

      if (type === 'views') {
        const { data: viewerRows } = await supabase.rpc('get_beef_viewers', {
          p_beef_id: targetId,
          p_owner_id: ownerId,
        });
        const rows = (viewerRows as BeefViewerRow[] | null) || [];
        const givers: AuraGiver[] = rows.map((v) => ({
          giver_id: v.viewer_id,
          display_name: v.display_name,
          username: v.username,
          avatar_url: v.avatar_url,
          created_at: v.viewed_at,
        }));
        return { givers, currentUserId };
      }

      const { data: auraRows } = await supabase.rpc('get_universal_aura_givers', {
        p_target_id: targetId,
        p_type: type,
        p_owner_id: ownerId,
      });

      return {
        givers: (auraRows as AuraGiver[] | null) || [],
        currentUserId,
      };
    },
  });

  const items = data?.givers ?? [];
  const currentUser = data?.currentUserId ?? null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={onClose}
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/80 shadow-2xl backdrop-blur-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="aura-givers-title"
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
        <div className="flex items-center justify-between border-b border-white/5 p-5">
          <div className="flex items-center gap-2">
            <span className="animate-pulse text-xl text-prestige-gold" aria-hidden>
              ✦
            </span>
            <h3 id="aura-givers-title" className="text-base font-black uppercase tracking-wider text-white">
              {type === 'views' ? 'CITOYENS' : 'AURA'}
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

        <div className="hide-scrollbar flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent" />
              <p className="text-sm font-bold text-cyan-400">Déchiffrement de l&apos;Aura...</p>
            </div>
          ) : !currentUser ? (
            /* ÉTAT ANONYME (CADENAS SPATIAL OS) */
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] shadow-[0_0_30px_rgba(255,255,255,0.05)]">
                <Lock className="h-8 w-8 text-white/40" strokeWidth={1.5} />
              </div>
              <h4 className="mb-2 text-lg font-black text-white">L&apos;élite de l&apos;Agora</h4>
              <p className="mb-8 text-sm text-gray-400">
                Rejoignez la plateforme pour voir l&apos;identité des donateurs.
              </p>
              <button
                type="button"
                onClick={() => router.push('/signup')}
                className="w-full max-w-[200px] rounded-xl bg-white py-3.5 text-xs font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(255,255,255,0.3)] transition-all hover:scale-105 active:scale-95"
              >
                Rejoindre l&apos;Agora
              </button>
            </div>
          ) : items.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              {type === 'views' ? 'Aucun spectateur enregistré.' : "Personne n'a encore envoyé d'Aura."}
            </p>
          ) : (
            <>
              {items.map((giver) => (
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
              {currentUser !== ownerId && items.length === 7 && (
                <p className="mt-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/40">
                  Seul le propriétaire peut voir la liste complète.
                </p>
              )}
            </>
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
