'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Flag, ChevronDown, ChevronUp, UserX, CheckCircle,
  Eye, XCircle, RefreshCw, AlertCircle, Shield, Clock, Filter,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';

interface Report {
  id: string;
  reporter_id: string;
  reported_user_id: string;
  reason: string;
  description: string | null;
  status: 'pending' | 'reviewed' | 'resolved';
  created_at: string;
  reporter: { username: string; display_name: string | null } | null;
  reported: { username: string; display_name: string | null } | null;
}

type ConfirmAction =
  | { kind: 'banUser'; report: Report }
  | { kind: 'dismissReport'; report: Report }
  | null;

const REASON_LABELS: Record<string, string> = {
  harassment: 'Harcèlement',
  hate_speech: 'Discours haineux',
  violence: 'Violence',
  spam: 'Spam',
  inappropriate: 'Contenu inapproprié',
  other: 'Autre',
};

const REASON_COLORS: Record<string, string> = {
  harassment: 'bg-red-500/15 text-red-400',
  hate_speech: 'bg-purple-500/15 text-purple-400',
  violence: 'bg-orange-500/15 text-orange-400',
  spam: 'bg-yellow-500/15 text-yellow-400',
  inappropriate: 'bg-pink-500/15 text-pink-400',
  other: 'bg-gray-500/15 text-gray-400',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  reviewed: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  resolved: 'bg-green-500/15 text-green-400 border-green-500/30',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente',
  reviewed: 'Examiné',
  resolved: 'Résolu',
};

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed' | 'resolved'>('pending');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  useEffect(() => {
    if (!authLoading && userRole !== null && (!user || userRole !== 'admin')) {
      router.replace('/');
    }
  }, [user, userRole, authLoading, router]);

  useEffect(() => {
    if (user && userRole === 'admin') loadReports();
  }, [user, userRole]);

  const loadReports = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_reports')
        .select('*, reporter:users!reporter_id(username, display_name), reported:users!reported_user_id(username, display_name)')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReports(data ?? []);
    } catch {
      toast('Erreur lors du chargement des signalements', 'error');
    } finally {
      setLoading(false);
    }
  };

  const filteredReports = useMemo(() => {
    if (statusFilter === 'all') return reports;
    return reports.filter(r => r.status === statusFilter);
  }, [reports, statusFilter]);

  const updateStatus = async (reportId: string, newStatus: 'reviewed' | 'resolved') => {
    setActionLoading(reportId);
    try {
      const { error } = await supabase
        .from('user_reports')
        .update({ status: newStatus })
        .eq('id', reportId);

      if (error) throw error;
      setReports(prev =>
        prev.map(r => (r.id === reportId ? { ...r, status: newStatus } : r)),
      );
      toast(`Signalement marqué comme ${STATUS_LABELS[newStatus].toLowerCase()}`, 'success');
    } catch {
      toast('Erreur lors de la mise à jour', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const banReportedUser = async () => {
    if (confirmAction?.kind !== 'banUser') return;
    const r = confirmAction.report;
    setActionLoading(r.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_banned: true })
        .eq('id', r.reported_user_id);

      if (error) throw error;

      await supabase
        .from('user_reports')
        .update({ status: 'resolved' })
        .eq('id', r.id);

      setReports(prev => prev.map(x => (x.id === r.id ? { ...x, status: 'resolved' as const } : x)));
      toast(`${r.reported?.username ?? 'Utilisateur'} banni et signalement résolu`, 'success');
      setConfirmAction(null);
    } catch {
      toast('Erreur lors du bannissement', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const dismissReport = async () => {
    if (confirmAction?.kind !== 'dismissReport') return;
    const r = confirmAction.report;
    setActionLoading(r.id);
    try {
      const { error } = await supabase
        .from('user_reports')
        .update({ status: 'resolved' })
        .eq('id', r.id);

      if (error) throw error;
      setReports(prev => prev.map(x => (x.id === r.id ? { ...x, status: 'resolved' as const } : x)));
      toast('Signalement classé sans suite', 'success');
      setConfirmAction(null);
    } catch {
      toast('Erreur lors de la clôture', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const statusCounts = useMemo(() => {
    return {
      pending: reports.filter(r => r.status === 'pending').length,
      reviewed: reports.filter(r => r.status === 'reviewed').length,
      resolved: reports.filter(r => r.status === 'resolved').length,
    };
  }, [reports]);

  if (authLoading || userRole === null || !user || userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Header */}
      <div className="brand-gradient px-4 pt-14 pb-8">
        <div className="max-w-4xl mx-auto">
          <AppBackButton fallback="/admin" className="text-white/80 hover:text-white text-sm mb-3" />
          <div className="flex items-center gap-3">
            <Flag className="w-7 h-7 text-white" />
            <h1 className="text-2xl font-black text-white">Signalements</h1>
          </div>
          <p className="text-white/70 text-sm mt-1">
            {reports.length} signalement{reports.length !== 1 ? 's' : ''} au total
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4 space-y-4">
        {/* Stats cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3"
        >
          <div className="card p-4 text-center">
            <Clock className="w-5 h-5 text-orange-400 mx-auto mb-1.5" />
            <p className="text-xl font-black text-white">{statusCounts.pending}</p>
            <p className="text-gray-500 text-xs">En attente</p>
          </div>
          <div className="card p-4 text-center">
            <Eye className="w-5 h-5 text-blue-400 mx-auto mb-1.5" />
            <p className="text-xl font-black text-white">{statusCounts.reviewed}</p>
            <p className="text-gray-500 text-xs">Examinés</p>
          </div>
          <div className="card p-4 text-center">
            <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1.5" />
            <p className="text-xl font-black text-white">{statusCounts.resolved}</p>
            <p className="text-gray-500 text-xs">Résolus</p>
          </div>
        </motion.div>

        {/* Filter bar */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="card p-3 flex items-center gap-2"
        >
          <Filter className="w-4 h-4 text-gray-500 shrink-0 ml-1" />
          {(['pending', 'reviewed', 'resolved', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                statusFilter === f
                  ? 'bg-orange-500 text-white'
                  : 'bg-white/[0.04] text-gray-400 hover:text-white hover:bg-white/[0.08]'
              }`}
            >
              {f === 'all' ? 'Tous' : STATUS_LABELS[f]}
              {f !== 'all' && (
                <span className="ml-1 opacity-70">({statusCounts[f]})</span>
              )}
            </button>
          ))}
          <div className="flex-1" />
          <button
            onClick={loadReports}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </motion.div>

        {/* Reports list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-5">
                <div className="flex items-center gap-4">
                  <div className="skeleton w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-40" />
                    <div className="skeleton h-3 w-56" />
                  </div>
                  <div className="skeleton h-6 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredReports.length === 0 ? (
          <div className="card p-12 text-center">
            <Flag className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {statusFilter !== 'all'
                ? `Aucun signalement "${STATUS_LABELS[statusFilter].toLowerCase()}"`
                : 'Aucun signalement'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredReports.map((r, idx) => {
              const isExpanded = expandedId === r.id;
              return (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className="card overflow-hidden"
                >
                  {/* Main row */}
                  <div
                    className="p-4 md:p-5 cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : r.id)}
                  >
                    <div className="flex items-start gap-3">
                      {/* Reporter avatar */}
                      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center text-red-400 font-bold text-xs shrink-0 mt-0.5">
                        {(r.reporter?.display_name || r.reporter?.username || '?').charAt(0).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
                          <span className="text-white font-semibold">
                            @{r.reporter?.username ?? 'inconnu'}
                          </span>
                          <span className="text-gray-600">a signalé</span>
                          <span className="text-orange-400 font-semibold">
                            @{r.reported?.username ?? 'inconnu'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${REASON_COLORS[r.reason] ?? REASON_COLORS.other}`}>
                            {REASON_LABELS[r.reason] ?? r.reason}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_COLORS[r.status]}`}>
                            {STATUS_LABELS[r.status]}
                          </span>
                          <span className="text-gray-600 text-[10px]">
                            {new Date(r.created_at).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="shrink-0 text-gray-500">
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>
                  </div>

                  {/* Expanded details */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-4 md:px-5 md:pb-5 pt-0 border-t border-white/[0.06]">
                          {/* Description */}
                          <div className="mt-4 mb-4">
                            <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider mb-2">
                              Description
                            </p>
                            <div className="bg-white/[0.03] rounded-xl p-3">
                              <p className="text-gray-300 text-sm leading-relaxed">
                                {r.description || 'Aucune description fournie.'}
                              </p>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2">
                            {r.status === 'pending' && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  updateStatus(r.id, 'reviewed');
                                }}
                                disabled={actionLoading === r.id}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold hover:bg-blue-500/20 transition-all disabled:opacity-50"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Marquer examiné
                              </button>
                            )}

                            {(r.status === 'pending' || r.status === 'reviewed') && (
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  updateStatus(r.id, 'resolved');
                                }}
                                disabled={actionLoading === r.id}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold hover:bg-green-500/20 transition-all disabled:opacity-50"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Marquer résolu
                              </button>
                            )}

                            {r.status !== 'resolved' && (
                              <>
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setConfirmAction({ kind: 'banUser', report: r });
                                  }}
                                  disabled={actionLoading === r.id}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/20 transition-all disabled:opacity-50"
                                >
                                  <UserX className="w-3.5 h-3.5" />
                                  Bannir @{r.reported?.username ?? '?'}
                                </button>

                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    setConfirmAction({ kind: 'dismissReport', report: r });
                                  }}
                                  disabled={actionLoading === r.id}
                                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gray-500/10 border border-gray-500/20 text-gray-400 text-xs font-semibold hover:bg-gray-500/20 transition-all disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  Classer sans suite
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmation modal */}
      <AnimatePresence>
        {confirmAction && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setConfirmAction(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="card p-6 w-full max-w-sm relative z-10"
            >
              {confirmAction.kind === 'banUser' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                      <UserX className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Bannir l&apos;utilisateur</h3>
                      <p className="text-gray-500 text-xs">
                        @{confirmAction.report.reported?.username ?? 'inconnu'}
                      </p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mb-5">
                    L&apos;utilisateur{' '}
                    <span className="text-white font-semibold">
                      @{confirmAction.report.reported?.username}
                    </span>{' '}
                    sera banni et le signalement sera marqué comme résolu.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1">
                      Annuler
                    </button>
                    <button
                      onClick={banReportedUser}
                      disabled={actionLoading === confirmAction.report.id}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                    >
                      {actionLoading === confirmAction.report.id ? 'Bannissement...' : 'Bannir'}
                    </button>
                  </div>
                </>
              )}

              {confirmAction.kind === 'dismissReport' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-gray-500/15 flex items-center justify-center">
                      <XCircle className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Classer sans suite</h3>
                      <p className="text-gray-500 text-xs">Signalement de @{confirmAction.report.reporter?.username}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mb-5">
                    Le signalement sera marqué comme résolu sans action contre l&apos;utilisateur signalé.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setConfirmAction(null)} className="btn-secondary flex-1">
                      Annuler
                    </button>
                    <button
                      onClick={dismissReport}
                      disabled={actionLoading === confirmAction.report.id}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {actionLoading === confirmAction.report.id ? 'En cours...' : 'Confirmer'}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
