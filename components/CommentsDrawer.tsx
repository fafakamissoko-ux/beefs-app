'use client';

import { useCallback, useEffect, useState, Fragment } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles, X } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';

interface CommentUser {
  username: string;
  display_name: string | null;
  avatar_url: string | null;
}

interface BeefComment {
  id: string;
  beef_id: string;
  user_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  users: CommentUser | CommentUser[] | null;
}

interface CommentsDrawerProps {
  beefId: string;
  onClose: () => void;
}

function resolveCommentUser(users: BeefComment['users']): CommentUser | null {
  if (!users) return null;
  return Array.isArray(users) ? users[0] ?? null : users;
}

export function CommentsDrawer({ beefId, onClose }: CommentsDrawerProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [comments, setComments] = useState<BeefComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [likedCommentIds, setLikedCommentIds] = useState<Set<string>>(new Set());
  const [auraLoadingId, setAuraLoadingId] = useState<string | null>(null);
  const [replyingTo, setReplyingTo] = useState<{ commentId: string; username: string } | null>(
    null,
  );

  const fetchComments = useCallback(async () => {
    if (!beefId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('beef_comments')
        .select('*, users(username, display_name, avatar_url)')
        .eq('beef_id', beefId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const rows = (data as BeefComment[] | null) ?? [];
      setComments(rows);

      if (user?.id && rows.length > 0) {
        const commentIds = rows.map((c) => c.id);
        const { data: likes } = await supabase
          .from('beef_comment_likes')
          .select('comment_id')
          .eq('user_id', user.id)
          .in('comment_id', commentIds);

        setLikedCommentIds(
          new Set((likes ?? []).map((l: { comment_id: string }) => l.comment_id)),
        );
      } else {
        setLikedCommentIds(new Set());
      }
    } catch (err) {
      console.error('[CommentsDrawer] fetchComments', err);
      toast('Impossible de charger les commentaires.', 'error');
      setComments([]);
    } finally {
      setLoading(false);
    }
  }, [beefId, user?.id, toast]);

  useEffect(() => {
    void fetchComments();
  }, [fetchComments]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, []);

  const toggleCommentAura = async (commentId: string, authorId: string) => {
    if (!user) {
      toast('Connecte-toi pour donner de l\'Aura.', 'info');
      return;
    }
    if (user.id === authorId) {
      toast('Tu ne peux pas liker ton propre commentaire.', 'info');
      return;
    }
    if (auraLoadingId) return;

    const wasLiked = likedCommentIds.has(commentId);
    setAuraLoadingId(commentId);
    setLikedCommentIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(commentId);
      else next.add(commentId);
      return next;
    });

    try {
      if (wasLiked) {
        const { error } = await supabase
          .from('beef_comment_likes')
          .delete()
          .match({ comment_id: commentId, user_id: user.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('beef_comment_likes').insert({
          comment_id: commentId,
          user_id: user.id,
        });
        if (error) throw error;
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('aura-refresh', { detail: { targetId: commentId } }),
        );
      }
    } catch (err) {
      console.error('[CommentsDrawer] toggleCommentAura', err);
      toast('Impossible de mettre à jour l\'Aura.', 'error');
      setLikedCommentIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(commentId);
        else next.delete(commentId);
        return next;
      });
    } finally {
      setAuraLoadingId(null);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!user) {
      toast('Connecte-toi pour commenter.', 'info');
      return;
    }

    setSending(true);
    try {
      const { error } = await supabase.from('beef_comments').insert({
        beef_id: beefId,
        user_id: user.id,
        content: text,
        parent_id: replyingTo?.commentId ?? null,
      });
      if (error) throw error;
      setDraft('');
      setReplyingTo(null);
      await fetchComments();
    } catch (err) {
      console.error('[CommentsDrawer] handleSend', err);
      toast('Impossible d\'envoyer le commentaire.', 'error');
    } finally {
      setSending(false);
    }
  };

  const rootComments = comments.filter((c) => c.parent_id == null);
  const repliesByParent = comments.reduce<Map<string, BeefComment[]>>((acc, c) => {
    if (c.parent_id) {
      const list = acc.get(c.parent_id) ?? [];
      list.push(c);
      acc.set(c.parent_id, list);
    }
    return acc;
  }, new Map());

  const renderComment = (comment: BeefComment, isReply: boolean) => {
    const author = resolveCommentUser(comment.users);
    const displayName = author?.display_name || author?.username || 'Anonyme';
    const username = author?.username || 'user';
    const liked = likedCommentIds.has(comment.id);
    const isOwn = user?.id === comment.user_id;
    const replyTargetId = comment.parent_id ?? comment.id;

    return (
      <li
        key={comment.id}
        className={`rounded-2xl border border-white/10 bg-slate-900/40 p-3 backdrop-blur-sm ${
          isReply ? 'ml-8 border-l-2 border-l-white/10 pl-4' : ''
        }`}
      >
        <div className="mb-2 flex items-start gap-2.5">
          {author?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={author.avatar_url}
              alt=""
              className="h-9 w-9 shrink-0 rounded-full border border-white/10 object-cover"
            />
          ) : (
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-cyan-500/30 to-slate-800 text-xs font-bold uppercase text-cyan-300">
              {displayName[0] || '?'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-white">{displayName}</p>
            <p className="text-xs text-gray-500">@{username}</p>
          </div>
        </div>
        <p className="mb-3 whitespace-pre-wrap text-sm leading-relaxed text-gray-200">
          {comment.content}
        </p>
        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleCommentAura(comment.id, comment.user_id)}
            disabled={auraLoadingId === comment.id || isOwn}
            aria-label={liked ? "Retirer l'Aura" : "Donner de l'Aura"}
            className={`flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 transition-colors hover:bg-white/10 disabled:opacity-45 ${
              liked && !isOwn ? 'border-amber-400/50 text-amber-400' : 'text-white'
            }`}
          >
            <Sparkles
              className={`h-3.5 w-3.5 ${liked && !isOwn ? 'fill-amber-400 text-amber-400' : ''}`}
            />
          </button>
          <InlineAuraGivers
            targetId={comment.id}
            type="comment"
            ownerId={comment.user_id}
          />
        </div>
        <button
          type="button"
          onClick={() => setReplyingTo({ commentId: replyTargetId, username })}
          className="text-xs font-semibold text-gray-400 transition-colors hover:text-gray-200"
        >
          Répondre
        </button>
      </li>
    );
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/60"
        onClick={onClose}
        aria-hidden
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="fixed inset-x-0 bottom-0 z-50 flex h-[80vh] w-full flex-col rounded-t-3xl border-t border-white/10 bg-slate-950"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Commentaires"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 className="font-sans text-sm font-black uppercase tracking-widest text-white">
            Commentaires
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white" />
            </div>
          ) : comments.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              Aucun commentaire pour le moment. Sois le premier.
            </p>
          ) : (
            <ul className="space-y-4">
              {rootComments.map((comment) => (
                <Fragment key={comment.id}>
                  {renderComment(comment, false)}
                  {(repliesByParent.get(comment.id) ?? []).map((reply) =>
                    renderComment(reply, true),
                  )}
                </Fragment>
              ))}
            </ul>
          )}
        </div>

        <div className="sticky bottom-0 shrink-0 border-t border-white/10 bg-slate-950 p-4">
          {replyingTo && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-slate-900/60 px-3 py-2 text-xs text-gray-300">
              <span>
                En réponse à <span className="font-semibold text-white">@{replyingTo.username}</span>
              </span>
              <button
                type="button"
                onClick={() => setReplyingTo(null)}
                className="rounded-full p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Annuler la réponse"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder={
                user
                  ? replyingTo
                    ? `Répondre à @${replyingTo.username}…`
                    : 'Écrire un commentaire…'
                  : 'Connecte-toi pour commenter'
              }
              disabled={!user || sending}
              className="flex-1 rounded-xl border border-white/10 bg-slate-900/60 px-4 py-2.5 text-sm text-white placeholder:text-gray-500 focus:border-white/20 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!user || sending || !draft.trim()}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white transition-colors hover:bg-brand-400 disabled:opacity-45"
              aria-label="Envoyer"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  );
}
