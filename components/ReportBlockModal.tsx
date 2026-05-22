'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Flag, Ban, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';

interface ReportBlockModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

type ReportReason = 'harassment' | 'hate_speech' | 'violence' | 'spam' | 'inappropriate' | 'other';

const REASON_LABELS: Record<ReportReason, string> = {
  harassment: 'Harcèlement',
  hate_speech: 'Discours haineux',
  violence: 'Violence',
  spam: 'Spam',
  inappropriate: 'Contenu inapproprié',
  other: 'Autre',
};

type Tab = 'report' | 'block';

export function ReportBlockModal({ userId, userName, onClose }: ReportBlockModalProps) {
  const { user } = useAuth();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<Tab>('report');
  const [reason, setReason] = useState<ReportReason | ''>('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const handleReport = async () => {
    if (!user || !reason) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_reports').insert({
        reporter_id: user.id,
        reported_user_id: userId,
        reason,
        description: description.trim() || null,
      });
      if (error) throw error;
      toast('Signalement envoyé. Merci pour votre aide.', 'success');
      onClose();
    } catch {
      toast('Erreur lors du signalement. Réessayez.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBlock = async () => {
    if (!user) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('user_blocks').insert({
        blocker_id: user.id,
        blocked_id: userId,
      });
      if (error) throw error;
      toast(`@${userName} a été bloqué.`, 'success');
      onClose();
    } catch {
      toast('Erreur lors du blocage. Réessayez.', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-modal flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="card rounded-2xl p-6 max-w-md w-full border border-white/10 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              @{userName}
            </h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-black/40 rounded-xl p-1 mb-6">
            <button
              onClick={() => setActiveTab('report')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'report'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Flag className="w-4 h-4" />
              Signaler
            </button>
            <button
              onClick={() => setActiveTab('block')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === 'block'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Ban className="w-4 h-4" />
              Bloquer
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'report' ? (
            <div className="space-y-4">
              {/* Custom dropdown */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                  Raison du signalement <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="input-field w-full text-left flex items-center justify-between"
                  >
                    <span className={reason ? 'text-white' : 'text-gray-500'}>
                      {reason ? REASON_LABELS[reason] : 'Sélectionner une raison'}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {dropdownOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="absolute z-10 mt-1 w-full bg-surface-2 border border-white/10 rounded-xl overflow-hidden shadow-xl"
                    >
                      {(Object.entries(REASON_LABELS) as [ReportReason, string][]).map(([key, label]) => (
                        <button
                          key={key}
                          onClick={() => { setReason(key); setDropdownOpen(false); }}
                          className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-white/10 ${
                            reason === key ? 'text-red-400 bg-red-500/10' : 'text-gray-300'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </motion.div>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-1.5">
                  Description <span className="text-gray-500">(optionnel)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Décrivez le problème..."
                  rows={3}
                  className="input-field w-full resize-none"
                />
              </div>

              {/* Submit */}
              <button
                onClick={handleReport}
                disabled={!reason || submitting}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Flag className="w-4 h-4" />
                )}
                {submitting ? 'Envoi...' : 'Envoyer le signalement'}
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                <p className="text-gray-300 text-sm leading-relaxed">
                  Bloquer <span className="font-bold text-white">@{userName}</span> ?
                  Vous ne verrez plus ses beefs ni ses messages.
                </p>
              </div>

              <button
                onClick={handleBlock}
                disabled={submitting}
                className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 text-white hover:bg-red-700 flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Ban className="w-4 h-4" />
                )}
                {submitting ? 'Blocage...' : `Bloquer @${userName}`}
              </button>
            </div>
          )}

          {/* Footer */}
          <p className="text-gray-500 text-xs mt-4 text-center">
            Les signalements sont traités de manière confidentielle.
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
