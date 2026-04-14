'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Search, Shield, ShieldCheck, UserX, UserCheck,
  Pencil, Trash2, X, Users, Coins, Crown, RefreshCw, AlertCircle,
} from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { AppBackButton } from '@/components/AppBackButton';

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  email: string;
  points: number;
  role: 'user' | 'admin' | 'moderator';
  is_banned: boolean;
  created_at: string;
  avatar_url: string | null;
}

type ModalType =
  | { kind: 'editPoints'; user: UserRow }
  | { kind: 'deleteUser'; user: UserRow }
  | { kind: 'banUser'; user: UserRow }
  | null;

const ROLE_COLORS: Record<string, string> = {
  admin: 'bg-red-500/15 text-red-400 border-red-500/30',
  moderator: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  user: 'bg-gray-500/15 text-gray-400 border-gray-500/30',
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  moderator: 'Modérateur',
  user: 'Utilisateur',
};

export default function AdminUsersPage() {
  const router = useRouter();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<ModalType>(null);
  const [editPointsValue, setEditPointsValue] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && userRole !== null && (!user || userRole !== 'admin')) {
      router.replace('/');
    }
  }, [user, userRole, authLoading, router]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast('Session expirée, reconnecte-toi.', 'error');
        return;
      }
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof json.error === 'string' ? json.error : 'Chargement impossible');
      }
      setUsers(json.users ?? []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur lors du chargement des utilisateurs';
      console.error('[admin/users]', e);
      toast(msg, 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (user && userRole === 'admin') void loadUsers();
  }, [user, userRole, loadUsers]);

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter(
      u =>
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.display_name && u.display_name.toLowerCase().includes(q)),
    );
  }, [users, search]);

  const [banDuration, setBanDuration] = useState<string>('permanent');
  const [banReason, setBanReason] = useState('');

  const toggleBan = async (u: UserRow) => {
    if (u.is_banned) {
      // Unban
      setActionLoading(u.id);
      try {
        await supabase.from('users').update({ is_banned: false, banned_until: null, ban_reason: null }).eq('id', u.id);
        await supabase.from('banned_emails').delete().eq('email', u.email);
        setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_banned: false } : x)));
        toast(`${u.username} débanni`, 'success');
      } catch { toast('Erreur', 'error'); }
      finally { setActionLoading(null); }
    } else {
      // Open ban modal
      setBanDuration('permanent');
      setBanReason('');
      setModal({ kind: 'banUser', user: u });
    }
  };

  const confirmBan = async () => {
    if (!modal || modal.kind !== 'banUser') return;
    const u = modal.user;
    setActionLoading(u.id);
    try {
      const bannedUntil = banDuration === 'permanent' ? null
        : banDuration === '1h' ? new Date(Date.now() + 3600000).toISOString()
        : banDuration === '24h' ? new Date(Date.now() + 86400000).toISOString()
        : banDuration === '7d' ? new Date(Date.now() + 7 * 86400000).toISOString()
        : banDuration === '30d' ? new Date(Date.now() + 30 * 86400000).toISOString()
        : null;

      await supabase.from('users').update({
        is_banned: true,
        banned_until: bannedUntil,
        ban_reason: banReason || null,
      }).eq('id', u.id);

      // Block email from re-registering
      await supabase.from('banned_emails').upsert({
        email: u.email,
        reason: banReason || 'Banni par admin',
        banned_by: user?.id,
      }, { onConflict: 'email' });

      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, is_banned: true } : x)));
      toast(`${u.username} banni ${banDuration === 'permanent' ? 'définitivement' : `pour ${banDuration}`}`, 'success');
      setModal(null);
    } catch { toast('Erreur lors du bannissement', 'error'); }
    finally { setActionLoading(null); }
  };

  const changeRole = async (u: UserRow, newRole: string) => {
    setActionLoading(u.id);
    try {
      const { error } = await supabase
        .from('users')
        .update({ role: newRole })
        .eq('id', u.id);

      if (error) throw error;
      setUsers(prev =>
        prev.map(x => (x.id === u.id ? { ...x, role: newRole as UserRow['role'] } : x)),
      );
      toast(`Rôle de ${u.username} changé en ${ROLE_LABELS[newRole]}`, 'success');
    } catch {
      toast('Erreur lors du changement de rôle', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const savePoints = async () => {
    if (modal?.kind !== 'editPoints') return;
    const u = modal.user;
    const pts = parseInt(editPointsValue, 10);
    if (isNaN(pts) || pts < 0) {
      toast('Valeur de points invalide', 'error');
      return;
    }
    setActionLoading(u.id);
    try {
      const { error } = await supabase.from('users').update({ points: pts }).eq('id', u.id);
      if (error) throw error;
      setUsers(prev => prev.map(x => (x.id === u.id ? { ...x, points: pts } : x)));
      toast(`Points de ${u.username} mis à jour (${pts})`, 'success');
      setModal(null);
    } catch {
      toast('Erreur lors de la mise à jour des points', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const deleteUser = async () => {
    if (modal?.kind !== 'deleteUser') return;
    const u = modal.user;
    setActionLoading(u.id);
    try {
      const { error } = await supabase.from('users').delete().eq('id', u.id);
      if (error) throw error;
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast(`${u.username} supprimé`, 'success');
      setModal(null);
    } catch {
      toast('Erreur lors de la suppression', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const openEditPoints = (u: UserRow) => {
    setEditPointsValue(String(u.points));
    setModal({ kind: 'editPoints', user: u });
  };

  if (authLoading || userRole === null || !user || userRole !== 'admin') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="brand-gradient px-4 pt-14 pb-8">
        <div className="max-w-4xl mx-auto">
          <AppBackButton fallback="/admin" className="text-white/80 hover:text-white text-sm mb-3" />
          <div className="flex items-center gap-3">
            <Users className="w-7 h-7 text-white" />
            <h1 className="text-2xl font-black text-white">Gestion des utilisateurs</h1>
          </div>
          <p className="text-white/70 text-sm mt-1">
            {users.length} utilisateur{users.length !== 1 ? 's' : ''} inscrits
          </p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-4 space-y-4">
        {/* Search */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="card p-4 flex items-center gap-3">
            <Search className="w-5 h-5 text-gray-500 shrink-0" />
            <input
              type="text"
              placeholder="Rechercher par pseudo ou email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-white placeholder-gray-500 focus:outline-none text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-gray-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={loadUsers}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </motion.div>

        {/* Users list */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="card p-5">
                <div className="flex items-center gap-4">
                  <div className="skeleton w-10 h-10 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="skeleton h-4 w-32" />
                    <div className="skeleton h-3 w-48" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="card p-12 text-center">
            <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">
              {search ? 'Aucun utilisateur trouvé' : 'Aucun utilisateur'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.05 }}
                className="card overflow-hidden"
              >
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-left text-gray-500 font-medium px-5 py-3">Utilisateur</th>
                      <th className="text-left text-gray-500 font-medium px-3 py-3">Email</th>
                      <th className="text-center text-gray-500 font-medium px-3 py-3">Points</th>
                      <th className="text-center text-gray-500 font-medium px-3 py-3">Rôle</th>
                      <th className="text-center text-gray-500 font-medium px-3 py-3">Statut</th>
                      <th className="text-right text-gray-500 font-medium px-5 py-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u, idx) => (
                      <tr
                        key={u.id}
                        className={`border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors ${
                          u.is_banned ? 'opacity-60' : ''
                        }`}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-xs shrink-0">
                              {(u.display_name || u.username).charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-white font-semibold truncate">{u.display_name || u.username}</p>
                              <p className="text-gray-500 text-xs truncate">@{u.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-400 truncate max-w-[180px]">{u.email}</td>
                        <td className="px-3 py-3 text-center">
                          <span className="text-yellow-400 font-bold">{u.points.toLocaleString('fr-FR')}</span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <select
                            value={u.role}
                            onChange={e => changeRole(u, e.target.value)}
                            disabled={actionLoading === u.id}
                            className="bg-transparent text-xs font-semibold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none disabled:opacity-50"
                            style={{
                              borderColor: u.role === 'admin' ? 'rgba(239,68,68,0.3)' : u.role === 'moderator' ? 'rgba(168,85,247,0.3)' : 'rgba(107,114,128,0.3)',
                              color: u.role === 'admin' ? '#f87171' : u.role === 'moderator' ? '#c084fc' : '#9ca3af',
                            }}
                          >
                            <option value="user" className="bg-gray-900">Utilisateur</option>
                            <option value="moderator" className="bg-gray-900">Modérateur</option>
                            <option value="admin" className="bg-gray-900">Admin</option>
                          </select>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-red-500/20 text-red-400">Banni</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-green-500/20 text-green-400">Actif</span>
                          )}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => toggleBan(u)}
                              disabled={actionLoading === u.id}
                              title={u.is_banned ? 'Débannir' : 'Bannir'}
                              className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                                u.is_banned
                                  ? 'text-green-400 hover:bg-green-500/10'
                                  : 'text-orange-400 hover:bg-orange-500/10'
                              }`}
                            >
                              {u.is_banned ? <UserCheck className="w-4 h-4" /> : <UserX className="w-4 h-4" />}
                            </button>
                            <button
                              onClick={() => openEditPoints(u)}
                              disabled={actionLoading === u.id}
                              title="Modifier les points"
                              className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-all disabled:opacity-50"
                            >
                              <Coins className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setModal({ kind: 'deleteUser', user: u })}
                              disabled={actionLoading === u.id}
                              title="Supprimer"
                              className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </motion.div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden space-y-3">
              {filteredUsers.map((u, idx) => (
                <motion.div
                  key={u.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.03 }}
                  className={`card p-4 ${u.is_banned ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-orange-500/20 flex items-center justify-center text-orange-400 font-bold text-sm shrink-0">
                      {(u.display_name || u.username).charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-white font-bold truncate">{u.display_name || u.username}</p>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${ROLE_COLORS[u.role]}`}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </div>
                      <p className="text-gray-500 text-xs">@{u.username}</p>
                      <p className="text-gray-500 text-xs truncate">{u.email}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-yellow-400 font-bold text-sm">{u.points.toLocaleString('fr-FR')}</p>
                      <p className="text-gray-600 text-[10px]">pts</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {u.is_banned ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400">Banni</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400">Actif</span>
                      )}
                      <span className="text-gray-600 text-[10px]">
                        {new Date(u.created_at).toLocaleDateString('fr-FR')}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <select
                        value={u.role}
                        onChange={e => changeRole(u, e.target.value)}
                        disabled={actionLoading === u.id}
                        className="bg-white/[0.04] text-[10px] text-gray-400 font-semibold pl-1.5 pr-0.5 py-1 rounded-lg border border-white/[0.08] focus:outline-none disabled:opacity-50"
                      >
                        <option value="user" className="bg-gray-900">User</option>
                        <option value="moderator" className="bg-gray-900">Mod</option>
                        <option value="admin" className="bg-gray-900">Admin</option>
                      </select>
                      <button
                        onClick={() => toggleBan(u)}
                        disabled={actionLoading === u.id}
                        className={`p-1.5 rounded-lg transition-all disabled:opacity-50 ${
                          u.is_banned ? 'text-green-400 hover:bg-green-500/10' : 'text-orange-400 hover:bg-orange-500/10'
                        }`}
                      >
                        {u.is_banned ? <UserCheck className="w-3.5 h-3.5" /> : <UserX className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => openEditPoints(u)}
                        disabled={actionLoading === u.id}
                        className="p-1.5 rounded-lg text-yellow-400 hover:bg-yellow-500/10 transition-all disabled:opacity-50"
                      >
                        <Coins className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => setModal({ kind: 'deleteUser', user: u })}
                        disabled={actionLoading === u.id}
                        className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {modal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={() => setModal(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="card p-6 w-full max-w-sm relative z-10"
            >
              {modal.kind === 'editPoints' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-yellow-500/15 flex items-center justify-center">
                      <Coins className="w-5 h-5 text-yellow-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Modifier les points</h3>
                      <p className="text-gray-500 text-xs">@{modal.user.username}</p>
                    </div>
                  </div>
                  <input
                    type="number"
                    min="0"
                    value={editPointsValue}
                    onChange={e => setEditPointsValue(e.target.value)}
                    className="input-field mb-4"
                    placeholder="Nombre de points"
                    autoFocus
                  />
                  <div className="flex gap-3">
                    <button onClick={() => setModal(null)} className="btn-secondary flex-1">
                      Annuler
                    </button>
                    <button
                      onClick={savePoints}
                      disabled={actionLoading === modal.user.id}
                      className="btn-primary flex-1 disabled:opacity-50"
                    >
                      {actionLoading === modal.user.id ? 'Enregistrement...' : 'Enregistrer'}
                    </button>
                  </div>
                </>
              )}

              {modal.kind === 'banUser' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-orange-500/15 flex items-center justify-center">
                      <Shield className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Bannir @{modal.user.username}</h3>
                      <p className="text-gray-500 text-xs">{modal.user.email}</p>
                    </div>
                  </div>
                  <div className="space-y-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Durée du ban</label>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: '1h', label: '1 heure' },
                          { value: '24h', label: '24 heures' },
                          { value: '7d', label: '7 jours' },
                          { value: '30d', label: '30 jours' },
                          { value: 'permanent', label: 'Permanent' },
                        ].map(d => (
                          <button
                            key={d.value}
                            onClick={() => setBanDuration(d.value)}
                            className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all ${
                              banDuration === d.value
                                ? 'brand-gradient text-white'
                                : 'bg-white/[0.04] text-gray-400 hover:bg-white/[0.08]'
                            } ${d.value === 'permanent' ? 'col-span-2' : ''}`}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Raison (visible par l'utilisateur)</label>
                      <input
                        type="text"
                        value={banReason}
                        onChange={e => setBanReason(e.target.value)}
                        placeholder="Ex: Violation des CGU, harcèlement..."
                        className="input-field text-sm"
                      />
                    </div>
                    <div className="p-3 rounded-xl text-xs" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <p className="text-red-400 font-semibold mb-1">L'email sera bloqué</p>
                      <p className="text-gray-500">{modal.user.email} ne pourra plus créer de nouveau compte.</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => setModal(null)} className="flex-1 py-2.5 bg-white/[0.06] text-white font-semibold rounded-xl">
                      Annuler
                    </button>
                    <button
                      onClick={confirmBan}
                      disabled={actionLoading === modal.user.id}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                    >
                      {actionLoading === modal.user.id ? 'Bannissement...' : `Bannir ${banDuration === 'permanent' ? 'définitivement' : `(${banDuration})`}`}
                    </button>
                  </div>
                </>
              )}

              {modal.kind === 'deleteUser' && (
                <>
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-10 h-10 rounded-full bg-red-500/15 flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-white font-bold">Supprimer l&apos;utilisateur</h3>
                      <p className="text-gray-500 text-xs">@{modal.user.username}</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-sm mb-5">
                    Cette action est irréversible. Toutes les données de{' '}
                    <span className="text-white font-semibold">{modal.user.display_name || modal.user.username}</span>{' '}
                    seront supprimées définitivement.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={() => setModal(null)} className="btn-secondary flex-1">
                      Annuler
                    </button>
                    <button
                      onClick={deleteUser}
                      disabled={actionLoading === modal.user.id}
                      className="flex-1 py-2.5 bg-red-500 hover:bg-red-600 disabled:opacity-50 text-white font-semibold rounded-xl transition-all"
                    >
                      {actionLoading === modal.user.id ? 'Suppression...' : 'Supprimer'}
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
