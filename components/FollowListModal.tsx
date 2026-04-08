'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, UserPlus, UserMinus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';

type ListType = 'followers' | 'following';

interface ListedUser {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface FollowListModalProps {
  userId: string;
  type: ListType;
  onClose: () => void;
}

export function FollowListModal({ userId, type, onClose }: FollowListModalProps) {
  const router = useRouter();
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<ListedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [actionId, setActionId] = useState<string | null>(null);

  const title = type === 'followers' ? 'Abonnés' : 'Abonnements';

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      if (type === 'followers') {
        const { data, error } = await supabase
          .from('followers')
          .select(
            'follower_id, users!followers_follower_id_fkey(id, username, display_name, avatar_url)'
          )
          .eq('following_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const list: ListedUser[] = (data || [])
          .map((r: any) => r.users)
          .filter(Boolean)
          .map((u: any) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name || u.username,
            avatar_url: u.avatar_url ?? null,
          }));
        setRows(list);
      } else {
        const { data, error } = await supabase
          .from('followers')
          .select(
            'following_id, users!followers_following_id_fkey(id, username, display_name, avatar_url)'
          )
          .eq('follower_id', userId)
          .order('created_at', { ascending: false });

        if (error) throw error;
        const list: ListedUser[] = (data || [])
          .map((r: any) => r.users)
          .filter(Boolean)
          .map((u: any) => ({
            id: u.id,
            username: u.username,
            display_name: u.display_name || u.username,
            avatar_url: u.avatar_url ?? null,
          }));
        setRows(list);
      }
    } catch (e) {
      console.error('FollowListModal load error:', e);
      toast('Impossible de charger la liste', 'error');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [userId, type, toast]);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    if (!user || rows.length === 0) {
      setFollowingIds(new Set());
      return;
    }
    const ids = rows.map((r) => r.id).filter((id) => id !== user.id);
    if (ids.length === 0) {
      setFollowingIds(new Set());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('followers')
        .select('following_id')
        .eq('follower_id', user.id)
        .in('following_id', ids);
      if (!cancelled) {
        setFollowingIds(new Set((data || []).map((d) => d.following_id)));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, rows]);

  const handleToggleFollow = async (targetId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      router.push('/login');
      return;
    }
    setActionId(targetId);
    try {
      if (followingIds.has(targetId)) {
        const { error } = await supabase
          .from('followers')
          .delete()
          .eq('follower_id', user.id)
          .eq('following_id', targetId);
        if (error) throw error;
        setFollowingIds((prev) => {
          const next = new Set(prev);
          next.delete(targetId);
          return next;
        });
        toast('Vous ne suivez plus cet utilisateur', 'success');
      } else {
        const { error } = await supabase.from('followers').insert({
          follower_id: user.id,
          following_id: targetId,
        });
        if (error) throw error;
        setFollowingIds((prev) => new Set(prev).add(targetId));
        toast('Vous suivez cet utilisateur', 'success');
      }
    } catch (err) {
      console.error(err);
      toast('Erreur lors de l\'action', 'error');
    } finally {
      setActionId(null);
    }
  };

  const goToProfile = (uname: string) => {
    onClose();
    router.push(`/profile/${uname}`);
  };

  return (
    <AnimatePresence>
      <motion.div
        role="presentation"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          role="dialog"
          aria-labelledby="follow-list-title"
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 380, damping: 28 }}
          className="card w-full max-w-md max-h-[min(70vh,520px)] flex flex-col bg-black border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <h2 id="follow-list-title" className="text-lg font-black text-white">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              aria-label="Fermer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loading ? (
              <div className="flex justify-center py-16">
                <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center text-gray-500 text-sm py-12">Aucun compte pour le moment.</p>
            ) : (
              rows.map((u, index) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04, type: 'spring', stiffness: 400, damping: 28 }}
                  className="card flex items-center gap-3 p-3 rounded-xl bg-black border border-white/10 hover:border-white/15 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => goToProfile(u.username)}
                    className="flex flex-1 items-center gap-3 min-w-0 text-left"
                  >
                    <div className="relative w-11 h-11 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-black text-white bg-gradient-to-br from-gray-700 to-gray-900 border border-white/10 overflow-hidden">
                      {u.avatar_url ? (
                        <Image src={u.avatar_url} alt="" fill className="object-cover" sizes="44px" />
                      ) : (
                        (u.display_name || u.username)[0]?.toUpperCase() || '?'
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-white font-semibold text-sm truncate">{u.display_name}</p>
                      <p className="text-gray-500 text-xs truncate">@{u.username}</p>
                    </div>
                  </button>
                  {user && user.id !== u.id && (
                    <button
                      type="button"
                      disabled={actionId === u.id}
                      onClick={(e) => handleToggleFollow(u.id, e)}
                      className={`flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                        followingIds.has(u.id)
                          ? 'bg-white/10 hover:bg-white/15 text-white'
                          : 'brand-gradient text-black hover:opacity-90'
                      } ${actionId === u.id ? 'opacity-60' : ''}`}
                    >
                      {followingIds.has(u.id) ? (
                        <>
                          <UserMinus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Ne plus suivre</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Suivre</span>
                        </>
                      )}
                    </button>
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
