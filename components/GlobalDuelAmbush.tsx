'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Zap, X, ShieldAlert, Clock, Send, MessageSquareWarning } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';
import { sanitizeMessage } from '@/lib/security';
import { useToast } from '@/components/Toast';

interface AmbushData {
  id: string;
  beef_id: string;
  inviter_id: string;
  inviter_display_name: string;
  beef_title: string;
  status: string;
  scheduled_at: string | null;
}

type ActionState = 'join' | 'later' | 'decline';

type InvitationRow = {
  id: string;
  beef_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
};

export function GlobalDuelAmbush() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();

  const [ambush, setAmbush] = useState<AmbushData | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isResponding, setIsResponding] = useState(false);

  const [pendingAction, setPendingAction] = useState<ActionState | null>(null);
  const [responseMessage, setResponseMessage] = useState('');

  const isInArena = pathname?.startsWith('/arena/');

  useEffect(() => {
    if (!ambush || pendingAction) return;
    if (timeLeft <= 0) {
      setAmbush(null);
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [ambush, timeLeft, pendingAction]);

  useEffect(() => {
    if (!user || isInArena) return;

    const channel = supabase
      .channel(`ambush_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'beef_invitations',
          filter: `invitee_id=eq.${user.id}`,
        },
        async (payload) => {
          const inv = payload.new as InvitationRow;
          if (!inv || inv.status !== 'sent') return;

          if (payload.eventType === 'UPDATE') {
            const old = payload.old as { status?: string } | null;
            if (old?.status === 'sent') return;
          }

          const { data: beef } = await supabase
            .from('beefs')
            .select('title, status, scheduled_at')
            .eq('id', inv.beef_id)
            .single();
          if (!beef) return;

          const pubMap = await fetchUserPublicByIds(supabase, [inv.inviter_id], 'id, display_name, username');
          const inviter = pubMap.get(inv.inviter_id);

          setAmbush({
            id: inv.id,
            beef_id: inv.beef_id,
            inviter_id: inv.inviter_id,
            inviter_display_name: displayNameFromPublicRow(inviter, 'Un adversaire'),
            beef_title: beef.title,
            status: beef.status,
            scheduled_at: beef.scheduled_at,
          });
          setTimeLeft(30);
          setPendingAction(null);
          setResponseMessage('');
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, isInArena]);

  const executeResponse = useCallback(
    async (action: ActionState, message?: string) => {
      if (!ambush || !user) return;
      setIsResponding(true);

      try {
        const invStatus = action === 'join' ? 'accepted' : action === 'later' ? 'seen' : 'declined';
        const partStatus = action === 'join' ? 'accepted' : action === 'decline' ? 'declined' : null;

        const { error: invError } = await supabase
          .from('beef_invitations')
          .update({
            status: invStatus,
            responded_at: action !== 'later' ? new Date().toISOString() : null,
            ...(action === 'later' ? { seen_at: new Date().toISOString() } : {}),
          })
          .eq('id', ambush.id);
        if (invError) throw invError;

        if (partStatus) {
          const { error: partError } = await supabase
            .from('beef_participants')
            .update({
              invite_status: partStatus,
              responded_at: new Date().toISOString(),
            })
            .eq('beef_id', ambush.beef_id)
            .eq('user_id', user.id);
          if (partError) throw partError;
        }

        if (message !== undefined && message.trim().length > 0) {
          const prefix = action === 'later' ? '[Mise en attente du défi]' : '[A décliné le défi]';
          const raw = `${prefix} ${message.trim()}`;
          const content = sanitizeMessage(raw);
          if (content) {
            const { data: convId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
              user_a: user.id,
              user_b: ambush.inviter_id,
            });
            if (!rpcErr && convId != null) {
              const { error: dmErr } = await supabase.from('direct_messages').insert({
                conversation_id: String(convId),
                sender_id: user.id,
                content,
              });
              if (dmErr) console.error('Erreur envoi DM embuscade:', dmErr);
            }
          }
        }

        if (action === 'join') {
          const isScheduledForLater =
            Boolean(ambush.scheduled_at) &&
            new Date(ambush.scheduled_at!).getTime() > Date.now() + 5 * 60_000 &&
            ambush.status !== 'live';

          if (isScheduledForLater && ambush.scheduled_at) {
            const dateStr = new Date(ambush.scheduled_at).toLocaleDateString('fr-FR', {
              weekday: 'long',
              hour: '2-digit',
              minute: '2-digit',
            });
            toast(`Défi relevé ! Programmé pour ${dateStr}`, 'success');
          } else {
            router.push(`/arena/${ambush.beef_id}`);
          }
        }

        setAmbush(null);
        setPendingAction(null);
        setResponseMessage('');

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
        }
      } catch (err) {
        console.error('Erreur réponse embuscade:', err);
      } finally {
        setIsResponding(false);
      }
    },
    [ambush, user, router, toast]
  );

  if (!ambush) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-xl"
      >
        <motion.div
          animate={{ opacity: pendingAction ? 0.1 : [0.3, 0.6, 0.3] }}
          transition={pendingAction ? { duration: 0 } : { duration: 1, repeat: Infinity }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-plasma-900/40 via-transparent to-transparent"
        />

        <motion.div
          initial={{ scale: 0.9, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A0A0A] p-6 text-center shadow-2xl md:p-8"
        >
          {!pendingAction && (
            <div className="absolute left-0 top-0 h-1.5 w-full bg-white/5">
              <motion.div
                key={ambush.id}
                initial={{ width: '100%' }}
                animate={{ width: '0%' }}
                transition={{ duration: 30, ease: 'linear' }}
                className="h-full bg-plasma-500"
              />
            </div>
          )}

          {!pendingAction ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-6 flex justify-center">
                <div className="flex h-20 w-20 items-center justify-center rounded-full border border-plasma-500/20 bg-plasma-500/10">
                  <Swords className="h-10 w-10 animate-pulse text-plasma-500" />
                </div>
              </div>

              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-black uppercase tracking-widest text-white/70">
                <ShieldAlert className="h-4 w-4 text-plasma-500" /> Nouveau Défi Reçu
              </div>

              <h2 className="mt-4 text-3xl font-black text-white">
                <span className="text-plasma-400">{ambush.inviter_display_name}</span> te convoque&nbsp;!
              </h2>
              <p className="mt-2 text-lg font-semibold text-white/60">&ldquo;{ambush.beef_title}&rdquo;</p>

              {ambush.scheduled_at &&
                new Date(ambush.scheduled_at).getTime() > Date.now() + 5 * 60_000 && (
                  <div className="mt-4 inline-block rounded-xl border border-plasma-500/30 bg-plasma-500/10 px-4 py-2">
                    <p className="text-sm font-bold text-plasma-400">
                      🗓️ Programmé le{' '}
                      {new Date(ambush.scheduled_at).toLocaleDateString('fr-FR', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                )}

              <div className="my-6 font-mono text-5xl font-black text-white/90">
                00:{timeLeft.toString().padStart(2, '0')}
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void executeResponse('join')}
                  disabled={isResponding}
                  className="group relative w-full overflow-hidden rounded-2xl bg-plasma-500 px-6 py-4 font-black text-white transition-all hover:scale-[1.02] hover:bg-plasma-400 active:scale-95 disabled:opacity-50"
                >
                  <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                    <Zap className="h-5 w-5" /> REJOINDRE MAINTENANT
                  </div>
                </button>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingAction('later')}
                    disabled={isResponding}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                  >
                    <Clock className="h-4 w-4" /> Plus tard
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAction('decline')}
                    disabled={isResponding}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-bold text-red-500 transition-all hover:bg-red-500/20 active:scale-95"
                  >
                    <X className="h-4 w-4" /> Refuser
                  </button>
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
              <div className="mb-6 flex justify-center">
                <MessageSquareWarning className={`h-12 w-12 ${pendingAction === 'later' ? 'text-white' : 'text-red-500'}`} />
              </div>
              <h3 className="mb-2 text-xl font-black text-white">
                {pendingAction === 'later' ? "J'accepte, mais pour plus tard." : 'Je refuse ce défi.'}
              </h3>
              <p className="mb-6 text-sm text-white/50">Laisse un message à {ambush.inviter_display_name} (optionnel)</p>

              <textarea
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
                placeholder="Ex: Je finis mon live et j'arrive..."
                className="mb-6 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-white placeholder:text-white/30 focus:border-plasma-500 focus:outline-none focus:ring-1 focus:ring-plasma-500"
                rows={3}
                autoFocus
              />

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setPendingAction(null)}
                  disabled={isResponding}
                  className="flex-1 rounded-xl bg-white/10 py-3 font-bold text-white hover:bg-white/20 disabled:opacity-50"
                >
                  Retour
                </button>
                <button
                  type="button"
                  onClick={() => void executeResponse(pendingAction, responseMessage)}
                  disabled={isResponding}
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:opacity-50 ${pendingAction === 'later' ? 'bg-plasma-500 hover:bg-plasma-400' : 'bg-red-500 hover:bg-red-400'}`}
                >
                  <Send className="h-4 w-4" /> Confirmer
                </button>
              </div>
            </motion.div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
