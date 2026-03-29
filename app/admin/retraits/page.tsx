'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Check, X, Clock, Euro, AlertCircle, RefreshCw, ArrowLeft } from 'lucide-react';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

interface WithdrawalRequest {
  id: string;
  user_id: string;
  amount_points: number;
  amount_euros: number;
  method: string;
  iban?: string;
  account_holder_name?: string;
  paypal_email?: string;
  mobile_number?: string;
  mobile_operator?: string;
  status: 'pending' | 'processing' | 'paid' | 'rejected';
  admin_note?: string;
  created_at: string;
  processed_at?: string;
  users?: {
    display_name: string;
    username: string;
    email: string;
  };
}

export default function AdminRetraitsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, userRole, loading: authLoading } = useAuth();
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'rejected'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [adminNote, setAdminNote] = useState<Record<string, string>>({});
  const authenticated = userRole === 'admin';

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token || ''}`,
    };
  };

  const loadRequests = async () => {
    setLoading(true);
    try {
      const params = filter !== 'all' ? `?status=${filter}` : '';
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/withdrawals/list${params}`, { headers });
      const json = await res.json();
      setRequests(json.data || []);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authenticated) loadRequests();
  }, [authenticated, filter]);

  const handleAction = async (requestId: string, action: 'paid' | 'rejected') => {
    setActionLoading(requestId);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/withdrawals/process', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          requestId,
          action,
          adminNote: adminNote[requestId] || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      loadRequests();
    } catch (err: any) {
      toast('Erreur : ' + err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  if (authLoading || userRole === null) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="card p-8 w-full max-w-sm text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-white mb-2">Accès refusé</h1>
          <p className="text-gray-500 text-sm mb-6">Vous devez être administrateur pour accéder à cette page.</p>
          <button onClick={() => router.push('/feed')} className="btn-primary">
            Retour au feed
          </button>
        </div>
      </div>
    );
  }

  const totalPending = requests.filter(r => r.status === 'pending').length;
  const totalPendingAmount = requests.filter(r => r.status === 'pending').reduce((s, r) => s + Number(r.amount_euros), 0);

  return (
    <div className="min-h-screen bg-black p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <button onClick={() => router.push('/admin')} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Dashboard admin
            </button>
            <h1 className="text-3xl font-black text-white">Gestion des Retraits</h1>
            <p className="text-gray-400 text-sm mt-1">Beefs Admin</p>
          </div>
          <button onClick={loadRequests} className="p-2 bg-white/5 hover:bg-white/10 rounded-xl text-gray-400 hover:text-white transition-all">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Clock className="w-6 h-6 text-orange-400" />
              <span className="text-orange-400 font-semibold">En attente</span>
            </div>
            <p className="text-3xl font-black text-white">{totalPending}</p>
            <p className="text-gray-400 text-sm">{totalPendingAmount.toFixed(2)}€ à verser</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <Euro className="w-6 h-6 text-green-400" />
              <span className="text-green-400 font-semibold">Total payé</span>
            </div>
            <p className="text-3xl font-black text-white">
              {requests.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount_euros), 0).toFixed(2)}€
            </p>
            <p className="text-gray-400 text-sm">{requests.filter(r => r.status === 'paid').length} virements</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(['pending', 'paid', 'rejected', 'all'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                filter === f ? 'bg-orange-500 text-white' : 'bg-white/5 text-gray-400 hover:text-white'
              }`}
            >
              {f === 'pending' ? '⏳ En attente' : f === 'paid' ? '✅ Payés' : f === 'rejected' ? '❌ Refusés' : '📋 Tous'}
            </button>
          ))}
        </div>

        {/* Requests list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Chargement...</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-12 bg-white/5 rounded-2xl text-gray-400">
            Aucune demande {filter !== 'all' ? `"${filter}"` : ''}
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map(r => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-gray-900 border border-gray-700 rounded-2xl p-6"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-bold text-lg">{parseFloat(String(r.amount_euros)).toFixed(2)}€</p>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                        r.status === 'paid' ? 'bg-green-500/20 text-green-400' :
                        r.status === 'pending' ? 'bg-orange-500/20 text-orange-400' :
                        r.status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {r.status === 'paid' ? '✅ Payé' : r.status === 'pending' ? '⏳ En attente' : r.status === 'processing' ? '🔄 En cours' : '❌ Refusé'}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm">
                      <span className="font-semibold">{r.users?.display_name || r.users?.username}</span>
                      <span className="text-gray-500"> · {r.users?.email}</span>
                    </p>
                    <p className="text-gray-500 text-xs mt-1">
                      {new Date(r.created_at).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>{r.amount_points} pts</p>
                    <p className="capitalize mt-1">{r.method.replace('_', ' ')}</p>
                  </div>
                </div>

                {/* Payment details */}
                <div className="bg-white/5 rounded-xl p-4 mb-4 text-sm">
                  {r.iban && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">IBAN</span>
                      <span className="text-white font-mono">{r.iban}</span>
                    </div>
                  )}
                  {r.account_holder_name && (
                    <div className="flex justify-between mt-1">
                      <span className="text-gray-400">Titulaire</span>
                      <span className="text-white">{r.account_holder_name}</span>
                    </div>
                  )}
                  {r.paypal_email && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">PayPal</span>
                      <span className="text-white">{r.paypal_email}</span>
                    </div>
                  )}
                  {r.mobile_number && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Mobile Money</span>
                      <span className="text-white">{r.mobile_number} ({r.mobile_operator})</span>
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                {r.status === 'pending' && (
                  <div className="space-y-3">
                    <input
                      type="text"
                      placeholder="Note admin (optionnelle — visible par l'utilisateur)"
                      value={adminNote[r.id] || ''}
                      onChange={e => setAdminNote(prev => ({ ...prev, [r.id]: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-orange-500"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleAction(r.id, 'paid')}
                        disabled={actionLoading === r.id}
                        className="flex-1 py-2.5 bg-green-500 hover:bg-green-600 disabled:opacity-50 text-white font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                      >
                        <Check className="w-4 h-4" />
                        {actionLoading === r.id ? 'Traitement...' : 'Marquer comme payé'}
                      </button>
                      <button
                        onClick={() => handleAction(r.id, 'rejected')}
                        disabled={actionLoading === r.id}
                        className="flex-1 py-2.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 disabled:opacity-50 text-red-400 font-bold rounded-xl text-sm transition-all flex items-center justify-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Refuser (rembourser pts)
                      </button>
                    </div>
                  </div>
                )}

                {r.status !== 'pending' && r.admin_note && (
                  <p className="text-gray-500 text-xs italic">Note : {r.admin_note}</p>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
