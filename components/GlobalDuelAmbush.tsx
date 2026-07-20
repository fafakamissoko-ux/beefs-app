'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Zap, X, ShieldAlert, Clock, Send, MessageSquareWarning, CalendarCheck, Scale, Gavel } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';
import { sanitizeMessage } from '@/lib/security';
import { useToast } from '@/components/Toast';

type InviteType = 'combatant' | 'ref_request' | 'ref_offer';

interface AmbushData {
  id: string;
  beef_id: string;
  inviter_id: string;
  inviter_display_name: string;
  beef_title: string;
  status: string;
  scheduled_at: string | null;
  mediator_id: string | null;
  invite_type: InviteType;
}

type ActionState = 'join' | 'later' | 'decline';

type InvitationRow = {
  id: string;
  beef_id: string;
  inviter_id: string;
  invitee_id: string;
  status: string;
  invite_type?: InviteType;
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
            .select('title, status, scheduled_at, mediator_id')
            .eq('id', inv.beef_id)
            .single();
          if (!beef) return;

          const pubMap = await fetchUserPublicByIds(supabase, [inv.inviter_id], 'id, display_name, username');
          const inviter = pubMap.get(inv.inviter_id);

          setAmbush({
            id: inv.id,
            beef_id: inv.beef_id,
            inviter_id: inv.inviter_id,
            inviter_display_name: displayNameFromPublicRow(inviter, 'Un utilisateur'),
            beef_title: beef.title,
            status: beef.status,
            scheduled_at: beef.scheduled_at,
            mediator_id: beef.mediator_id,
            invite_type: inv.invite_type ?? 'combatant',
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

        // Note pour plus tard : Il faudra aussi gérer l'insertion dans beef_participants
        // avec le bon rôle (mediator ou participant) selon ambush.invite_type
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
          const prefix = action === 'later' ? '[BEEF_RESPONSE:LATER]' : '[BEEF_RESPONSE:DECLINE]';
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
              if (!dmErr) {
                await supabase.from('conversations').update({
                  last_message_text: content,
                  last_message_at: new Date().toISOString(),
                }).eq('id', String(convId));
              }
            }
          }
        }

        if (action === 'join') {
          const isScheduledForLater =
            Boolean(ambush.scheduled_at) &&
            new Date(ambush.scheduled_at!).getTime() > Date.now() + 5 * 60_000 &&
            ambush.status !== 'live';

          const hasRef = Boolean(ambush.mediator_id);

          if (isScheduledForLater || !hasRef) {
            const dateStr = ambush.scheduled_at
              ? new Date(ambush.scheduled_at).toLocaleDateString('fr-FR', {
                  weekday: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : "dès qu'un Arbitre sera trouvé";

            let toastMsg = `Défi relevé ! Programmé pour ${dateStr}`;
            if (ambush.invite_type === 'ref_request') toastMsg = `Arbitrage accepté !`;
            if (ambush.invite_type === 'ref_offer') toastMsg = `Ref accepté !`;

            toast(toastMsg, 'success');
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

  const isScheduledForLater =
    Boolean(ambush.scheduled_at) &&
    new Date(ambush.scheduled_at!).getTime() > Date.now() + 5 * 60_000 &&
    ambush.status !== 'live';

  const hasRef = Boolean(ambush.mediator_id);

  const isRefRequest = ambush.invite_type === 'ref_request';
  const isRefOffer = ambush.invite_type === 'ref_offer';
  const isMediationConvo = ambush.invite_type === 'combatant' && ambush.mediator_id === ambush.inviter_id;

  let MainIcon = Swords;
  let themeColor = 'cyan';

  if (isRefRequest || isRefOffer) {
    MainIcon = Scale;
    themeColor = 'yellow';
  } else if (isMediationConvo) {
    MainIcon = Gavel;
    themeColor = 'brand';
  }

  let ambushTitle = (
    <>
      <span className="text-cyan-400">{ambush.inviter_display_name}</span> te défie !
    </>
  );
  if (isRefRequest)
    ambushTitle = (
      <>
        <span className="text-yellow-500">{ambush.inviter_display_name}</span> réclame ton arbitrage !
      </>
    );
  if (isRefOffer)
    ambushTitle = (
      <>
        <span className="text-yellow-500">{ambush.inviter_display_name}</span> propose d&apos;arbitrer ton conflit !
      </>
    );
  if (isMediationConvo)
    ambushTitle = (
      <>
        Le Ref <span className="text-brand-400">{ambush.inviter_display_name}</span> te convoque au tribunal !
      </>
    );

  let buttonText = "REJOINDRE L'AGORA";
  let ButtonIcon = Zap;

  if (hasRef && !isScheduledForLater && ambush.invite_type === 'combatant') {
    buttonText = "REJOINDRE L'ARÈNE";
  } else if (isScheduledForLater && ambush.invite_type === 'combatant') {
    buttonText = 'ACCEPTER LE DÉFI';
    ButtonIcon = CalendarCheck;
  }

  if (isRefRequest) {
    buttonText = 'PRENDRE LE SIFFLET';
    ButtonIcon = Scale;
  } else if (isRefOffer) {
    buttonText = "ACCEPTER L'ARBITRE";
    ButtonIcon = Scale;
  } else if (isMediationConvo) {
    buttonText = isScheduledForLater ? 'ACCEPTER LA CONVOCATION' : 'COMPARAÎTRE';
    ButtonIcon = isScheduledForLater ? CalendarCheck : Gavel;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] flex flex-col items-center justify-center bg-black/60 p-4 backdrop-blur-md"
      >
        <motion.div
          animate={{ opacity: pendingAction ? 0.1 : [0.3, 0.6, 0.3] }}
          transition={pendingAction ? { duration: 0 } : { duration: 1, repeat: Infinity }}
          className={`pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] ${themeColor === 'yellow' ? 'from-yellow-900/40' : themeColor === 'brand' ? 'from-brand-900/40' : 'from-cyan-600/20'} via-transparent to-transparent`}
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
                className={`h-full ${themeColor === 'yellow' ? 'bg-yellow-500' : themeColor === 'brand' ? 'bg-brand-500' : 'bg-cyan-500'}`}
              />
            </div>
          )}

          {!pendingAction ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="mb-6 flex justify-center">
                <div
                  className={`flex h-20 w-20 items-center justify-center rounded-full border ${themeColor === 'yellow' ? 'border-yellow-500/20 bg-yellow-500/10' : themeColor === 'brand' ? 'border-brand-500/20 bg-brand-500/10' : 'border-cyan-500/20 bg-cyan-500/10'}`}
                >
                  <MainIcon
                    className={`h-10 w-10 animate-pulse ${themeColor === 'yellow' ? 'text-yellow-500' : themeColor === 'brand' ? 'text-brand-500' : 'text-cyan-500'}`}
                  />
                </div>
              </div>

              <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1 text-xs font-black uppercase tracking-widest text-white/70">
                <ShieldAlert
                  className={`h-4 w-4 ${themeColor === 'yellow' ? 'text-yellow-500' : themeColor === 'brand' ? 'text-brand-500' : 'text-cyan-500'}`}
                />
                {isRefRequest
                  ? 'Appel au Jugement'
                  : isRefOffer
                    ? "Proposition d'Arbitrage"
                    : isMediationConvo
                      ? 'Convocation Officielle'
                      : 'Nouveau Défi Reçu'}
              </div>

              <h2 className="mt-4 text-3xl font-black text-white">{ambushTitle}</h2>
              <p className="mt-2 text-lg font-semibold text-white/60">&ldquo;{ambush.beef_title}&rdquo;</p>

              {ambush.scheduled_at &&
                new Date(ambush.scheduled_at).getTime() > Date.now() + 5 * 60_000 && (
                  <div
                    className={`mt-4 inline-block rounded-xl border px-4 py-2 ${themeColor === 'yellow' ? 'border-yellow-500/30 bg-yellow-500/10' : themeColor === 'brand' ? 'border-brand-500/30 bg-brand-500/10' : 'border-cyan-500/30 bg-cyan-500/10'}`}
                  >
                    <p
                      className={`text-sm font-bold ${themeColor === 'yellow' ? 'text-yellow-500' : themeColor === 'brand' ? 'text-brand-400' : 'text-cyan-400'}`}
                    >
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
                  className={`group relative w-full overflow-hidden rounded-2xl px-6 py-4 font-black text-white transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 ${
                    themeColor === 'yellow'
                      ? 'bg-yellow-600 shadow-[0_0_20px_rgba(234,179,8,0.3)] hover:bg-yellow-500'
                      : themeColor === 'brand' || isScheduledForLater || !hasRef
                        ? 'bg-brand-600 shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:bg-brand-500'
                        : 'bg-cyan-500 shadow-[0_0_20px_rgba(0,240,255,0.3)] hover:bg-cyan-400'
                  }`}
                >
                  <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                    <ButtonIcon className="h-5 w-5" /> {buttonText}
                  </div>
                  <div className="pointer-events-none absolute inset-0 z-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                </button>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setPendingAction('later')}
                    disabled={isResponding}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-3 text-sm font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                  >
                    <Clock className="h-4 w-4" /> En attente
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingAction('decline')}
                    disabled={isResponding}
                    className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm font-bold text-red-500 transition-all hover:bg-red-500/20 active:scale-95"
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
                {pendingAction === 'later' ? 'Mise en attente.' : 'Je refuse.'}
              </h3>
              <p className="mb-6 text-sm text-white/50">Laisse un message à {ambush.inviter_display_name} (optionnel)</p>

              <textarea
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
                placeholder="Ex: Je finis mon live et j'arrive..."
                className="mb-6 w-full resize-none rounded-xl border border-white/10 bg-white/5 p-4 text-white placeholder:text-white/30 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
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
                  className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-3 font-bold text-white disabled:opacity-50 ${pendingAction === 'later' ? 'bg-cyan-500 hover:bg-cyan-400' : 'bg-red-500 hover:bg-red-400'}`}
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
