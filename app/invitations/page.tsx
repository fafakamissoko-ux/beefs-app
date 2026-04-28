'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Check, X, Clock, AlertCircle, Users, Flame } from 'lucide-react';
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

      setInvitations((prev) => prev.filter((inv) => inv.id !== invitationId));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }

      if (accept) {
        toast('Invitation acceptée — redirection...', 'success');
        setTimeout(() => router.push(`/arena/${beefId}`), 800);
      } else {
        toast('Invitation refusée', 'info');
      }
    } catch (error) {
      console.error('Error responding to invitation:', error);
      toast('Erreur lors de la réponse', 'error');
    } finally {
      setRespondingTo(null);
    }
  };

  const getTimeRemaining = (expiresAt: string) => {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days > 1) return `${days} jours restants`;
    if (days === 1) return '1 jour restant';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h restantes`;
    return 'Expire bientôt';
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
    <div className="min-h-screen pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />
        <div className="mb-8">
          <h1 className="text-4xl font-black text-white mb-2 flex items-center gap-3">
            <Mail className="w-10 h-10 text-brand-400" />
            Invitations
          </h1>
          <p className="text-gray-400">
            {invitations.length === 0
              ? 'Aucune invitation en attente'
              : `${invitations.length} invitation${invitations.length > 1 ? 's' : ''} en attente`}
          </p>
        </div>

        {invitations.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card rounded-2xl p-12 text-center"
          >
            <Mail className="w-20 h-20 text-gray-600 mx-auto mb-4" />
            <h3 className="text-2xl font-bold text-white mb-2">Aucune invitation</h3>
            <p className="text-gray-400 mb-6">
              Tu n'as pas d'invitation en attente pour le moment.
            </p>
            <button
              onClick={() => router.push('/live')}
              className="px-6 py-3 brand-gradient hover:opacity-90 text-black font-bold rounded-xl transition-all"
            >
              Voir les beefs en cours
            </button>
          </motion.div>
        ) : (
          <div className="space-y-4">
            <AnimatePresence>
              {invitations.map((invitation, index) => (
                <motion.div
                  key={invitation.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  transition={{ delay: index * 0.1 }}
                  className="bg-surface-2 rounded-2xl p-6 border-2 border-brand-500/50 shadow-xl"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-black text-white mb-1">
                        {invitation.beef.title}
                      </h3>
                      <p className="text-gray-400 text-sm">
                        Invité par <span className="text-white font-semibold">{invitation.inviter_display_name}</span> (Médiateur: <span className="text-brand-400 font-semibold">{invitation.beef.mediator_display_name}</span>)
                      </p>
                    </div>
                    {invitation.beef.severity && (
                      <div className={`px-3 py-1 rounded-full text-xs font-bold ${getSeverityColor(invitation.beef.severity)}`}>
                        {invitation.beef.severity.toUpperCase()}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mb-3">
                    <Flame className="w-5 h-5 text-red-500" />
                    <span className="text-white font-semibold">{invitation.beef.subject}</span>
                  </div>

                  <p className="text-gray-300 mb-4 line-clamp-3">{invitation.beef.description}</p>

                  {invitation.personal_message && (
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
                      <p className="text-blue-400 text-sm">
                        💬 <span className="font-semibold">Message du médiateur:</span> {invitation.personal_message}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-gray-400 text-sm mb-4">
                    <Clock className="w-4 h-4" />
                    <span>{getTimeRemaining(invitation.expires_at)}</span>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => handleResponse(invitation.id, invitation.beef_id, true)}
                      disabled={respondingTo === invitation.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white font-bold rounded-lg transition-all disabled:opacity-50"
                    >
                      {respondingTo === invitation.id ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          <span>Traitement...</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5" />
                          <span>Accepter</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => handleResponse(invitation.id, invitation.beef_id, false)}
                      disabled={respondingTo === invitation.id}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-all disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                      <span>Refuser</span>
                    </button>
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
