# Rapport d'audit — Phase C.2 (Double Devise : Transfert Cadeau & Portefeuille UI)

**Date d'extraction :** 2026-07-18  
**Commit de référence :** `1c5d68b feat(arena): propagate gift type through chat pipeline (Phase Z.2-B)`  
**Contrainte :** Zéro modification du code source.

---

## Synthèse diagnostic Phase C.2

### A. Moteur d'envoi de cadeau (`app/api/gifts/send/route.ts`)

| Étape | Détail |
|-------|--------|
| Auth | Bearer token → `supabaseAuth.auth.getUser()` |
| RPC | `send_gift(p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount)` via **service_role** |
| Réponse | `{ success, newBalance, giftId }` — lit `new_balance` du JSON RPC |
| **RPC sous-jacent** (`100_gift_split.sql`) | Débit expéditeur 100% (`gift_sent`) ; crédit destinataire **70%** (`gift_received`) ; 30% plateforme implicite |

**Double devise :** le débit/crédit touche uniquement `users.points` (Lingots). `lifetime_points` (Aura) est incrémenté par `update_user_balance` sur chaque flux (cf. migration 99).

### B. Portefeuille UI

| Fichier | Rôle | Points d'attention |
|---------|------|-------------------|
| `app/points/page.tsx` | Dashboard Lingots + historique | Label **« Lingots »** cohérent ; montants sans suffixe « pts » |
| `app/settings/page.tsx` (onglet wallet) | Retrait + historique | Historique affiche **`{tx.amount} pts`** (L.565) — **incohérence sémantique** |
| `components/settings/WithdrawalWizard.tsx` | Retrait euros | L.167 « Lingots » ; **L.174–176 texte cible suppression** : « Vous recevez exactement le montant demandé » |

**Texte à supprimer (Architecte) :** `WithdrawalWizard.tsx` L.174–176 — `✅ Vous recevez exactement le montant demandé — aucuns frais déduits`

**Historique « pts » :** `settings/page.tsx` L.565 `{tx.amount} pts` vs `points/page.tsx` montant nu (L.162–164)

---

## 1. Code source intégral — `app/api/gifts/send/route.ts`

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

type SendGiftResult = {
  success?: boolean;
  new_balance?: number;
  gift_id?: string;
};

function mapRpcError(message: string): { status: number; body: string } {
  const m = message.toLowerCase();
  if (m.includes('points insuffisants') || m.includes('insuffisant')) {
    return { status: 400, body: 'Points insuffisants' };
  }
  if (m.includes('destinataire invalide')) {
    return { status: 400, body: 'Destinataire invalide' };
  }
  if (m.includes('montant invalide')) {
    return { status: 400, body: 'Montant invalide' };
  }
  if (m.includes('type de cadeau invalide')) {
    return { status: 400, body: 'Type de cadeau invalide' };
  }
  if (m.includes('direct') || m.includes('live')) {
    return { status: 400, body: 'Les cadeaux ne sont possibles que pendant un direct' };
  }
  return { status: 500, body: 'Erreur lors du transfert de points' };
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const beef_id = body?.beef_id as string | undefined;
    const recipient_id = body?.recipient_id as string | undefined;
    const gift_type_id = body?.gift_type_id as string | undefined;
    const points_amount = Number(body?.points_amount);

    if (!beef_id || !recipient_id || !gift_type_id || !Number.isFinite(points_amount)) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }
    if (points_amount < 1 || points_amount > 500_000) {
      return NextResponse.json({ error: 'Montant invalide' }, { status: 400 });
    }
    if (recipient_id === user.id) {
      return NextResponse.json({ error: 'Destinataire invalide' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc('send_gift', {
      p_beef_id: beef_id,
      p_sender_id: user.id,
      p_recipient_id: recipient_id,
      p_gift_type_id: gift_type_id,
      p_points_amount: Math.floor(points_amount),
    });

    if (error) {
      console.error('[GIFT DB CRASH]', error);
      const mapped = mapRpcError(error.message || '');
      return NextResponse.json({ 
        error: mapped.body + ' | Détail DB : ' + (error.message || 'inconnu') 
      }, { status: 500 });
    }

    const row = (data as SendGiftResult) ?? {};
    const newBalance =
      typeof row.new_balance === 'number' ? row.new_balance : undefined;
    if (newBalance == null) {
      return NextResponse.json({ error: 'Réponse serveur inattendue' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      newBalance,
      giftId: row.gift_id ?? null,
    });
  } catch {
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
```

---

## 1b. Référence RPC appelée — `supabase/migrations/100_gift_split.sql` (`send_gift`)

```sql
CREATE OR REPLACE FUNCTION public.send_gift(
  p_beef_id UUID,
  p_sender_id UUID,
  p_recipient_id UUID,
  p_gift_type_id TEXT,
  p_points_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_beef RECORD;
  v_gift_type RECORD;
  v_sender_points INTEGER;
  v_debit JSONB;
  v_gift_id UUID;
  v_new_balance INTEGER;
  v_creator_share INTEGER;
BEGIN
  IF p_sender_id = p_recipient_id THEN
    RAISE EXCEPTION 'Destinataire invalide';
  END IF;
  IF p_points_amount < 1 OR p_points_amount > 500000 THEN
    RAISE EXCEPTION 'Montant invalide';
  END IF;

  -- 1. Libération du ciblage (On retire la vérification stricte du mediator_id)
  SELECT id, status, mediator_id
  INTO v_beef
  FROM beefs
  WHERE id = p_beef_id
  FOR UPDATE;
  IF NOT FOUND OR v_beef.status IS DISTINCT FROM 'live' THEN
    RAISE EXCEPTION 'Beef invalide ou non en direct';
  END IF;

  SELECT id, price, is_active
  INTO v_gift_type
  FROM gift_types
  WHERE id = p_gift_type_id;
  IF NOT FOUND OR v_gift_type.is_active = false OR v_gift_type.price != p_points_amount THEN
    RAISE EXCEPTION 'Type de cadeau invalide';
  END IF;

  SELECT points INTO v_sender_points
  FROM users
  WHERE id = p_sender_id
  FOR UPDATE;
  IF NOT FOUND OR v_sender_points < p_points_amount THEN
    RAISE EXCEPTION 'Points insuffisants';
  END IF;

  -- 2. La Taxe de l'Agora (Split 70/30)
  v_creator_share := FLOOR(p_points_amount * 0.70);

  -- Débit 100% pour l'expéditeur
  v_debit := (SELECT public.update_user_balance(
    p_sender_id,
    -p_points_amount,
    'gift_sent',
    'Cadeau envoyé (' || p_gift_type_id || ')',
    jsonb_build_object('beef_id', p_beef_id, 'recipient_id', p_recipient_id, 'gift_type_id', p_gift_type_id)
  ));

  -- Crédit 70% pour le destinataire
  PERFORM public.update_user_balance(
    p_recipient_id,
    v_creator_share,
    'gift_received',
    'Cadeau reçu pendant un direct',
    jsonb_build_object('beef_id', p_beef_id, 'sender_id', p_sender_id, 'gift_type_id', p_gift_type_id, 'platform_fee', p_points_amount - v_creator_share)
  );

  INSERT INTO gifts (beef_id, sender_id, recipient_id, gift_type_id, points_amount)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount)
  RETURNING id INTO v_gift_id;

  INSERT INTO gift_logs (beef_id, sender_id, recipient_id, gift_type_id, points_amount, gift_id)
  VALUES (p_beef_id, p_sender_id, p_recipient_id, p_gift_type_id, p_points_amount, v_gift_id);

  -- Fix du JSON key suite à l'économie absolue (newBalance vs new_balance)
  v_new_balance := COALESCE((v_debit->>'newBalance')::INTEGER, (v_debit->>'new_balance')::INTEGER);

  RETURN jsonb_build_object(
    'success', true,
    'new_balance', v_new_balance,
    'gift_id', v_gift_id
  );
END;
$$;
```

---

## 2a. Code source intégral — `app/points/page.tsx`

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { Coins, History, ShoppingBag, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AppBackButton } from '@/components/AppBackButton';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';

type Transaction = {
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
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.replace('/login?redirect=/points');
    }
  }, [user, authLoading, router]);

  const { data, isLoading: loading } = useQuery({
    queryKey: ['wallet', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      if (!user?.id) {
        return { points: 0, transactions: [] as Transaction[] };
      }

      const [{ data: pointsData }, { data: txData, error }] = await Promise.all([
        supabase.from('users').select('points').eq('id', user.id).single(),
        supabase
          .from('transactions')
          .select('id, type, amount, balance_after, description, metadata, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);

      if (error) throw error;

      return {
        points: pointsData?.points ?? 0,
        transactions: (txData ?? []) as Transaction[],
      };
    },
  });

  const points = data?.points ?? 0;
  const transactions = data?.transactions ?? [];

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="page-ambient-gradient" aria-hidden />
      <div className="relative z-[1] max-w-lg mx-auto px-4 py-8">
        <AppBackButton className="mb-6" />

        <main aria-labelledby="points-page-title">
        <h1 id="points-page-title" className="sr-only">
          Mes Lingots
        </h1>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-6 mb-8"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl brand-gradient flex items-center justify-center" aria-hidden>
              <Coins className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-gray-500 text-xs font-semibold uppercase tracking-wider">Solde actuel</p>
              <p className="text-3xl font-black text-white tabular-nums" aria-live="polite">
                {loading ? '…' : points.toLocaleString('fr-FR')}
                <span className="text-lg font-bold text-gray-400 ml-1">Lingots</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => openBuyPointsPage(router, pathname)}
            className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white brand-gradient hover:opacity-95 transition-opacity"
          >
            <ShoppingBag className="w-4 h-4" aria-hidden />
            Recharger mes Lingots
            <ArrowRight className="w-4 h-4" aria-hidden />
          </button>
        </motion.div>

        <div className="flex items-center gap-2 mb-4">
          <History className="w-5 h-5 text-brand-400" aria-hidden />
          <h2 className="text-lg font-bold text-white">Historique</h2>
        </div>
        <p className="text-gray-500 text-sm mb-4">
          Achats, cadeaux, accès aux directs et autres mouvements de Lingots.
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
        </main>
      </div>
    </div>
  );
}
```

---

## 2b. Code source intégral — `components/settings/WithdrawalWizard.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Euro, Check, ArrowLeft, AlertCircle, ChevronDown } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';

const ALL_EMAIL_PROVIDERS = [
  { label: 'Gmail', domain: 'gmail.com' },
  { label: 'Outlook', domain: 'outlook.com' },
  { label: 'Outlook FR', domain: 'outlook.fr' },
  { label: 'Hotmail', domain: 'hotmail.com' },
  { label: 'Hotmail FR', domain: 'hotmail.fr' },
  { label: 'Yahoo', domain: 'yahoo.com' },
  { label: 'Yahoo FR', domain: 'yahoo.fr' },
  { label: 'iCloud', domain: 'icloud.com' },
  { label: 'Orange', domain: 'orange.fr' },
  { label: 'SFR', domain: 'sfr.fr' },
  { label: 'Free', domain: 'free.fr' },
  { label: 'La Poste', domain: 'laposte.net' },
  { label: 'ProtonMail', domain: 'proton.me' },
  { label: 'Wanadoo', domain: 'wanadoo.fr' },
  { label: 'Live', domain: 'live.com' },
  { label: 'Live FR', domain: 'live.fr' },
  { label: 'MSN', domain: 'msn.com' },
];

function getEmailSuggestions(value: string) {
  const atIndex = value.indexOf('@');
  if (atIndex === -1) return [];
  const typed = value.slice(atIndex + 1).toLowerCase();
  const username = value.slice(0, atIndex);
  return ALL_EMAIL_PROVIDERS
    .filter((p) => typed === '' || p.domain.startsWith(typed))
    .slice(0, 6)
    .map((p) => `${username}@${p.domain}`);
}

const COUNTRY_CODES = [
  { iso: 'fr', name: 'France', code: '+33' },
  { iso: 'be', name: 'Belgique', code: '+32' },
  { iso: 'ch', name: 'Suisse', code: '+41' },
  { iso: 'ca', name: 'Canada', code: '+1' },
  { iso: 'us', name: 'États-Unis', code: '+1' },
  { iso: 'gb', name: 'Royaume-Uni', code: '+44' },
  { iso: 'de', name: 'Allemagne', code: '+49' },
  { iso: 'it', name: 'Italie', code: '+39' },
  { iso: 'es', name: 'Espagne', code: '+34' },
  { iso: 'pt', name: 'Portugal', code: '+351' },
  { iso: 'sn', name: 'Sénégal', code: '+221' },
  { iso: 'ci', name: "Côte d'Ivoire", code: '+225' },
  { iso: 'ml', name: 'Mali', code: '+223' },
  { iso: 'bf', name: 'Burkina Faso', code: '+226' },
  { iso: 'gn', name: 'Guinée', code: '+224' },
  { iso: 'tg', name: 'Togo', code: '+228' },
  { iso: 'bj', name: 'Bénin', code: '+229' },
  { iso: 'cm', name: 'Cameroun', code: '+237' },
  { iso: 'ga', name: 'Gabon', code: '+241' },
  { iso: 'cg', name: 'Congo', code: '+242' },
  { iso: 'ma', name: 'Maroc', code: '+212' },
  { iso: 'dz', name: 'Algérie', code: '+213' },
  { iso: 'tn', name: 'Tunisie', code: '+216' },
  { iso: 'br', name: 'Brésil', code: '+55' },
  { iso: 'in', name: 'Inde', code: '+91' },
];

type WithdrawalRequestRow = {
  id: string;
  amount_euros: string | number;
  method: string;
  created_at: string;
  status: string;
  admin_note?: string | null;
};

export interface WithdrawalWizardProps {
  user: User;
  points: number;
  onPointsDeducted: (euros: number) => void;
}

export function WithdrawalWizard({ user, points, onPointsDeducted }: WithdrawalWizardProps) {
  const [withdrawalStep, setWithdrawalStep] = useState<'summary' | 'form' | 'confirm' | 'success'>('summary');
  const [withdrawalMethod, setWithdrawalMethod] = useState<string>('');
  const [withdrawalAmountEuros, setWithdrawalAmountEuros] = useState<number>(20);
  const [withdrawalFields, setWithdrawalFields] = useState<Record<string, string>>({});
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string>('');
  const [withdrawalHistory, setWithdrawalHistory] = useState<WithdrawalRequestRow[]>([]);
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+33');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

  useEffect(() => {
    if (!user.id) return;
    supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setWithdrawalHistory((data as WithdrawalRequestRow[]) || []));
  }, [user.id]);

  const handleWithdrawalSubmit = async () => {
    setWithdrawalLoading(true);
    setWithdrawalError('');

    const amountPoints = withdrawalAmountEuros * 100;

    const body: Record<string, string | number> = {
      userId: user.id,
      amountPoints,
      method: withdrawalMethod,
    };

    if (withdrawalMethod === 'iban') {
      body.iban = withdrawalFields.iban;
      body.accountHolderName = withdrawalFields.accountHolderName;
    } else if (withdrawalMethod === 'paypal') {
      body.paypalEmail = withdrawalFields.paypalEmail;
    } else {
      body.mobileNumber = withdrawalFields.mobileNumber;
      body.mobileOperator = withdrawalMethod;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      onPointsDeducted(withdrawalAmountEuros);
      setWithdrawalStep('success');
    } catch (err: unknown) {
      setWithdrawalError(err instanceof Error ? err.message : 'Erreur serveur');
    } finally {
      setWithdrawalLoading(false);
    }
  };

  const resetWizard = () => {
    setWithdrawalStep('summary');
    setWithdrawalError('');
    setWithdrawalFields({});
    setWithdrawalMethod('');
    setWithdrawalAmountEuros(20);
  };

  return (
    <div className="w-full rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8 shadow-2xl backdrop-blur-md">
      {/* Balance card */}
      <div className="rounded-[2rem] border border-green-500/20 bg-green-950/20 p-6 mb-6 backdrop-blur-md">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-white/50 text-sm font-medium mb-1">Solde disponible</p>
            <p className="text-4xl font-black text-white">{(points / 100).toFixed(2)}€</p>
            <p className="text-white/40 text-xs mt-1">{points} Lingots · 100 Lingots = 1€</p>
          </div>
          <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center">
            <Euro className="w-8 h-8 text-green-400" />
          </div>
        </div>
        <div className="mt-4 p-3 rounded-2xl border border-green-500/20 bg-green-500/10">
          <p className="text-green-400 text-xs font-semibold">
            ✅ Vous recevez exactement le montant demandé — aucuns frais déduits
          </p>
        </div>
      </div>

      {points < 2000 && (
        <div className="rounded-2xl border border-brand-500/30 bg-brand-500/10 p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-brand-300 font-semibold text-sm">Minimum non atteint</p>
            <p className="text-white/50 text-sm">
              Il vous faut au moins <strong>20€</strong> (2 000 Lingots) pour retirer. Il vous manque{' '}
              {(Math.max(0, 2000 - points) / 100).toFixed(0)}€.
            </p>
          </div>
        </div>
      )}

      {withdrawalStep === 'summary' && points >= 2000 && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h3 className="text-white font-bold text-lg mb-4">Retirer mes gains</h3>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-4">
            <label className="text-white/70 text-sm font-semibold block mb-3">Combien voulez-vous retirer ?</label>
            <div className="flex items-center gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 focus-within:border-green-500/50 transition-colors">
              <span className="text-white/40 font-bold text-lg">€</span>
              <input
                type="number"
                min={20}
                max={Math.floor(points / 100)}
                step={1}
                value={withdrawalAmountEuros}
                onChange={(e) => {
                  const val = Math.min(Number(e.target.value), Math.floor(points / 100));
                  setWithdrawalAmountEuros(val);
                }}
                className="flex-1 bg-transparent text-white text-lg font-bold focus:outline-none"
                placeholder="20"
              />
            </div>
            <p className="text-white/40 text-xs mt-2">
              = {withdrawalAmountEuros * 100} Lingots · Solde restant après retrait :{' '}
              {(points / 100 - withdrawalAmountEuros).toFixed(2)}€
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-2">
            <label className="text-white/70 text-sm font-semibold block mb-3">
              Méthode de retrait
              {!withdrawalMethod && <span className="text-brand-400 ml-2 text-xs">← Sélectionnez une méthode</span>}
            </label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'iban', label: '🏦 Virement bancaire (IBAN)', desc: 'Europe — 3-5 jours ouvrés' },
                { id: 'paypal', label: '💙 PayPal', desc: 'Mondial — 1-2 jours ouvrés' },
                { id: 'orange_money', label: '🟠 Orange Money', desc: 'Afrique francophone — 24h' },
                { id: 'wave', label: '🔵 Wave', desc: "Sénégal, Côte d'Ivoire — 24h" },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setWithdrawalMethod(m.id)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl text-left transition-all border ${
                    withdrawalMethod === m.id
                      ? 'border-green-500/50 bg-green-500/10 text-white'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-white/25'
                  }`}
                >
                  <div>
                    <p className="font-semibold text-sm">{m.label}</p>
                    <p className="text-xs text-white/40">{m.desc}</p>
                  </div>
                  {withdrawalMethod === m.id && <Check className="w-5 h-5 text-green-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            disabled={!withdrawalMethod || withdrawalAmountEuros < 20}
            onClick={() => setWithdrawalStep('form')}
            className="w-full py-4 mt-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold transition-all active:scale-[0.98]"
          >
            {!withdrawalMethod
              ? 'Sélectionnez une méthode pour continuer'
              : `Continuer — Retirer ${withdrawalAmountEuros}€ →`}
          </button>
        </motion.div>
      )}

      {withdrawalStep === 'form' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <button
            type="button"
            onClick={() => setWithdrawalStep('summary')}
            className="flex items-center gap-2 text-white/40 hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </button>
          <h3 className="text-white font-bold text-lg mb-4">Coordonnées pour {withdrawalAmountEuros}€</h3>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-6 space-y-4">
            {withdrawalMethod === 'iban' && (
              <>
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">Nom du titulaire du compte</label>
                  <input
                    type="text"
                    placeholder="Prénom Nom"
                    value={withdrawalFields.accountHolderName || ''}
                    onChange={(e) => setWithdrawalFields((p) => ({ ...p, accountHolderName: e.target.value }))}
                    className="w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                <div>
                  <label className="text-white/70 text-sm font-semibold block mb-2">IBAN</label>
                  <input
                    type="text"
                    placeholder="FR76 1234 5678 9012 3456 7890 123"
                    value={withdrawalFields.iban || ''}
                    onChange={(e) => setWithdrawalFields((p) => ({ ...p, iban: e.target.value.toUpperCase() }))}
                    className="w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors font-mono"
                  />
                </div>
              </>
            )}
            {withdrawalMethod === 'paypal' && (
              <div className="relative">
                <label className="text-white/70 text-sm font-semibold block mb-2">Adresse email PayPal</label>
                <input
                  type="email"
                  placeholder="votre@email.com"
                  value={withdrawalFields.paypalEmail || ''}
                  autoComplete="off"
                  onChange={(e) => {
                    setWithdrawalFields((p) => ({ ...p, paypalEmail: e.target.value }));
                    setShowEmailSuggestions(e.target.value.includes('@'));
                  }}
                  onFocus={() => setShowEmailSuggestions((withdrawalFields.paypalEmail || '').includes('@'))}
                  onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 150)}
                  className="w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
                />
                {showEmailSuggestions && getEmailSuggestions(withdrawalFields.paypalEmail || '').length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 rounded-2xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl z-dropdown py-1 overflow-hidden">
                    {getEmailSuggestions(withdrawalFields.paypalEmail || '').map((suggestion, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={() => {
                          setWithdrawalFields((p) => ({ ...p, paypalEmail: suggestion }));
                          setShowEmailSuggestions(false);
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-white/10 transition-colors text-white/70"
                      >
                        <span>{suggestion}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {['orange_money', 'wave'].includes(withdrawalMethod) && (
              <div>
                <label className="text-white/70 text-sm font-semibold block mb-2">Numéro de téléphone Mobile Money</label>
                <div className="flex gap-2">
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowCountryDropdown((v) => !v)}
                      className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 hover:border-white/25 px-3 py-3 text-white text-sm font-semibold whitespace-nowrap transition-colors"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`https://flagcdn.com/20x15/${COUNTRY_CODES.find((c) => c.code === phoneCountryCode)?.iso || 'fr'}.png`}
                        alt=""
                        width={20}
                        height={15}
                        className="rounded-sm"
                      />
                      {phoneCountryCode}
                      <ChevronDown className="w-3 h-3 text-white/40" />
                    </button>
                    {showCountryDropdown && (
                      <div className="absolute left-0 top-full mt-1 rounded-2xl border border-white/10 bg-black/90 backdrop-blur-md shadow-2xl z-dropdown w-56 py-1 max-h-72 overflow-y-auto">
                        {COUNTRY_CODES.map((c, i) => (
                          <button
                            key={i}
                            type="button"
                            onClick={() => {
                              setPhoneCountryCode(c.code);
                              setShowCountryDropdown(false);
                              setWithdrawalFields((prev) => ({ ...prev, mobileNumber: `${c.code}${phoneNumber}` }));
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/10 transition-colors ${phoneCountryCode === c.code ? 'text-green-400 font-semibold' : 'text-white/70'}`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://flagcdn.com/20x15/${c.iso}.png`}
                              alt={c.name}
                              width={20}
                              height={15}
                              className="rounded-sm flex-shrink-0"
                            />
                            <div>
                              <p className="font-medium">{c.name}</p>
                              <p className="text-white/40 text-xs">{c.code}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <input
                    type="tel"
                    placeholder="77 000 00 00"
                    value={phoneNumber}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/[^\d\s]/g, '');
                      setPhoneNumber(digits);
                      setWithdrawalFields((p) => ({
                        ...p,
                        mobileNumber: `${phoneCountryCode}${digits.replace(/\s/g, '')}`,
                      }));
                    }}
                    className="flex-1 rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors"
                  />
                </div>
                {phoneNumber && (
                  <p className="text-green-400 text-xs mt-2">
                    Numéro complet : <strong>{phoneCountryCode} {phoneNumber}</strong>
                  </p>
                )}
              </div>
            )}
          </div>

          {withdrawalError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 mb-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-300 text-sm">{withdrawalError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setWithdrawalError('');
              if (withdrawalMethod === 'iban') {
                if (!withdrawalFields.accountHolderName?.trim()) {
                  setWithdrawalError('Veuillez entrer le nom du titulaire du compte.');
                  return;
                }
                if (!withdrawalFields.iban?.trim() || withdrawalFields.iban.length < 15) {
                  setWithdrawalError('Veuillez entrer un IBAN valide.');
                  return;
                }
              }
              if (withdrawalMethod === 'paypal') {
                if (!withdrawalFields.paypalEmail?.trim() || !withdrawalFields.paypalEmail.includes('@')) {
                  setWithdrawalError('Veuillez entrer une adresse email PayPal valide.');
                  return;
                }
              }
              if (['orange_money', 'wave'].includes(withdrawalMethod)) {
                if (!withdrawalFields.mobileNumber?.trim() || withdrawalFields.mobileNumber.length < 8) {
                  setWithdrawalError('Veuillez entrer un numéro de téléphone valide.');
                  return;
                }
              }
              setWithdrawalStep('confirm');
            }}
            className="w-full py-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold transition-all active:scale-[0.98]"
          >
            Vérifier ma demande →
          </button>
        </motion.div>
      )}

      {withdrawalStep === 'confirm' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <button
            type="button"
            onClick={() => setWithdrawalStep('form')}
            className="flex items-center gap-2 text-white/40 hover:text-white mb-4 text-sm"
          >
            <ArrowLeft className="w-4 h-4" /> Modifier
          </button>
          <h3 className="text-white font-bold text-lg mb-4">Confirmer le retrait</h3>

          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-5 mb-6 space-y-3">
            <div className="flex justify-between">
              <span className="text-white/50 text-sm">Montant demandé</span>
              <span className="text-white font-bold">{withdrawalAmountEuros}€</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 text-sm">Frais déduits</span>
              <span className="text-green-400 font-bold">0€</span>
            </div>
            <div className="border-t border-white/10 pt-3 flex justify-between items-center">
              <span className="text-white font-bold">Vous recevez</span>
              <span className="text-2xl font-black text-green-400">{withdrawalAmountEuros}€</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/50 text-sm">Méthode</span>
              <span className="text-white text-sm capitalize">{withdrawalMethod.replace('_', ' ')}</span>
            </div>
            {withdrawalFields.iban && (
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">IBAN</span>
                <span className="text-white text-sm font-mono">••••{withdrawalFields.iban.slice(-4)}</span>
              </div>
            )}
            {withdrawalFields.paypalEmail && (
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">PayPal</span>
                <span className="text-white text-sm">{withdrawalFields.paypalEmail}</span>
              </div>
            )}
            {withdrawalFields.mobileNumber && (
              <div className="flex justify-between">
                <span className="text-white/50 text-sm">Numéro</span>
                <span className="text-white text-sm">{withdrawalFields.mobileNumber}</span>
              </div>
            )}
            <p className="text-white/40 text-xs pt-2">⏱ Traitement sous 5-7 jours ouvrés</p>
          </div>

          {withdrawalError && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 mb-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <p className="text-red-300 text-sm">{withdrawalError}</p>
            </div>
          )}

          <button
            type="button"
            onClick={() => void handleWithdrawalSubmit()}
            disabled={withdrawalLoading}
            className="w-full py-4 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold transition-all flex items-center justify-center gap-2 active:scale-[0.98]"
          >
            {withdrawalLoading ? (
              <>
                <span className="animate-spin inline-block">⏳</span> Envoi en cours...
              </>
            ) : (
              <>✅ Confirmer — Recevoir {withdrawalAmountEuros}€</>
            )}
          </button>
        </motion.div>
      )}

      {withdrawalStep === 'success' && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
          <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-green-400" />
          </div>
          <h3 className="text-2xl font-black text-white mb-2">Demande envoyée !</h3>
          <p className="text-white/50 mb-2">
            Votre retrait de <span className="text-green-400 font-bold">{withdrawalAmountEuros}€</span> est en cours de
            traitement.
          </p>
          <p className="text-white/40 text-sm mb-6">
            Un email de confirmation vous sera envoyé une fois le virement effectué (5-7 jours ouvrés).
          </p>
          <button
            type="button"
            onClick={resetWizard}
            className="px-6 py-3 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold transition-all"
          >
            Faire un autre retrait
          </button>
        </motion.div>
      )}

      {withdrawalHistory.length > 0 && withdrawalStep === 'summary' && (
        <div className="mt-8 pt-6 border-t border-white/10">
          <h3 className="text-white font-bold text-lg mb-4">Historique des retraits</h3>
          <div className="space-y-3">
            {withdrawalHistory.map((r) => (
              <div
                key={r.id}
                className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-4 flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-semibold">{parseFloat(String(r.amount_euros)).toFixed(2)}€</p>
                  <p className="text-white/40 text-xs">
                    {r.method.replace('_', ' ')} · {new Date(r.created_at).toLocaleDateString('fr-FR')}
                  </p>
                  {r.admin_note && <p className="text-white/30 text-xs italic mt-1">{r.admin_note}</p>}
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold ${
                    r.status === 'paid'
                      ? 'bg-green-500/20 text-green-400'
                      : r.status === 'pending'
                        ? 'bg-brand-500/20 text-brand-400'
                        : r.status === 'processing'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-red-500/20 text-red-400'
                  }`}
                >
                  {r.status === 'paid'
                    ? '✅ Payé'
                    : r.status === 'pending'
                      ? '⏳ En attente'
                      : r.status === 'processing'
                        ? '🔄 En cours'
                        : '❌ Refusé'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```r

---

## 2c. Code source intégral — `app/settings/page.tsx` (onglet Portefeuille + historique)

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  Eye,
  Shield,
  Bell,
  X,
  Check,
  LayoutTemplate,
  Type,
  Zap,
  MessageSquare,
  UserPlus,
  Gift,
  Flame,
  History,
  Sparkles,
  Wallet,
  Settings as SettingsIcon,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import { AppBackButton } from '@/components/AppBackButton';
import { WithdrawalWizard } from '@/components/settings/WithdrawalWizard';
import { ProfileSettingsForm } from '@/components/settings/ProfileSettingsForm';
import { EmailSettingsForm } from '@/components/settings/EmailSettingsForm';
import { PasswordSettingsForm } from '@/components/settings/PasswordSettingsForm';

const SETTINGS_GLASS_CARD =
  'w-full rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8 shadow-2xl backdrop-blur-md';
const SETTINGS_GLASS_CARD_DANGER =
  'w-full rounded-[2rem] border border-red-500/20 bg-red-950/20 p-6 md:p-8 shadow-2xl backdrop-blur-md';
const SETTINGS_INPUT =
  'w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors';
const SETTINGS_BTN_DANGER =
  'w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20 active:scale-[0.98]';

type InvitationPrivacy = 'everyone' | 'following' | 'nobody';

type SettingTab = 'profile' | 'security' | 'wallet' | 'preferences' | 'danger';

type PointTx = {
  id: string;
  amount: number;
  balance_after: number;
  type: string;
  description: string | null;
  created_at: string;
};

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const { preferences, updatePreferences } = useTheme();

  const [activeTab, setActiveTab] = useState<SettingTab>('profile');
  const [username, setUsername] = useState('');
  const [invitationPrivacy, setInvitationPrivacy] = useState<InvitationPrivacy>('everyone');
  const [privacyUpdating, setPrivacyUpdating] = useState<InvitationPrivacy | null>(null);
  const [profileFormData, setProfileFormData] = useState<{ display_name: string; bio: string }>({
    display_name: '',
    bio: '',
  });
  const [accentColor, setAccentColor] = useState('#E83A14');
  const [walletPoints, setWalletPoints] = useState(0);
  const [notifPrefs, setNotifPrefs] = useState({
    messages: true,
    follows: true,
    invites: true,
    beefs_live: true,
    gifts: true,
    aura: true,
    browser: true,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [pointTx, setPointTx] = useState<PointTx[]>([]);

  const loadProfile = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data } = await supabase
        .from('users')
        .select('username, display_name, bio, accent_color, invitation_privacy, points')
        .eq('id', user.id)
        .single();

      if (data) {
        const privacyRaw = data.invitation_privacy;
        const privacy: InvitationPrivacy =
          privacyRaw === 'following' || privacyRaw === 'nobody' ? privacyRaw : 'everyone';

        setUsername(data.username || '');
        setInvitationPrivacy(privacy);
        setProfileFormData({
          display_name: data.display_name || '',
          bio: data.bio || '',
        });
        if (data.accent_color) setAccentColor(data.accent_color);
        setWalletPoints(Number(data.points) || 0);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?redirect=/settings');
      return;
    }
    void loadProfile();
    try {
      const saved = localStorage.getItem('beefs_notif_prefs');
      const parsed = saved ? (JSON.parse(saved) as Partial<typeof notifPrefs>) : {};
      setNotifPrefs((prev) => ({
        ...prev,
        ...parsed,
        aura: typeof parsed.aura === 'boolean' ? parsed.aura : prev.aura,
      }));
    } catch {}
  }, [user, authLoading, router, loadProfile]);

  useEffect(() => {
    if (!user?.id) {
      setPointTx([]);
      return;
    }
    void supabase
      .from('transactions')
      .select('id, amount, balance_after, type, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) setPointTx(data as PointTx[]);
      });
  }, [user?.id]);

  const handleUpdatePrivacy = async (newPrivacy: InvitationPrivacy) => {
    if (!user || privacyUpdating) return;

    setPrivacyUpdating(newPrivacy);
    try {
      const { error } = await supabase
        .from('users')
        .update({ invitation_privacy: newPrivacy })
        .eq('id', user.id);

      if (error) throw error;

      setInvitationPrivacy(newPrivacy);
    } catch (error: unknown) {
      console.error('Erreur Bouclier Anti-Spam:', error);
      setMessage({ type: 'error', text: 'Échec de la mise à jour du bouclier.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setPrivacyUpdating(null);
    }
  };

  const toggleNotifPref = (key: keyof typeof notifPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    try {
      localStorage.setItem('beefs_notif_prefs', JSON.stringify(updated));
    } catch {}
  };

  const handleDeleteAccount = async () => {
    if (
      !confirm(
        'Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.',
      )
    ) {
      return;
    }
    if (
      !confirm(
        'Dernière confirmation : toutes vos données (beefs, messages, points) seront perdues. Continuer ?',
      )
    ) {
      return;
    }

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token || ''}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur serveur');
      }
      await signOut();
      router.push('/');
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors de la suppression du compte';
      setMessage({ type: 'error', text: msg });
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
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
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  const profileFormInitial = {
    display_name:
      (typeof user.user_metadata?.display_name === 'string'
        ? user.user_metadata.display_name
        : profileFormData.display_name) || null,
    bio:
      (typeof user.user_metadata?.bio === 'string' ? user.user_metadata.bio : profileFormData.bio) ||
      null,
    accent_color: null as string | null,
  };

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center gap-4 mb-8">
          <AppBackButton />
          <div className="flex-1">
            <h1 className="text-4xl font-black text-white">Paramètres</h1>
            <p className="text-gray-400">Gérez votre compte et vos préférences</p>
          </div>
        </div>

        <AnimatePresence>
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              role={message.type === 'error' ? 'alert' : 'status'}
              aria-live="polite"
              className={`mb-6 p-4 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {message.type === 'success' ? (
                  <Check className="w-5 h-5" aria-hidden />
                ) : (
                  <X className="w-5 h-5" aria-hidden />
                )}
                <span className="font-semibold">{message.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col md:grid md:grid-cols-[16rem_1fr] gap-6 md:gap-8">
          <nav
            aria-label="Sections des paramètres"
            className="flex md:flex-col flex-row gap-2 md:gap-1 overflow-x-auto hide-scrollbar shrink-0 md:w-64 pb-1 md:pb-0"
          >
            {(
              [
                { id: 'profile' as const, label: 'Profil', icon: User },
                { id: 'security' as const, label: 'Sécurité', icon: Shield },
                { id: 'wallet' as const, label: 'Portefeuille', icon: Wallet },
                { id: 'preferences' as const, label: 'Préférences', icon: SettingsIcon },
                { id: 'danger' as const, label: 'Zone de danger', icon: AlertTriangle, danger: true },
              ] as const
            ).map(({ id, label, icon: Icon, ...rest }) => {
              const isActive = activeTab === id;
              const isDanger = 'danger' in rest && rest.danger;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  aria-current={isActive ? 'page' : undefined}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-colors shrink-0 md:w-full border ${
                    isActive
                      ? 'bg-white/10 text-white border-white/20'
                      : 'border-transparent text-white/40 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : isDanger ? 'text-red-400' : 'text-white/40'
                    }`}
                    aria-hidden
                  />
                  {label}
                </button>
              );
            })}
          </nav>

          <div className="space-y-6 min-w-0">
            {activeTab === 'profile' && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-cyan-400" />
                    </div>
                    <h3 className="text-white font-bold text-xl">Informations en lecture seule</h3>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label
                        htmlFor="settings-username"
                        className="block text-white font-semibold mb-2 text-sm"
                      >
                        Nom d&apos;utilisateur
                      </label>
                      <input
                        id="settings-username"
                        type="text"
                        value={username ? `@${username}` : ''}
                        disabled
                        readOnly
                        aria-describedby="settings-username-hint"
                        className={`${SETTINGS_INPUT} text-white/40 cursor-not-allowed opacity-60`}
                      />
                      <p id="settings-username-hint" className="text-gray-500 text-xs mt-1">
                        Le nom d&apos;utilisateur ne peut pas être modifié
                      </p>
                    </div>

                    <div>
                      <label
                        htmlFor="settings-email-readonly"
                        className="block text-white font-semibold mb-2 text-sm"
                      >
                        Adresse e-mail
                      </label>
                      <input
                        id="settings-email-readonly"
                        type="email"
                        value={user.email ?? ''}
                        disabled
                        readOnly
                        aria-describedby="settings-email-hint"
                        className={`${SETTINGS_INPUT} text-white/40 cursor-not-allowed opacity-60`}
                      />
                      <p id="settings-email-hint" className="text-gray-500 text-xs mt-1">
                        Pour modifier ton e-mail, rends-toi dans l&apos;onglet Sécurité.
                      </p>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <h3 className="text-white font-bold text-xl mb-6">Modifier le profil</h3>
                  <ProfileSettingsForm
                    key={`${profileFormData.display_name}-${profileFormData.bio}`}
                    userId={user.id}
                    initialData={profileFormInitial}
                    onSaved={({ display_name, bio }) =>
                      setProfileFormData({
                        display_name: display_name ?? '',
                        bio: bio ?? '',
                      })
                    }
                  />
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.16 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <div className="mb-6 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-500/20">
                      <Shield className="h-5 w-5 text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-white">Bouclier Anti-Spam</h3>
                      <p className="mt-0.5 text-xs text-gray-400">
                        Qui peut te convoquer ou te demander d&apos;arbitrer ?
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {(
                      [
                        {
                          id: 'everyone' as const,
                          label: 'Tout le monde',
                          desc: "N'importe qui peut te défier (Ouvert)",
                        },
                        {
                          id: 'following' as const,
                          label: 'Mes Abonnements',
                          desc: 'Seuls les utilisateurs que tu suis peuvent te défier',
                        },
                        {
                          id: 'nobody' as const,
                          label: 'Personne',
                          desc: 'Verrouillage total (Mode Ne pas déranger)',
                        },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleUpdatePrivacy(opt.id)}
                        disabled={!!privacyUpdating}
                        className={`flex w-full items-center justify-between rounded-xl border p-4 transition-all ${
                          invitationPrivacy === opt.id
                            ? 'border-red-500/50 bg-red-500/10 text-white'
                            : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="text-left">
                          <p
                            className={`text-sm font-bold ${
                              invitationPrivacy === opt.id ? 'text-red-400' : 'text-gray-300'
                            }`}
                          >
                            {opt.label}
                          </p>
                          <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                        </div>
                        {invitationPrivacy === opt.id ? (
                          <Check className="h-5 w-5 text-red-400" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                </motion.div>
              </>
            )}

            {activeTab === 'security' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className={`${SETTINGS_GLASS_CARD} space-y-6`}
              >
                <div className="mb-8 rounded-[2rem] border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="mb-6 text-lg font-black text-white">Changer d&apos;e-mail</h3>
                  <EmailSettingsForm currentEmail={user.email} />
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-6">
                  <h3 className="mb-6 text-lg font-black text-white">Changer de mot de passe</h3>
                  <PasswordSettingsForm />
                </div>
              </motion.div>
            )}

            {activeTab === 'wallet' && (
              <div className="space-y-6">
                <WithdrawalWizard
                  user={user}
                  points={walletPoints}
                  onPointsDeducted={(euros) => setWalletPoints((prev) => prev - euros * 100)}
                />
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.12 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-brand-500/20 rounded-full flex items-center justify-center">
                      <History className="w-5 h-5 text-brand-400" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-white font-bold text-xl">Historique des Lingots</h3>
                      <p className="text-gray-500 text-xs mt-0.5">
                        Achats, accès aux directs, cadeaux, retraits (50 derniers)
                      </p>
                    </div>
                    <a
                      href="/buy-points"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-brand-400 hover:text-brand-300 whitespace-nowrap"
                    >
                      Recharger les Lingots
                    </a>
                  </div>
                  {pointTx.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4 text-center">
                      Aucun mouvement enregistré pour l&apos;instant.
                    </p>
                  ) : (
                    <ul className="space-y-2 max-h-80 overflow-y-auto hide-scrollbar pr-1">
                      {pointTx.map((tx) => (
                        <li
                          key={tx.id}
                          className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.06] last:border-0 text-sm"
                        >
                          <div className="min-w-0">
                            <p className="text-white font-medium truncate">
                              {tx.description || tx.type}
                            </p>
                            <p className="text-gray-500 text-[11px]">
                              {new Date(tx.created_at).toLocaleString('fr-FR', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                              {' · '}
                              <span className="text-gray-600">{tx.type}</span>
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <span
                              className={
                                tx.amount >= 0
                                  ? 'text-emerald-400 font-bold'
                                  : 'text-red-400 font-bold'
                              }
                            >
                              {tx.amount >= 0 ? '+' : ''}
                              {tx.amount} pts
                            </span>
                            <p className="text-gray-600 text-[10px]">solde {tx.balance_after}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.div>
              </div>
            )}

            {activeTab === 'preferences' && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                      <LayoutTemplate className="w-5 h-5 text-cobalt-400" />
                    </div>
                    <h3 className="text-white font-bold text-xl">Affichage & accessibilité</h3>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <p
                        id="accent-color-label"
                        className="block text-white font-semibold mb-3 text-sm"
                      >
                        Couleur d&apos;accent
                      </p>
                      <div
                        className="flex items-center gap-3 flex-wrap"
                        role="group"
                        aria-labelledby="accent-color-label"
                      >
                        {[
                          '#E83A14',
                          '#FF6B2C',
                          '#EF4444',
                          '#F59E0B',
                          '#10B981',
                          '#3B82F6',
                          '#8B5CF6',
                          '#EC4899',
                        ].map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={async () => {
                              setAccentColor(color);
                              await supabase
                                .from('users')
                                .update({ accent_color: color })
                                .eq('id', user.id);
                            }}
                            aria-label={`Couleur d'accent ${color}`}
                            aria-pressed={accentColor === color}
                            className={`w-9 h-9 rounded-full transition-all ${
                              accentColor === color
                                ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110'
                                : 'hover:scale-110'
                            }`}
                            style={{ background: color }}
                          />
                        ))}
                        <label className="relative cursor-pointer">
                          <span className="sr-only">Choisir une couleur personnalisée</span>
                          <input
                            type="color"
                            value={accentColor}
                            onChange={async (e) => {
                              setAccentColor(e.target.value);
                              await supabase
                                .from('users')
                                .update({ accent_color: e.target.value })
                                .eq('id', user.id);
                            }}
                            aria-label="Couleur d'accent personnalisée"
                            className="absolute inset-0 w-9 h-9 opacity-0 cursor-pointer"
                          />
                          <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-400 hover:border-white hover:text-white transition-all">
                            <span className="text-xs font-bold">+</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    <div>
                      <label className="block text-white font-semibold mb-3 text-sm flex items-center gap-2">
                        <Type className="w-4 h-4" />
                        Taille du texte
                      </label>
                      <div className="grid grid-cols-3 gap-2" role="group" aria-label="Taille du texte">
                        {(
                          [
                            { value: 'small' as const, label: 'Petit' },
                            { value: 'normal' as const, label: 'Normal' },
                            { value: 'large' as const, label: 'Grand' },
                          ] as const
                        ).map(({ value, label }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => updatePreferences({ fontSize: value })}
                            aria-pressed={preferences.fontSize === value}
                            className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
                              preferences.fontSize === value
                                ? 'brand-gradient text-white shadow-glow'
                                : 'bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.08]'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Zap className="w-5 h-5 text-ember-400" aria-hidden />
                        <div>
                          <p id="reduce-anim-label" className="text-white font-semibold text-sm">
                            Réduire les animations
                          </p>
                          <p className="text-gray-500 text-xs">Limite les mouvements et transitions</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={preferences.reduceAnimations}
                        aria-labelledby="reduce-anim-label"
                        onClick={() =>
                          updatePreferences({ reduceAnimations: !preferences.reduceAnimations })
                        }
                        className={`relative w-12 h-7 rounded-full transition-all ${
                          preferences.reduceAnimations ? 'bg-cyan-500' : 'bg-white/10'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                            preferences.reduceAnimations ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Eye className="w-5 h-5 text-cobalt-400" aria-hidden />
                        <div>
                          <p id="high-contrast-label" className="text-white font-semibold text-sm">
                            Contraste élevé
                          </p>
                          <p className="text-gray-500 text-xs">Augmente le contraste des textes</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={preferences.highContrast}
                        aria-labelledby="high-contrast-label"
                        onClick={() =>
                          updatePreferences({ highContrast: !preferences.highContrast })
                        }
                        className={`relative w-12 h-7 rounded-full transition-all ${
                          preferences.highContrast ? 'bg-cyan-500' : 'bg-white/10'
                        }`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                            preferences.highContrast ? 'translate-x-5' : ''
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.17 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                      <Bell className="w-5 h-5 text-cobalt-400" />
                    </div>
                    <h3 className="text-white font-bold text-xl">Radar & alertes</h3>
                  </div>

                  <div className="space-y-4">
                    {(
                      [
                        {
                          key: 'messages' as const,
                          icon: MessageSquare,
                          color: 'text-cobalt-400',
                          label: 'Messages privés',
                          desc: 'Nouveaux messages reçus',
                        },
                        {
                          key: 'follows' as const,
                          icon: UserPlus,
                          color: 'text-prestige-gold',
                          label: 'Abonnements',
                          desc: "Quand quelqu'un te suit",
                        },
                        {
                          key: 'invites' as const,
                          icon: Flame,
                          color: 'text-ember-400',
                          label: 'Invitations',
                          desc: 'Invitations à des beefs',
                        },
                        {
                          key: 'beefs_live' as const,
                          icon: Zap,
                          color: 'text-ember-500',
                          label: 'Beefs en direct',
                          desc: 'Quand un beef que tu suis passe en live',
                        },
                        {
                          key: 'aura' as const,
                          icon: Sparkles,
                          color: 'text-brand-400',
                          label: 'Étincelles d’Aura',
                          desc: 'Validations d’Aura et bonus sur ton contenu',
                        },
                        {
                          key: 'gifts' as const,
                          icon: Gift,
                          color: 'text-prestige-gold',
                          label: 'Cadeaux',
                          desc: 'Quand tu reçois un cadeau',
                        },
                        {
                          key: 'browser' as const,
                          icon: Bell,
                          color: 'text-cobalt-300',
                          label: 'Notifications navigateur',
                          desc: "Popups système même hors de l'app",
                        },
                      ] as const
                    ).map(({ key, icon: Icon, color, label, desc }) => (
                      <div key={key} className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Icon className={`w-5 h-5 ${color}`} aria-hidden />
                          <div>
                            <p id={`notif-pref-label-${key}`} className="text-white font-semibold text-sm">
                              {label}
                            </p>
                            <p className="text-gray-500 text-xs">{desc}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={notifPrefs[key]}
                          aria-labelledby={`notif-pref-label-${key}`}
                          onClick={() => toggleNotifPref(key)}
                          className={`relative w-12 h-7 rounded-full transition-all ${
                            notifPrefs[key] ? 'bg-cyan-500' : 'bg-white/10'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full transition-transform ${
                              notifPrefs[key] ? 'translate-x-5' : ''
                            }`}
                          />
                        </button>
                      </div>
                    ))}
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className={SETTINGS_GLASS_CARD}
                >
                  <h3 className="text-white font-bold text-lg mb-2">Guides d&apos;utilisation</h3>
                  <p className="text-gray-400 text-sm mb-4">
                    Réafficher les guides contextuels pour redécouvrir les fonctionnalités.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        localStorage.removeItem('beefs_seen_features');
                      } catch {}
                      setMessage({
                        type: 'success',
                        text: 'Guides réinitialisés ! Ils réapparaitront lors de ta prochaine navigation.',
                      });
                    }}
                    className="px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 font-semibold text-sm rounded-lg transition-colors border border-brand-500/30"
                  >
                    Réinitialiser les guides
                  </button>
                </motion.div>
              </>
            )}

            {activeTab === 'danger' && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className={SETTINGS_GLASS_CARD_DANGER}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                    <Shield className="w-5 h-5 text-red-400" />
                  </div>
                  <h3 className="text-white font-bold text-xl">Zone de danger</h3>
                </div>

                <div className="space-y-4">
                  <button type="button" onClick={handleDeleteAccount} className={SETTINGS_BTN_DANGER}>
                    Supprimer mon compte
                  </button>
                  <p className="text-gray-400 text-sm text-center">
                    Cette action est irréversible. Toutes vos données seront supprimées définitivement.
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
```r

---


