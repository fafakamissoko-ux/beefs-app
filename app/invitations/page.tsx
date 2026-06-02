'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, X, Zap, Timer, Flame, ShieldX } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

interface Invitation {
  id: string;
  created_at: string;
  beef_id: string;
  inviter_id: string;
  inviter_username: string;
  inviter_display_name: string;
  personal_message: string | null;
  status: 'sent' | 'seen' | 'accepted' | 'declined' | 'expired';
  expires_at: string;
  beef: {
    title: string;
    subject: string;
    description: string;
    mediator_display_name: string;
    status?: string;
    scheduled_at?: string | null;
    aura_score: number;
  };
}

// Composant Chronomètre Temps Réel
function CountdownTimer({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>('Calcul...');
  const [isUrgent, setIsUrgent] = useState(false);
  const onExpireRef = useRef(onExpire);
  const didFireRef = useRef(false);
  onExpireRef.current = onExpire;

  useEffect(() => {
    didFireRef.current = false;
  }, [expiresAt]);

  useEffect(() => {
    const updateTimer = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('EXPIRÉ');
        if (!didFireRef.current) {
          didFireRef.current = true;
          onExpireRef.current();
        }
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / 1000 / 60) % 60);
      const s = Math.floor((diff / 1000) % 60);

      if (d > 0) {
        setTimeLeft(`${d}j ${h}h`);
        setIsUrgent(false);
      } else if (h > 0) {
        setTimeLeft(`${h}h ${m}m`);
        setIsUrgent(false);
      } else {
        setTimeLeft(`${m}m ${s}s`);
        setIsUrgent(true); // Urgent sous 1 heure
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [expiresAt]);

  return (
    <span
      className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${isUrgent ? 'animate-pulse bg-orange-500/20 text-orange-400' : 'bg-white/10 text-white/50'}`}
    >
      <Timer className="h-3 w-3" /> EXPIRE DANS : {timeLeft}
    </span>
  );
}

export default function InvitationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);
  const [participantsData, setParticipantsData] = useState<Array<{ beef_id: string; user_id: string }>>([]);
  const [pubOpponentsMap, setPubOpponentsMap] = useState<Map<string, import('@/lib/fetch-user-public-profile').UserPublicProfileRow>>(new Map());

  const loadInvitations = useCallback(async () => {
    if (!user) return;

    try {
      const { data: invs, error } = await supabase
        .from('beef_invitations')
        .select('id, created_at, beef_id, inviter_id, invitee_id, personal_message, status, expires_at')
        .eq('invitee_id', user.id)
        .in('status', ['sent', 'seen'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!invs?.length) {
        setInvitations([]);
        return;
      }

      const now = Date.now();
      const validInvs = [];
      const expiredInvIds: string[] = [];

      // Trier les invitations valides et identifier les expirées
      for (const inv of invs) {
        // Tolérance de +7 jours pour les invitations non programmées pour éviter l'impasse des 24h
        // Sauf si une date spécifique est prévue, on respecte le timer strict.
        if (new Date(inv.expires_at).getTime() > now) {
          validInvs.push(inv);
        } else {
          expiredInvIds.push(inv.id);
        }
      }

      // Nettoyage actif : on informe la DB des expirations silencieuses
      if (expiredInvIds.length > 0) {
        supabase
          .from('beef_invitations')
          .update({ status: 'expired', responded_at: new Date().toISOString() })
          .in('id', expiredInvIds)
          .then(({ error }) => {
            if (error) console.error('Erreur lors du nettoyage des expirations:', error);
          });

        // Synchronisation des participants liés
        // On ne bloque pas le thread principal (fire and forget)
        for (const inv of invs.filter((i) => expiredInvIds.includes(i.id))) {
          supabase
            .from('beef_participants')
            .update({ invite_status: 'expired', responded_at: new Date().toISOString() })
            .eq('beef_id', inv.beef_id)
            .eq('user_id', user.id)
            .then();
        }
      }

      if (!validInvs.length) {
        setInvitations([]);
        return;
      }

      const beefIds = [...new Set(validInvs.map((i) => i.beef_id))];
      const { data: beefRows, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, subject, description, mediator_id, status, scheduled_at')
        .in('id', beefIds);

      if (beefErr) throw beefErr;

      const beefById = new Map((beefRows || []).map((b) => [b.id, b]));
      const inviterIds = [...new Set(validInvs.map((i) => i.inviter_id))];
      const mediatorIds = [
        ...new Set(
          (beefRows || []).map((b) => b.mediator_id).filter((id): id is string => Boolean(id)),
        ),
      ];
      const pubMap = await fetchUserPublicByIds(supabase, [...new Set([...inviterIds, ...mediatorIds])], 'id, username, display_name');

      // --- RÉCUPÉRATION DES VRAIS ADVERSAIRES ---
      const { data: participantsData } = await supabase
        .from('beef_participants')
        .select('beef_id, user_id')
        .in('beef_id', beefIds)
        .eq('is_main', true);

      const opponentIds = [...new Set((participantsData || []).map(p => p.user_id))];
      const opponentsMap = opponentIds.length > 0
        ? await fetchUserPublicByIds(supabase, opponentIds, 'id, display_name, username')
        : new Map<string, import('@/lib/fetch-user-public-profile').UserPublicProfileRow>();
      setParticipantsData(participantsData || []);
      setPubOpponentsMap(opponentsMap);
      // ------------------------------------------

      const formattedInvitations: Invitation[] = [];
      for (const inv of validInvs) {
        const beef = beefById.get(inv.beef_id);
        if (!beef) continue;

        const inviter = pubMap.get(inv.inviter_id);
        const med = beef.mediator_id ? pubMap.get(beef.mediator_id) : undefined;

        formattedInvitations.push({
          id: inv.id,
          created_at: inv.created_at,
          beef_id: inv.beef_id,
          inviter_id: inv.inviter_id,
          inviter_username: inviter?.username ?? 'user',
          inviter_display_name: displayNameFromPublicRow(inviter, inviter?.username ?? 'Utilisateur'),
          personal_message: inv.personal_message,
          status: inv.status as Invitation['status'],
          expires_at: inv.expires_at,
          beef: {
            title: beef.title,
            subject: beef.subject,
            description: beef.description,
            // Remplacement du terme Médiateur par Ref et gestion de l'attente
            mediator_display_name: med ? displayNameFromPublicRow(med, 'Ref') : 'En attente',
            status: beef.status,
            scheduled_at: beef.scheduled_at,
            aura_score: 0, // Prêt à être connecté aux likes pour le glow
          },
        });
      }

      setInvitations(formattedInvitations);

      if (formattedInvitations.length > 0) {
        await supabase
          .from('beef_invitations')
          .update({ status: 'seen', seen_at: new Date().toISOString() })
          .eq('invitee_id', user.id)
          .eq('status', 'sent');
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
        }
      }
    } catch (error) {
      console.error('Error loading invitations:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login');
      return;
    }
    void loadInvitations();
  }, [user, authLoading, router, loadInvitations]);

  const handleResponse = async (
    invitationId: string,
    beefId: string,
    accept: boolean,
    isAutoExpire: boolean = false
  ) => {
    if (respondingTo) return;
    setRespondingTo(invitationId);

    const currentInv = invitations.find((i) => i.id === invitationId);
    const scheduledAt = currentInv?.beef.scheduled_at;
    const isScheduledForLater =
      Boolean(scheduledAt) &&
      new Date(scheduledAt!).getTime() > Date.now() + 5 * 60_000 &&
      currentInv?.beef.status !== 'live';

    if (accept && !isScheduledForLater && !isAutoExpire) {
      setTransitioningTo(beefId);
    }

    try {
      const { error: invError } = await supabase
        .from('beef_invitations')
        .update({
          status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId)
        .eq('beef_id', beefId);
      if (invError) throw invError;

      const { error: partError } = await supabase
        .from('beef_participants')
        .update({
          invite_status: accept ? 'accepted' : isAutoExpire ? 'expired' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('beef_id', beefId)
        .eq('user_id', user?.id);
      if (partError) throw partError;

      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));

      if (accept) {
        if (isScheduledForLater && currentInv?.beef.scheduled_at) {
          const dateStr = new Date(currentInv.beef.scheduled_at).toLocaleDateString('fr-FR', {
            weekday: 'long',
            hour: '2-digit',
            minute: '2-digit',
          });
          toast(`Défi relevé ! Programmé pour ${dateStr}`, 'success');
          setRespondingTo(null);
        } else {
          setTimeout(() => router.push(`/arena/${beefId}`), 600);
        }
      } else {
        if (isAutoExpire) {
          toast('Temps écoulé ! Défi considéré comme fui.', 'error');
        } else {
          toast('Défi esquivé', 'info');
        }
        setRespondingTo(null);
      }
    } catch (error) {
      console.error('Error responding to invitation:', error);
      if (!isAutoExpire) toast('Erreur lors de la réponse', 'error');
      setRespondingTo(null);
      setTransitioningTo(null);
    }
  };

  if (authLoading || !user || loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="font-semibold text-white">Chargement des défis...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20 font-sans">
      <AnimatePresence>
        {transitioningTo && (
          <motion.div
            key="arena-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center backdrop-blur-xl"
          >
            <Swords className="mb-6 h-24 w-24 animate-pulse text-cyan-500" />
            <h2 className="text-3xl font-black uppercase tracking-widest text-white">Entrée dans l&apos;Arène...</h2>
            <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.6 }}
                className="h-full bg-cyan-500 shadow-[0_0_15px_rgba(0,240,255,0.5)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <AppBackButton className="mb-6" />
        <div className="mb-10 text-center md:text-left">
          <h1 className="mb-2 flex items-center justify-center gap-3 text-4xl font-black text-white md:justify-start">
            <Swords className="h-10 w-10 text-cyan-500" />
            CONVOCATIONS
          </h1>
          <p className="text-sm font-semibold uppercase tracking-wider text-white/40">
            {invitations.length === 0
              ? 'La zone est calme.'
              : `${invitations.length} DÉFI${invitations.length > 1 ? 'S' : ''} EN ATTENTE`}
          </p>
        </div>

        {invitations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center rounded-3xl border border-white/5 bg-white/[0.02] p-16 text-center"
          >
            <ShieldX className="mb-6 h-20 w-20 text-white/10" />
            <h3 className="mb-2 text-2xl font-black text-white">Aucun Défi Actuel</h3>
            <p className="mb-8 text-white/40">
              Personne n&apos;a osé te convoquer dans l&apos;arène pour l&apos;instant.
            </p>
            <button
              type="button"
              onClick={() => router.push('/live')}
              className="rounded-full bg-white/10 px-8 py-3.5 font-bold text-white transition-all hover:bg-white/20 active:scale-95"
            >
              Observer les Battles
            </button>
          </motion.div>
        ) : (
          <div className="space-y-6">
            <AnimatePresence>
              {invitations.map((invitation, index) => (
                <motion.div
                  key={invitation.id}
                  initial={{ opacity: 0, y: 20, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                  transition={{ delay: index * 0.05 }}
                  className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-slate-950/60 backdrop-blur-3xl"
                  style={{
                    boxShadow: `0 0 ${15 + (invitation.beef.aura_score || 0) * 2}px rgba(0, 240, 255, ${0.15 + (invitation.beef.aura_score || 0) * 0.05})`,
                  }}
                >
                  <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-cyan-500 via-brand-500 to-cyan-500 opacity-50" />

                  <div className="p-6 md:p-8">
                    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-red-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-500">
                            Défi Reçu
                          </span>
                          <CountdownTimer
                            expiresAt={invitation.expires_at}
                            onExpire={() => handleResponse(invitation.id, invitation.beef_id, false, true)}
                          />
                        </div>
                        <h3 className="text-2xl font-black leading-tight text-white md:text-3xl">
                          {invitation.beef.title}
                        </h3>
                      </div>
                    </div>

                    <div className="mb-6 rounded-2xl border border-white/5 bg-white/5 p-4">
                      <div className="mb-3 flex items-center gap-2">
                        <Flame className="h-5 w-5 text-cyan-400" />
                        <span className="font-bold text-white">{invitation.beef.subject}</span>
                      </div>
                      {invitation.beef.scheduled_at &&
                        new Date(invitation.beef.scheduled_at).getTime() > Date.now() + 5 * 60_000 && (
                          <div className="mb-4 inline-block rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2">
                            <p className="text-sm font-bold text-cyan-400">
                              🗓️ Programmé le{' '}
                              {new Date(invitation.beef.scheduled_at).toLocaleDateString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </p>
                          </div>
                        )}
                      <p className="text-sm leading-relaxed text-white/60">
                        {(() => {
                          const opps = participantsData
                            .filter((p: { beef_id: string; user_id: string }) => p.beef_id === invitation.beef_id && p.user_id !== user?.id)
                            .map((p: { beef_id: string; user_id: string }) => {
                              const u = pubOpponentsMap.get(p.user_id);
                              return displayNameFromPublicRow(u, 'Inconnu');
                            });

                          const label = opps.length > 1 ? 'Opps :' : 'Opp :';
                          const names = opps.length > 0 ? opps.join(', ') : 'En attente';

                          return (
                            <>
                              <span className="font-bold text-white">{label}</span> {names}
                            </>
                          );
                        })()}
                        <br />
                        <span
                          className={`mt-1 inline-block font-bold ${invitation.beef.mediator_display_name === 'En attente' ? 'text-gray-500 italic' : 'text-white'}`}
                        >
                          Ref : {invitation.beef.mediator_display_name}
                        </span>
                      </p>
                    </div>

                    {invitation.personal_message ? (
                      <div className="relative mb-8 pl-4">
                        <div className="absolute left-0 top-0 h-full w-1 rounded-full bg-cyan-500" />
                        <p className="text-sm italic text-white/70">&ldquo;{invitation.personal_message}&rdquo;</p>
                      </div>
                    ) : null}

                    <div className="flex flex-col gap-3 sm:flex-row">
                      <button
                        type="button"
                        onClick={() => handleResponse(invitation.id, invitation.beef_id, true)}
                        disabled={respondingTo === invitation.id}
                        className="group relative flex-1 overflow-hidden rounded-2xl bg-cyan-500 px-6 py-4 font-black text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all hover:scale-[1.02] hover:bg-cyan-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                          <Zap className="h-5 w-5" /> Relever le Défi
                        </div>
                        <div className="pointer-events-none absolute inset-0 z-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleResponse(invitation.id, invitation.beef_id, false)}
                        disabled={respondingTo === invitation.id}
                        className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-white/60 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
                      >
                        <X className="h-5 w-5" /> Esquiver
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
