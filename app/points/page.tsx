'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Coins, History, ShoppingBag, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackButton } from '@/components/AppBackButton';

type TxRow = {
  id: string;
  type: string;
  amount: number;
  balance_after: number;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  purchase: 'Achat',
  gift_sent: 'Cadeau envoyé',
  gift_received: 'Cadeau reçu',
  beef_access: 'Accès direct',
  beef_access_revenue: 'Revenu accès',
  withdrawal_hold: 'Retrait (bloqué)',
  refund: 'Remboursement',
  reward: 'Récompense',
};

export default function PointsDashboardPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/points');
      return;
    }

    let cancelled = false;
    (async () => {
      const [{ data: u }, { data: tx, error }] = await Promise.all([
        supabase.from('users').select('points').eq('id', user.id).single(),
        supabase
          .from('transactions')
          .select('id, type, amount, balance_after, description, metadata, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);
      if (cancelled) return;
      if (u) setBalance(u.points ?? 0);
      if (!error && tx) setTransactions(tx as TxRow[]);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading, router]);

  if (!user && !authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="fixed inset-0 bg-gradient-to-br from-brand-500/10 via-black to-brand-400/5 pointer-events-none" />
      <div className="relative max-w-lg mx-auto px-4 py-8">
        <AppBackButton className="mb-6" />

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center">
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Solde actuel</p>
              <p className="text-3xl font-black text-white tabular-nums">
                {loading ? '…' : (balance ?? 0).toLocaleString('fr-FR')}
                <span className="text-lg font-bold text-gray-400 ml-1">pts</span>
              </p>
            </div>
          </div>
          <Link
            href="/buy-points"
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white brand-gradient hover:opacity-95 transition-opacity"
          >
            <ShoppingBag className="w-4 h-4" />
            Acheter des points
            <ArrowRight className="w-4 h-4" />
          </Link>
        </motion.div>

        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-brand-400" />
          <h2 className="text-lg font-bold text-white">Historique</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          Achats, cadeaux, accès aux directs et autres mouvements de points.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : transactions.length === 0 ? (
          <p className="text-gray-500 text-sm py-8 text-center border border-white/[0.06] rounded-xl">
            Aucune transaction pour l’instant.
          </p>
        ) : (
          <ul className="space-y-2">
            {transactions.map((t) => (
              <li
                key={t.id}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-sm"
              >
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate">
                      {TYPE_LABEL[t.type] || t.type}
                    </p>
                    {t.description && (
                      <p className="text-gray-500 text-xs truncate">{t.description}</p>
                    )}
                    <p className="text-gray-600 text-[10px] mt-1">
                      {new Date(t.created_at).toLocaleString('fr-FR')}
                    </p>
                  </div>
                  <span
                    className={`font-bold tabular-nums flex-shrink-0 ${
                      t.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {t.amount >= 0 ? '+' : ''}
                    {t.amount.toLocaleString('fr-FR')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
