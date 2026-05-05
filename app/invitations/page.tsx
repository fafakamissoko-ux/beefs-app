'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Check, X, Clock, AlertCircle, Flame, ShieldX, Zap, Timer } from 'lucide-react';
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
    severity: string;
    mediator_display_name: string;
  };
}

export default function InvitationsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [transitioningTo, setTransitioningTo] = useState<string | null>(null);

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

      const beefIds = [...new Set(invs.map((i) => i.beef_id))];
      const { data: beefRows, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, subject, description, severity, mediator_id')
        .in('id', beefIds);

      if (beefErr) throw beefErr;

      const beefById = new Map((beefRows || []).map((b) => [b.id, b]));
      const inviterIds = [...new Set(invs.map((i) => i.inviter_id))];
      const mediatorIds = [
        ...new Set(
          (beefRows || []).map((b) => b.mediator_id).filter((id): id is string => Boolean(id)),
        ),
      ];
      const pubMap = await fetchUserPublicByIds(supabase, [...new Set([...inviterIds, ...mediatorIds])], 'id, username, display_name');

      const formattedInvitations: Invitation[] = [];
      for (const inv of invs) {
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
            severity: beef.severity ?? 'medium',
            mediator_display_name: displayNameFromPublicRow(med, 'Médiateur'),
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

  const handleResponse = async (invitationId: string, beefId: string, accept: boolean) => {
    setRespondingTo(invitationId);

    if (accept) {
      setTransitioningTo(beefId);
    }

    try {
      const { error: invError } = await supabase
        .from('beef_invitations')
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', invitationId);
      if (invError) throw invError;

      const { error: partError } = await supabase
        .from('beef_participants')
        .update({
          invite_status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('beef_id', beefId)
        .eq('user_id', user?.id);
      if (partError) throw partError;

      if (accept) {
        setTimeout(() => router.push(`/arena/${beefId}`), 600);
      } else {
        setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
        toast('Défi esquivé', 'info');
        setRespondingTo(null);
      }
    } catch (error) {
      console.error('Error responding to invitation:', error);
      toast('Erreur lors de la réponse', 'error');
      setRespondingTo(null);
      setTransitioningTo(null);
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor(diff / (1000 * 60 * 60));

    if (days > 1) return { text: `${days} jours restants`, urgent: false };
    if (days === 1) return { text: '1 jour restant', urgent: false };
    if (hours > 0) return { text: `${hours}h restantes`, urgent: true };
    return { text: 'Expire bientôt !', urgent: true };
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'low': return 'bg-green-500/20 text-green-400';
      case 'medium': return 'bg-yellow-500/20 text-yellow-400';
      case 'high': return 'bg-brand-500/20 text-brand-400';
      case 'critical': return 'bg-red-500/20 text-red-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 h-16 w-16 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          <p className="font-semibold text-white">Chargement...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement des invitations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] pb-20 font-sans">
      <AnimatePresence>
        {transitioningTo && (
          <motion.div
            key="arena-transition"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#050505]/95 backdrop-blur-xl"
          >
            <Swords className="mb-6 h-24 w-24 animate-pulse text-plasma-500" />
            <h2 className="text-3xl font-black uppercase tracking-widest text-white">Entrée dans l&apos;Arène...</h2>
            <div className="mt-8 h-1 w-48 overflow-hidden rounded-full bg-white/10">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: '100%' }}
                transition={{ duration: 0.6 }}
                className="h-full bg-plasma-500 shadow-[0_0_15px_rgba(156,39,176,0.5)]"
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-3xl px-4 py-8">
        <AppBackButton className="mb-6" />
        <div className="mb-10 text-center md:text-left">
          <h1 className="mb-2 flex items-center justify-center gap-3 text-4xl font-black text-white md:justify-start">
            <Swords className="h-10 w-10 text-plasma-500" />
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
              {invitations.map((invitation, index) => {
                const timeInfo = getTimeRemaining(invitation.expires_at);
                return (
                  <motion.div
                    key={invitation.id}
                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
                    transition={{ delay: index * 0.05 }}
                    className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-[#0A0A0A] shadow-2xl"
                  >
                    <div className="absolute left-0 top-0 h-1 w-full bg-gradient-to-r from-plasma-500 via-brand-500 to-plasma-500 opacity-50" />

                    <div className="p-6 md:p-8">
                      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                        <div>
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-red-500/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-500">
                              Défi Reçu
                            </span>
                            <span
                              className={`flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-widest ${timeInfo.urgent ? 'animate-pulse bg-orange-500/20 text-orange-400' : 'bg-white/10 text-white/50'}`}
                            >
                              <Timer className="h-3 w-3" /> {timeInfo.text}
                            </span>
                          </div>
                          <h3 className="text-2xl font-black leading-tight text-white md:text-3xl">
                            {invitation.beef.title}
                          </h3>
                        </div>
                        {invitation.beef.severity ? (
                          <div
                            className={`shrink-0 rounded-xl border border-current px-4 py-2 text-xs font-black uppercase tracking-widest ${getSeverityColor(invitation.beef.severity)}`}
                          >
                            Intensité: {invitation.beef.severity}
                          </div>
                        ) : null}
                      </div>

                      <div className="mb-6 rounded-2xl border border-white/5 bg-white/5 p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <Flame className="h-5 w-5 text-plasma-400" />
                          <span className="font-bold text-white">{invitation.beef.subject}</span>
                        </div>
                        <p className="text-sm leading-relaxed text-white/60">
                          <span className="font-bold text-white">Adversaire :</span> {invitation.inviter_display_name}
                          <br />
                          <span className='mt-1 inline-block font-bold text-white'>Médiateur :</span>{' '}
                          {invitation.beef.mediator_display_name}
                        </p>
                      </div>

                      {invitation.personal_message ? (
                        <div className="relative mb-8 pl-4">
                          <div className="absolute left-0 top-0 h-full w-1 rounded-full bg-plasma-500" />
                          <p className="text-sm italic text-white/70">&ldquo;{invitation.personal_message}&rdquo;</p>
                        </div>
                      ) : null}

                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button
                          type="button"
                          onClick={() => handleResponse(invitation.id, invitation.beef_id, true)}
                          disabled={respondingTo === invitation.id}
                          className="group relative flex-1 overflow-hidden rounded-2xl bg-plasma-500 px-6 py-4 font-black text-white shadow-[0_0_20px_rgba(156,39,176,0.3)] transition-all hover:scale-[1.02] hover:bg-plasma-400 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
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
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
