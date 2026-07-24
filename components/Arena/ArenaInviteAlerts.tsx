'use client';

import { motion, AnimatePresence } from 'framer-motion';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToastType } from '@/components/Toast';

type ToastFn = (message: string, type?: ToastType) => void;

interface AcceptedInviteAlertProps {
  isOpen: boolean;
  beefEnded: boolean;
  onDismiss: () => void;
}

export function AcceptedInviteAlert({ isOpen, beefEnded, onDismiss }: AcceptedInviteAlertProps) {
  return (
    <AnimatePresence>
      {isOpen && !beefEnded && (
        <motion.div
          key="mediation-table-invite"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/75 backdrop-blur-md px-4 shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="mediation-invite-title"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 p-6 text-center shadow-2xl backdrop-blur-md"
          >
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-cobalt-500/20">
              <span className="text-4xl" aria-hidden>\u2696\ufe0f</span>
            </div>
            <h2
              id="mediation-invite-title"
              className="mb-2 font-mono text-xl font-black uppercase tracking-tight text-white"
            >
              Invitation \u00e0 la m\u00e9diation
            </h2>
            <p className="mb-6 text-sm text-white/60">
              Le Ref souhaite t&apos;entendre. Installe-toi \u00e0 la table des \u00e9changes en pr\u00e9parant ta cam\u00e9ra et
              ton micro.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full rounded-full bg-white py-3.5 font-mono text-sm font-black uppercase tracking-wider text-black shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-transform hover:bg-gray-200 active:scale-95"
            >
              Prendre place
            </button>
            <button
              type="button"
              onClick={onDismiss}
              className="mt-3 text-xs font-semibold text-white/40 hover:text-white/80"
            >
              Annuler et rester spectateur
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface RefInviteAlertProps {
  isOpen: boolean;
  beefEnded: boolean;
  roomId: string;
  userId: string | null;
  supabaseClient: SupabaseClient;
  toast: ToastFn;
  onDismiss: () => void;
}

export function RefInviteAlert({
  isOpen,
  beefEnded,
  roomId,
  userId,
  supabaseClient,
  toast,
  onDismiss,
}: RefInviteAlertProps) {
  const handleAccept = async () => {
    await supabaseClient
      .from('beef_participants')
      .update({
        invite_status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('beef_id', roomId)
      .eq('user_id', userId);
    await supabaseClient
      .from('beef_invitations')
      .update({
        status: 'accepted',
        responded_at: new Date().toISOString(),
      })
      .eq('beef_id', roomId)
      .eq('invitee_id', userId);
    window.location.reload();
  };

  const handleDecline = async () => {
    onDismiss();
    await supabaseClient
      .from('beef_participants')
      .update({
        invite_status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('beef_id', roomId)
      .eq('user_id', userId);
    await supabaseClient
      .from('beef_invitations')
      .update({
        status: 'declined',
        responded_at: new Date().toISOString(),
      })
      .eq('beef_id', roomId)
      .eq('invitee_id', userId);
    toast('Convocation d\u00e9clin\u00e9e', 'info');
  };

  return (
    <AnimatePresence>
      {isOpen && !beefEnded && (
        <motion.div
          key="ref-invite-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[3000] flex items-center justify-center bg-slate-950/75 backdrop-blur-md px-4 shadow-2xl"
          role="dialog"
          aria-modal="true"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 10 }}
            className="w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-slate-950/75 p-6 text-center shadow-2xl backdrop-blur-md"
          >
            <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-cyan-500/20">
              <span className="text-4xl" aria-hidden>\ud83c\udf99\ufe0f</span>
            </div>
            <h2 className="mb-2 font-mono text-xl font-black uppercase tracking-tight text-white">
              Le Ref te convoque
            </h2>
            <p className="mb-6 text-sm text-white/60">
              Tu es invit\u00e9 \u00e0 entrer sur sc\u00e8ne. Pr\u00e9pare ta cam\u00e9ra et ton micro.
            </p>
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={() => void handleAccept()}
                className="w-full rounded-full bg-cyan-500 py-3.5 font-mono text-sm font-black uppercase tracking-wider text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-transform hover:bg-cyan-400 active:scale-95"
              >
                Prendre la parole
              </button>
              <button
                type="button"
                onClick={() => void handleDecline()}
                className="w-full rounded-full border border-white/10 bg-white/5 py-3.5 font-mono text-sm font-bold uppercase tracking-wider text-white/60 transition-colors hover:bg-white/10 hover:text-white"
              >
                Rester dans le public
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
