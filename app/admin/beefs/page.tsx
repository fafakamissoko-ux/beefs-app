'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RefreshCw, Search, Flame, Trash2, Star,
  StopCircle, ChevronUp, ChevronDown, Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';

interface Beef {
  id: string;
  title: string;
  status: string;
  created_at: string;
  viewer_count: number;
  tags: string[];
  is_featured: boolean;
  feed_position: number;
  mediator_id: string;
  users: { display_name: string; username: string } | null;
}

type StatusFilter = 'all' | 'live' | 'pending' | 'ended' | 'cancelled';

function asBoolFeatured(raw: unknown): boolean {
  return raw === true || raw === 'true' || raw === 't' || raw === 1 || raw === '1';
}

function sortBeefsByFeed(list: Beef[]): Beef[] {
  return [...list].sort(
    (a, b) =>
      b.feed_position - a.feed_position ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'En attente', bg: 'bg-yellow-500/15', text: 'text-yellow-400' },
  ready: { label: 'Prêt', bg: 'bg-blue-500/15', text: 'text-blue-400' },
  live: { label: 'En direct', bg: 'bg-red-500/15', text: 'text-red-400' },
  ended: { label: 'Terminé', bg: 'bg-gray-500/15', text: 'text-gray-400' },
  cancelled: { label: 'Annulé', bg: 'bg-gray-500/15', text: 'text-gray-500' },
};

export default function AdminBeefsPage() {
  const router = useRouter();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confirmModal, setConfirmModal] = useState<{
    type: 'delete' | 'end';
    beefId: string;
    beefTitle: string;
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && userRole !== null && (!user || userRole !== 'admin')) {
      router.replace('/');
    }
  }, [user, userRole, authLoading, router]);

  const loadBeefs = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('beefs')
        .select('id, title, status, created_at, viewer_count, tags, is_featured, feed_position, mediator_id, users:mediator_id(display_name, username)')
        .order('feed_position', { ascending: false })
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      if (search.trim()) {
        query = query.ilike('title', `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      setBeefs(
        sortBeefsByFeed(
          (data || []).map((b: any) => ({
            ...b,
            tags: b.tags || [],
            is_featured: asBoolFeatured(b.is_featured),
            feed_position: Math.max(0, Number(b.feed_position) || 0),
            users: Array.isArray(b.users) ? b.users[0] ?? null : b.users,
          })),
        ),
      );
    } catch {
      toast('Erreur lors du chargement des beefs', 'error');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, toast]);

  useEffect(() => {
    if (user && userRole === 'admin') loadBeefs();
  }, [user, userRole, loadBeefs]);

  const handleDelete = async (beefId: string) => {
    setActionLoading(beefId);
    try {
      const { error } = await supabase.from('beefs').delete().eq('id', beefId);
      if (error) throw error;
      setBeefs(prev => prev.filter(b => b.id !== beefId));
      toast('Beef supprimé', 'success');
    } catch {
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleForceEnd = async (beefId: string) => {
    setActionLoading(beefId);
    try {
      const { error } = await supabase
        .from('beefs')
        .update({ status: 'ended', ended_at: new Date().toISOString() })
        .eq('id', beefId);
      if (error) throw error;
      setBeefs(prev => prev.map(b => b.id === beefId ? { ...b, status: 'ended' } : b));
      toast('Beef terminé de force', 'success');
    } catch {
      toast('Erreur lors de la fin forcée', 'error');
    } finally {
      setActionLoading(null);
      setConfirmModal(null);
    }
  };

  const handleToggleFeatured = async (beef: Beef) => {
    setActionLoading(beef.id);
    try {
      const newVal = !beef.is_featured;
      const { error } = await supabase
        .from('beefs')
        .update({ is_featured: newVal })
        .eq('id', beef.id);
      if (error) throw error;
      setBeefs(prev => prev.map(b => b.id === beef.id ? { ...b, is_featured: newVal } : b));
      toast(newVal ? 'Beef mis en avant' : 'Beef retiré de la une', 'success');
    } catch {
      toast('Erreur lors de la mise à jour', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleMovePosition = async (beef: Beef, direction: 'up' | 'down') => {
    const sorted = sortBeefsByFeed(beefs);
    const i = sorted.findIndex(b => b.id === beef.id);
    if (i === -1) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= sorted.length) {
      toast(direction === 'up' ? 'Déjà en tête du classement' : 'Déjà en bas du classement', 'info');
      return;
    }

    const a = sorted[i];
    const b = sorted[j];
    let posA = Math.max(0, b.feed_position);
    let posB = Math.max(0, a.feed_position);
    if (posA === posB) {
      posA = posB + 1;
    }

    setActionLoading(beef.id);
    try {
      const [r1, r2] = await Promise.all([
        supabase.from('beefs').update({ feed_position: posA }).eq('id', a.id),
        supabase.from('beefs').update({ feed_position: posB }).eq('id', b.id),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;

      setBeefs(prev =>
        sortBeefsByFeed(
          prev.map(row => {
            if (row.id === a.id) return { ...row, feed_position: posA };
            if (row.id === b.id) return { ...row, feed_position: posB };
            return row;
          }),
        ),
      );
      toast('Ordre mis à jour', 'success');
    } catch {
      toast('Erreur lors du déplacement', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const sortedBeefs = useMemo(() => sortBeefsByFeed(beefs), [beefs]);

  if (authLoading || userRole === null || !user || userRole !== 'admin') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const statusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${cfg.bg} ${cfg.text}`}>
        {cfg.label}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-black pb-24">
      {/* Header */}
      <div className="brand-gradient px-4 pt-14 pb-8">
        <div className="max-w-4xl mx-auto">
          <AppBackButton fallback="/admin" className="text-white/80 hover:text-white text-sm mb-3" />
          <div className="flex items-center gap-3">
            <Flame className="w-7 h-7 text-white" />
            <h1 className="text-2xl font-black text-white">Gestion des Beefs</h1>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4 space-y-4">
        {/* Search + Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher un beef par titre…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {(['all', 'live', 'pending', 'ended', 'cancelled'] as StatusFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  statusFilter === f
                    ? 'bg-orange-500 text-white'
                    : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                {f === 'all' ? 'Tous' : STATUS_CONFIG[f]?.label || f}
              </button>
            ))}
            <button
              onClick={loadBeefs}
              className="ml-auto p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.div>

        {/* Beefs List */}
        {loading ? (
          <div className="text-center py-16 text-gray-500">Chargement…</div>
        ) : sortedBeefs.length === 0 ? (
          <div className="card p-10 text-center">
            <Flame className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-semibold">Aucun beef trouvé</p>
            <p className="text-gray-600 text-sm mt-1">Changez les filtres ou la recherche</p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block">
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-gray-500 font-medium px-4 py-3">Titre</th>
                      <th className="text-left text-gray-500 font-medium px-4 py-3">Statut</th>
                      <th className="text-left text-gray-500 font-medium px-4 py-3">Médiateur</th>
                      <th className="text-left text-gray-500 font-medium px-4 py-3">Date</th>
                      <th className="text-center text-gray-500 font-medium px-4 py-3">
                        <Eye className="w-3.5 h-3.5 inline" />
                      </th>
                      <th className="text-left text-gray-500 font-medium px-4 py-3">Tags</th>
                      <th className="text-right text-gray-500 font-medium px-4 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedBeefs.map((beef, i) => {
                      const rank = i;
                      const atTop = rank === 0;
                      const atBottom = rank === sortedBeefs.length - 1;
                      return (
                      <tr
                        key={beef.id}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors ${
                          beef.is_featured ? 'bg-orange-500/[0.04]' : ''
                        }`}
                      >
                        <td className="px-4 py-3 align-top">
                          <div className="flex flex-col gap-0.5 min-h-[2.5rem] justify-center">
                            <div className="flex items-center gap-2 min-w-0">
                              {beef.is_featured && (
                                <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400 flex-shrink-0" aria-hidden />
                              )}
                              <span className="text-white font-medium truncate max-w-[200px]">{beef.title}</span>
                            </div>
                            <span className="text-gray-600 text-[11px] tabular-nums">
                              Rang {i + 1} / {sortedBeefs.length}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">{statusBadge(beef.status)}</td>
                        <td className="px-4 py-3 text-gray-300 truncate max-w-[120px]">
                          {beef.users?.display_name || beef.users?.username || '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {new Date(beef.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' })}
                        </td>
                        <td className="px-4 py-3 text-center text-gray-400">{beef.viewer_count}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {beef.tags.slice(0, 3).map(tag => (
                              <span key={tag} className="px-1.5 py-0.5 bg-white/5 text-gray-400 text-xs rounded">
                                {tag}
                              </span>
                            ))}
                            {beef.tags.length > 3 && (
                              <span className="text-gray-600 text-xs">+{beef.tags.length - 3}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => handleMovePosition(beef, 'up')}
                              disabled={actionLoading === beef.id || atTop}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all disabled:opacity-30"
                              title="Monter"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMovePosition(beef, 'down')}
                              disabled={actionLoading === beef.id || atBottom}
                              className="p-1.5 rounded-lg hover:bg-white/10 text-gray-500 hover:text-white transition-all disabled:opacity-30"
                              title="Descendre"
                            >
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleFeatured(beef)}
                              disabled={actionLoading === beef.id}
                              className={`p-1.5 rounded-lg transition-all disabled:opacity-30 ${
                                beef.is_featured
                                  ? 'bg-orange-500/20 text-orange-300 hover:bg-orange-500/30 ring-1 ring-orange-500/40'
                                  : 'hover:bg-white/10 text-gray-500 hover:text-orange-400'
                              }`}
                              title={beef.is_featured ? 'Retirer de la une' : 'Mettre en avant'}
                              aria-pressed={beef.is_featured}
                            >
                              <Star
                                className={`w-3.5 h-3.5 ${beef.is_featured ? 'fill-orange-400 text-orange-400' : ''}`}
                              />
                            </button>
                            {beef.status !== 'ended' && beef.status !== 'cancelled' && (
                              <button
                                onClick={() => setConfirmModal({ type: 'end', beefId: beef.id, beefTitle: beef.title })}
                                disabled={actionLoading === beef.id}
                                className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all disabled:opacity-30"
                                title="Forcer la fin"
                              >
                                <StopCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => setConfirmModal({ type: 'delete', beefId: beef.id, beefTitle: beef.title })}
                              disabled={actionLoading === beef.id}
                              className="p-1.5 rounded-lg hover:bg-red-500/10 text-gray-500 hover:text-red-400 transition-all disabled:opacity-30"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              </motion.div>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden space-y-3">
              {sortedBeefs.map((beef, i) => {
                const atTop = i === 0;
                const atBottom = i === sortedBeefs.length - 1;
                return (
                <motion.div
                  key={beef.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={`card p-4 ${beef.is_featured ? 'border-orange-500/30' : ''}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {beef.is_featured && (
                          <Star className="w-3.5 h-3.5 text-orange-400 fill-orange-400 flex-shrink-0" aria-hidden />
                        )}
                        <h3 className="text-white font-bold text-sm truncate">{beef.title}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {statusBadge(beef.status)}
                        <span className="text-gray-500 text-xs">
                          {beef.users?.display_name || beef.users?.username || '—'}
                        </span>
                      </div>
                    </div>
                    <span className="text-gray-600 text-xs whitespace-nowrap ml-2">
                      {new Date(beef.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-3 flex-wrap">
                    <span className="text-gray-600 tabular-nums">
                      Rang {i + 1}/{sortedBeefs.length}
                    </span>
                    <span className="flex items-center gap-1">
                      <Eye className="w-3 h-3" /> {beef.viewer_count}
                    </span>
                    {beef.tags.length > 0 && (
                      <div className="flex gap-1 overflow-hidden">
                        {beef.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="px-1.5 py-0.5 bg-white/5 text-gray-400 rounded text-[10px]">
                            {tag}
                          </span>
                        ))}
                        {beef.tags.length > 2 && <span>+{beef.tags.length - 2}</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
                    <button
                      type="button"
                      onClick={() => handleMovePosition(beef, 'up')}
                      disabled={actionLoading === beef.id || atTop}
                      className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                      title="Monter"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMovePosition(beef, 'down')}
                      disabled={actionLoading === beef.id || atBottom}
                      className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 transition-all disabled:opacity-30"
                      title="Descendre"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleFeatured(beef)}
                      disabled={actionLoading === beef.id}
                      className={`p-2 rounded-lg transition-all disabled:opacity-30 ${
                        beef.is_featured
                          ? 'bg-orange-500/20 text-orange-300 ring-1 ring-orange-500/40'
                          : 'bg-white/5 text-gray-400 hover:text-orange-400'
                      }`}
                      aria-pressed={beef.is_featured}
                      title={beef.is_featured ? 'Retirer de la une' : 'Mettre en avant'}
                    >
                      <Star className={`w-4 h-4 ${beef.is_featured ? 'fill-orange-400 text-orange-400' : ''}`} />
                    </button>
                    <div className="flex-1" />
                    {beef.status !== 'ended' && beef.status !== 'cancelled' && (
                      <button
                        onClick={() => setConfirmModal({ type: 'end', beefId: beef.id, beefTitle: beef.title })}
                        disabled={actionLoading === beef.id}
                        className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                      >
                        <StopCircle className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setConfirmModal({ type: 'delete', beefId: beef.id, beefTitle: beef.title })}
                      disabled={actionLoading === beef.id}
                      className="p-2 rounded-lg bg-white/5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </motion.div>
              );
              })}
            </div>
          </>
        )}

        <p className="text-center text-gray-600 text-xs pt-2">
          {sortedBeefs.length} beef{sortedBeefs.length !== 1 ? 's' : ''} affichés
        </p>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !actionLoading && setConfirmModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="card p-6 w-full max-w-sm space-y-4"
            >
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                  confirmModal.type === 'delete' ? 'bg-red-500/15' : 'bg-orange-500/15'
                }`}>
                  {confirmModal.type === 'delete'
                    ? <Trash2 className="w-5 h-5 text-red-400" />
                    : <StopCircle className="w-5 h-5 text-orange-400" />}
                </div>
                <div>
                  <h3 className="text-white font-bold">
                    {confirmModal.type === 'delete' ? 'Supprimer le beef' : 'Forcer la fin'}
                  </h3>
                  <p className="text-gray-500 text-xs">Cette action est irréversible</p>
                </div>
              </div>

              <p className="text-gray-300 text-sm">
                {confirmModal.type === 'delete'
                  ? <>Êtes-vous sûr de vouloir supprimer <strong className="text-white">{confirmModal.beefTitle}</strong> ? Toutes les données associées seront perdues.</>
                  : <>Êtes-vous sûr de vouloir forcer la fin de <strong className="text-white">{confirmModal.beefTitle}</strong> ? Le statut passera à &quot;terminé&quot;.</>}
              </p>

              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  disabled={!!actionLoading}
                  className="flex-1 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 font-semibold rounded-xl text-sm transition-all disabled:opacity-50"
                >
                  Annuler
                </button>
                <button
                  onClick={() =>
                    confirmModal.type === 'delete'
                      ? handleDelete(confirmModal.beefId)
                      : handleForceEnd(confirmModal.beefId)
                  }
                  disabled={!!actionLoading}
                  className={`flex-1 py-2.5 font-bold rounded-xl text-sm transition-all disabled:opacity-50 ${
                    confirmModal.type === 'delete'
                      ? 'bg-red-500 hover:bg-red-600 text-white'
                      : 'bg-orange-500 hover:bg-orange-600 text-white'
                  }`}
                >
                  {actionLoading
                    ? 'Traitement…'
                    : confirmModal.type === 'delete' ? 'Supprimer' : 'Terminer'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
