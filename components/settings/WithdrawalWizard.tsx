'use client';

import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Euro, Check, ArrowLeft, AlertCircle, ChevronDown } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import { z } from 'zod';

const paypalEmailSchema = z.string().email('Adresse email PayPal invalide');

const ibanSchema = z
  .string()
  .transform((v) => v.replace(/\s/g, '').toUpperCase())
  .pipe(
    z
      .string()
      .min(15, 'IBAN trop court (15 caractères minimum)')
      .max(34, 'IBAN trop long (34 caractères maximum)')
      .regex(/^[A-Z]{2}\d{2}[A-Z0-9]+$/, 'Format IBAN invalide'),
  );

const mobileSchema = z
  .string()
  .regex(/^\+\d{7,15}$/, 'Numéro de téléphone invalide (format international attendu)');

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

  const isSubmitting = useRef(false);

  const handleWithdrawalSubmit = async () => {
    if (isSubmitting.current) return;
    isSubmitting.current = true;
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
      isSubmitting.current = false;
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
                  const raw = Number(e.target.value);
                  if (!Number.isFinite(raw)) return;
                  const val = Math.max(20, Math.min(Math.floor(raw), Math.floor(points / 100)));
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
                const ibanResult = ibanSchema.safeParse(withdrawalFields.iban || '');
                if (!ibanResult.success) {
                  setWithdrawalError(ibanResult.error.issues[0].message);
                  return;
                }
              }
              if (withdrawalMethod === 'paypal') {
                const emailResult = paypalEmailSchema.safeParse(withdrawalFields.paypalEmail || '');
                if (!emailResult.success) {
                  setWithdrawalError(emailResult.error.issues[0].message);
                  return;
                }
              }
              if (['orange_money', 'wave'].includes(withdrawalMethod)) {
                const mobileResult = mobileSchema.safeParse(withdrawalFields.mobileNumber || '');
                if (!mobileResult.success) {
                  setWithdrawalError(mobileResult.error.issues[0].message);
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
              <span className="text-white/50 text-sm">Frais de plateforme</span>
              <span className="text-white/50 font-bold italic">Prélevés à la source (Taxe Agora)</span>
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
