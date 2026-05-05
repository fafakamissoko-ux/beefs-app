'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Swords, Zap, X, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { fetchUserPublicByIds, displayNameFromPublicRow } from '@/lib/fetch-user-public-profile';

interface AmbushData {
  id: string;
  beef_id: string;
  inviter_display_name: string;
  beef_title: string;
}

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
  const [ambush, setAmbush] = useState<AmbushData | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isResponding, setIsResponding] = useState(false);
  const autoDeclineTriggered = useRef(false);

  const isInArena = pathname?.startsWith('/arena/');

  const handleAmbushResponse = useCallback(
    async (accept: boolean, currentAmbush: AmbushData) => {
      setIsResponding(true);
      try {
        const { error: invError } = await supabase
          .from('beef_invitations')
          .update({
            status: accept ? 'accepted' : 'declined',
            responded_at: new Date().toISOString(),
          })
          .eq('id', currentAmbush.id);
        if (invError) throw invError;

        const { error: partError } = await supabase
          .from('beef_participants')
          .update({
            invite_status: accept ? 'accepted' : 'declined',
            responded_at: new Date().toISOString(),
          })
          .eq('beef_id', currentAmbush.beef_id)
          .eq('user_id', user?.id);
        if (partError) throw partError;

        setAmbush(null);
        autoDeclineTriggered.current = false;

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
        }

        if (accept) {
          router.push(`/arena/${currentAmbush.beef_id}`);
        }
      } catch (err) {
        console.error('Erreur réponse embuscade:', err);
        setAmbush(null);
        autoDeclineTriggered.current = false;
      } finally {
        setIsResponding(false);
      }
    },
    [user?.id, router]
  );

  useEffect(() => {
    if (!user || isInArena) return;

    const channel = supabase
      .channel(`ambush_${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'beef_invitations',
          filter: `invitee_id=eq.${user.id}`,
        },
        async (payload) => {
          const inv = payload.new as InvitationRow;
          if (inv.status !== 'sent') return;

          const { data: beef } = await supabase.from('beefs').select('title').eq('id', inv.beef_id).single();
          if (!beef) return;

          const pubMap = await fetchUserPublicByIds(supabase, [inv.inviter_id], 'id, display_name, username');
          const inviter = pubMap.get(inv.inviter_id);

          autoDeclineTriggered.current = false;
          setAmbush({
            id: inv.id,
            beef_id: inv.beef_id,
            inviter_display_name: displayNameFromPublicRow(inviter, 'Un adversaire'),
            beef_title: beef.title,
          });
          setTimeLeft(30);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, isInArena]);

  useEffect(() => {
    if (!ambush) {
      autoDeclineTriggered.current = false;
      return;
    }
    if (timeLeft <= 0) {
      if (!autoDeclineTriggered.current) {
        autoDeclineTriggered.current = true;
        void handleAmbushResponse(false, ambush);
      }
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [ambush, timeLeft, handleAmbushResponse]);

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
          animate={{ opacity: [0.3, 0.6, 0.3] }}
          transition={{ duration: 1, repeat: Infinity }}
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-red-900/40 via-transparent to-transparent"
        />

        <motion.div
          initial={{ scale: 0.9, y: 50 }}
          animate={{ scale: 1, y: 0 }}
          className="relative z-10 w-full max-w-lg overflow-hidden rounded-[2rem] border border-red-500/30 bg-[#0A0A0A] p-8 text-center shadow-[0_0_100px_rgba(220,38,38,0.2)]"
        >
          <div className="absolute left-0 top-0 h-1.5 w-full bg-white/10">
            <motion.div
              key={ambush.id}
              initial={{ width: '100%' }}
              animate={{ width: '0%' }}
              transition={{ duration: 30, ease: 'linear' }}
              className="h-full bg-red-500 shadow-[0_0_10px_rgba(220,38,38,0.8)]"
            />
          </div>

          <div className="mb-6 flex justify-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-red-500/20 bg-red-500/10">
              <Swords className="h-10 w-10 animate-pulse text-red-500" />
            </div>
          </div>

          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-red-500/20 px-4 py-1 text-xs font-black uppercase tracking-widest text-red-400">
            <ShieldAlert className="h-4 w-4" /> Embuscade en Direct
          </div>

          <h2 className="mt-4 text-3xl font-black text-white">
            <span className="text-plasma-400">{ambush.inviter_display_name}</span> te défie&nbsp;!
          </h2>
          <p className="mt-2 text-lg font-semibold text-white/60">&ldquo;{ambush.beef_title}&rdquo;</p>

          <div className="my-8 text-6xl font-black text-white">
            00:{timeLeft.toString().padStart(2, '0')}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => handleAmbushResponse(true, ambush)}
              disabled={isResponding}
              className="group relative flex-1 overflow-hidden rounded-2xl bg-plasma-500 px-6 py-4 font-black text-white transition-all hover:scale-[1.02] hover:bg-plasma-400 active:scale-95 disabled:opacity-50"
            >
              <div className="relative z-10 flex items-center justify-center gap-2 text-lg">
                <Zap className="h-5 w-5" /> RELEVER LE DÉFI
              </div>
            </button>
            <button
              type="button"
              onClick={() => handleAmbushResponse(false, ambush)}
              disabled={isResponding}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-bold text-white/60 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-500 active:scale-95 disabled:opacity-50"
            >
              <X className="h-5 w-5" /> Esquiver
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
