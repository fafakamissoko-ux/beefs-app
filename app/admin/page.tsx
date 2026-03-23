'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Shield, Users, Flame, Coins, Eye, EyeOff, ArrowRight, Settings, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';

type ViewMode = 'admin' | 'user' | 'mediator' | 'challenger';

const VIEW_MODES: { key: ViewMode; label: string; icon: React.ReactNode; desc: string }[] = [
  { key: 'admin', label: 'Admin', icon: <Shield className="w-5 h-5" />, desc: 'Vue complète avec tous les contrôles' },
  { key: 'user', label: 'Visiteur', icon: <Eye className="w-5 h-5" />, desc: 'Voir l\'app comme un utilisateur' },
  { key: 'mediator', label: 'Médiateur', icon: <EyeOff className="w-5 h-5" />, desc: 'Vue médiateur de beefs' },
  { key: 'challenger', label: 'Challenger', icon: <Flame className="w-5 h-5" />, desc: 'Vue challenger de beefs' },
];

interface Stats {
  totalUsers: number;
  totalBeefs: number;
  totalPoints: number;
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, userRole, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [viewMode, setViewMode] = useState<ViewMode>('admin');
  const [stats, setStats] = useState<Stats>({ totalUsers: 0, totalBeefs: 0, totalPoints: 0 });
  const [loadingStats, setLoadingStats] = useState(true);
  const [switchingMode, setSwitchingMode] = useState(false);

  useEffect(() => {
    // Wait for both auth AND role to be loaded before redirecting
    if (!authLoading && userRole !== null && (!user || userRole !== 'admin')) {
      router.replace('/');
    }
  }, [user, userRole, authLoading, router]);

  useEffect(() => {
    if (user && userRole === 'admin') {
      loadViewMode();
      loadStats();
    }
  }, [user, userRole]);

  const loadViewMode = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('admin_settings')
      .select('view_mode')
      .eq('user_id', user.id)
      .single();

    if (data?.view_mode) {
      setViewMode(data.view_mode as ViewMode);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [usersRes, beefsRes, pointsRes] = await Promise.all([
        supabase.from('users').select('id', { count: 'exact', head: true }),
        supabase.from('beefs').select('id', { count: 'exact', head: true }),
        supabase.from('users').select('points'),
      ]);

      setStats({
        totalUsers: usersRes.count ?? 0,
        totalBeefs: beefsRes.count ?? 0,
        totalPoints: pointsRes.data?.reduce((sum, u) => sum + (u.points || 0), 0) ?? 0,
      });
    } catch {
      toast('Erreur lors du chargement des stats', 'error');
    } finally {
      setLoadingStats(false);
    }
  };

  const switchViewMode = async (mode: ViewMode) => {
    if (!user) return;
    setSwitchingMode(true);
    try {
      const { error } = await supabase
        .from('admin_settings')
        .upsert({ user_id: user.id, view_mode: mode, updated_at: new Date().toISOString() });

      if (error) throw error;
      setViewMode(mode);
      toast(`Mode "${VIEW_MODES.find(v => v.key === mode)?.label}" activé`, 'success');
    } catch {
      toast('Erreur lors du changement de mode', 'error');
    } finally {
      setSwitchingMode(false);
    }
  };

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
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-7 h-7 text-white" />
            <h1 className="text-2xl font-black text-white">Panneau Admin</h1>
          </div>
          <p className="text-white/70 text-sm">Centre de contrôle — Beefs</p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 -mt-4 space-y-6">
        {/* View Mode Switcher */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="card p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-gray-400" />
              <h2 className="text-white font-bold text-sm">Mode de vue</h2>
            </div>
            <span className="text-xs text-gray-500">Actuel : {VIEW_MODES.find(v => v.key === viewMode)?.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {VIEW_MODES.map((mode) => (
              <button
                key={mode.key}
                onClick={() => switchViewMode(mode.key)}
                disabled={switchingMode}
                className={`relative p-4 rounded-xl text-left transition-all duration-200 ${
                  viewMode === mode.key
                    ? 'bg-orange-500/15 border-2 border-orange-500/50'
                    : 'bg-white/[0.03] border border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.12]'
                } ${switchingMode ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className={`mb-2 ${viewMode === mode.key ? 'text-orange-400' : 'text-gray-400'}`}>
                  {mode.icon}
                </div>
                <p className={`font-bold text-sm ${viewMode === mode.key ? 'text-orange-400' : 'text-white'}`}>
                  {mode.label}
                </p>
                <p className="text-gray-500 text-xs mt-0.5">{mode.desc}</p>
                {viewMode === mode.key && (
                  <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-orange-500" />
                )}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Quick Stats — admin mode only */}
        {viewMode === 'admin' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <Coins className="w-4 h-4 text-gray-400" />
              Statistiques globales
            </h2>
            <button
              onClick={loadStats}
              className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-gray-400 hover:text-white transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingStats ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4 text-center">
              <Users className="w-5 h-5 text-blue-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">
                {loadingStats ? '—' : stats.totalUsers.toLocaleString('fr-FR')}
              </p>
              <p className="text-gray-500 text-xs mt-1">Utilisateurs</p>
            </div>
            <div className="card p-4 text-center">
              <Flame className="w-5 h-5 text-orange-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">
                {loadingStats ? '—' : stats.totalBeefs.toLocaleString('fr-FR')}
              </p>
              <p className="text-gray-500 text-xs mt-1">Beefs</p>
            </div>
            <div className="card p-4 text-center">
              <Coins className="w-5 h-5 text-yellow-400 mx-auto mb-2" />
              <p className="text-2xl font-black text-white">
                {loadingStats ? '—' : stats.totalPoints.toLocaleString('fr-FR')}
              </p>
              <p className="text-gray-500 text-xs mt-1">Points en circulation</p>
            </div>
          </div>
        </motion.div>
        )}

        {/* Admin Links (visible only in admin mode) */}
        {viewMode === 'admin' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <h2 className="text-white font-bold text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              Gestion
            </h2>

            <button
              onClick={() => router.push('/admin/retraits')}
              className="card-interactive w-full p-5 flex items-center justify-between"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                  <Coins className="w-5 h-5 text-green-400" />
                </div>
                <div className="text-left">
                  <p className="text-white font-bold">Demandes de retrait</p>
                  <p className="text-gray-500 text-xs">Gérer les paiements en attente</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-600" />
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
