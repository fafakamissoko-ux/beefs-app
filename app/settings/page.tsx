'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, Mail, Save, Eye, EyeOff, Shield, Bell, X, Check, LayoutTemplate, Type, Zap, MessageSquare, UserPlus, Gift, Flame, History, AlertCircle, Sparkles, Wallet, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import { FeatureGuide } from '@/components/FeatureGuide';
import { AppBackButton } from '@/components/AppBackButton';
import { WithdrawalWizard } from '@/components/settings/WithdrawalWizard';
import { PASSWORD_POLICY_SHORT_HINT, validatePasswordPolicy } from '@/lib/password-policy';

const SETTINGS_GLASS_CARD =
  'w-full rounded-[2rem] border border-white/10 bg-black/40 p-6 md:p-8 shadow-2xl backdrop-blur-md';
const SETTINGS_GLASS_CARD_DANGER =
  'w-full rounded-[2rem] border border-red-500/20 bg-red-950/20 p-6 md:p-8 shadow-2xl backdrop-blur-md';
const SETTINGS_INPUT =
  'w-full rounded-full border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors';
const SETTINGS_TEXTAREA =
  'w-full rounded-2xl border border-white/10 bg-white/5 py-3 px-4 text-sm text-white placeholder:text-white/30 outline-none focus:border-white/25 transition-colors resize-none';
const SETTINGS_BTN_PRIMARY =
  'brand-gradient flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white shadow-lg transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed';
const SETTINGS_BTN_DANGER =
  'w-full rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/20 active:scale-[0.98]';

type PasswordFieldKey = 'current' | 'new' | 'confirm' | 'otp';

function focusFirstPasswordFieldError(errors: Partial<Record<PasswordFieldKey, string>>) {
  const order: PasswordFieldKey[] = ['current', 'new', 'confirm', 'otp'];
  requestAnimationFrame(() => {
    for (const k of order) {
      if (!errors[k]) continue;
      const id =
        k === 'otp'
          ? 'settings-password-otp'
          : k === 'current'
            ? 'settings-current-password'
            : k === 'new'
              ? 'settings-new-password'
              : 'settings-confirm-password';
      const el = document.getElementById(id);
      el?.focus({ preventScroll: false });
      el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      break;
    }
  });
}

function PasswordInlineError({ id, message }: { id: string; message: string | undefined }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="text-red-400 text-xs mt-1.5 flex items-start gap-1.5">
      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

type InvitationPrivacy = 'everyone' | 'following' | 'nobody';

type SettingTab = 'profile' | 'security' | 'wallet' | 'preferences' | 'danger';

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut, loading: authLoading } = useAuth();
  const { preferences, updatePreferences } = useTheme();
  
  const [profile, setProfile] = useState({
    username: '',
    display_name: '',
    bio: '',
    email: '',
    invitation_privacy: 'everyone' as InvitationPrivacy,
  });
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });

  /** Étape 2 : code à 6–8 chiffres envoyé par e-mail (ou SMS si e-mail non confirmé) via Supabase. */
  const [passwordStep, setPasswordStep] = useState<'form' | 'otp'>('form');
  const [passwordOtp, setPasswordOtp] = useState('');

  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
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
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordFieldErrors, setPasswordFieldErrors] = useState<
    Partial<Record<PasswordFieldKey, string>>
  >({});

  // --- NOUVEAUX ÉTATS : EMAIL & BOUCLIER ---
  const [emailForm, setEmailForm] = useState({ newEmail: '', currentPassword: '' });
  const [emailChangeStatus, setEmailChangeStatus] = useState<'idle' | 'loading' | 'pending_confirmation'>('idle');
  const [emailError, setEmailError] = useState('');
  const [privacyUpdating, setPrivacyUpdating] = useState<InvitationPrivacy | null>(null);

  type PointTx = {
    id: string;
    amount: number;
    balance_after: number;
    type: string;
    description: string | null;
    created_at: string;
  };
  const [pointTx, setPointTx] = useState<PointTx[]>([]);
  const [activeTab, setActiveTab] = useState<SettingTab>('profile');

  const loadProfile = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, display_name, bio, accent_color, invitation_privacy, points')
        .eq('id', user.id)
        .single();

      if (data) {
        const privacyRaw = data.invitation_privacy;
        const invitation_privacy: InvitationPrivacy =
          privacyRaw === 'following' || privacyRaw === 'nobody' ? privacyRaw : 'everyone';

        setProfile({
          username: data.username || '',
          display_name: data.display_name || '',
          bio: data.bio || '',
          email: user.email || '',
          invitation_privacy,
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
      setNotifPrefs((prev) => ({ ...prev, ...parsed, aura: typeof parsed.aura === 'boolean' ? parsed.aura : prev.aura }));
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

  const handleSaveProfile = async () => {
    if (!user) return;
    
    setSaving(true);
    setMessage(null);
    
    try {
      const { error } = await supabase
        .from('users')
        .update({
          display_name: profile.display_name,
          bio: profile.bio,
        })
        .eq('id', user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profil mis à jour avec succès!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Erreur lors de la mise à jour';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  // --- MOTEUR : BOUCLIER ANTI-SPAM ---
  const handleUpdatePrivacy = async (newPrivacy: InvitationPrivacy) => {
    if (!user || privacyUpdating) return;

    setPrivacyUpdating(newPrivacy);
    try {
      const { error } = await supabase
        .from('users')
        .update({ invitation_privacy: newPrivacy })
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => ({ ...prev, invitation_privacy: newPrivacy }));
    } catch (error: unknown) {
      console.error('Erreur Bouclier Anti-Spam:', error);
      setMessage({ type: 'error', text: 'Échec de la mise à jour du bouclier.' });
      setTimeout(() => setMessage(null), 3000);
    } finally {
      setPrivacyUpdating(null);
    }
  };

  // --- MOTEUR : CHANGEMENT D'EMAIL SÉCURISÉ ---
  const handleChangeEmail = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!user || !emailForm.newEmail || !emailForm.currentPassword) return;

    setEmailChangeStatus('loading');
    setEmailError('');

    try {
      // 1. Ré-authentification de sécurité
      const { error: authErr } = await supabase.auth.signInWithPassword({
        email: profile.email,
        password: emailForm.currentPassword,
      });

      if (authErr) throw new Error('Mot de passe actuel incorrect.');

      // 2. Mutation Supabase
      const { error: updateErr } = await supabase.auth.updateUser({
        email: emailForm.newEmail,
      });

      if (updateErr) throw updateErr;

      setEmailChangeStatus('pending_confirmation');
      setEmailForm((prev) => ({ ...prev, currentPassword: '' }));
    } catch (err: unknown) {
      console.error('Erreur changement email:', err);
      setEmailError(err instanceof Error ? err.message : "Impossible de modifier l'adresse e-mail.");
      setEmailChangeStatus('idle');
    }
  };

  const resetPasswordChangeForm = () => {
    setPasswords({ current: '', new: '', confirm: '' });
    setPasswordOtp('');
    setPasswordStep('form');
    setPasswordFieldErrors({});
  };

  const validateSettingsNewPasswordBlur = useCallback((raw: string) => {
    setPasswordFieldErrors((prev) => {
      const { new: _n, ...rest } = prev;
      if (raw.length === 0) return rest;
      const policy = validatePasswordPolicy(raw);
      if (!policy.ok) {
        return {
          ...rest,
          new: 'Le mot de passe ne respecte pas encore tous les critères (voir la politique ci-dessus).',
        };
      }
      return rest;
    });
  }, []);

  const validateSettingsConfirmBlur = useCallback((newPwd: string, confirm: string) => {
    setPasswordFieldErrors((prev) => {
      const { confirm: _c, ...rest } = prev;
      if (confirm.length === 0) return rest;
      if (newPwd !== confirm) {
        return { ...rest, confirm: 'Les deux mots de passe doivent être identiques.' };
      }
      return rest;
    });
  }, []);

  const handleResendPasswordOtp = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const { error } = await supabase.auth.reauthenticate();
      if (error) throw error;
      setMessage({
        type: 'success',
        text: 'Un nouveau code a été envoyé.',
      });
      setTimeout(() => setMessage(null), 4000);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Impossible d’envoyer le code.';
      setMessage({ type: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    setPasswordFieldErrors({});

    if (passwordStep === 'otp') {
      const code = passwordOtp.trim();
      if (!code) {
        const err: Partial<Record<PasswordFieldKey, string>> = {
          otp: 'Saisis le code reçu par e-mail ou SMS.',
        };
        setPasswordFieldErrors(err);
        focusFirstPasswordFieldError(err);
        return;
      }
      if (!passwords.current.trim()) {
        const err: Partial<Record<PasswordFieldKey, string>> = {
          current: 'Saisis ton mot de passe actuel.',
        };
        setPasswordFieldErrors(err);
        focusFirstPasswordFieldError(err);
        return;
      }

      setSaving(true);
      setMessage(null);
      try {
        const { error } = await supabase.auth.updateUser({
          password: passwords.new,
          current_password: passwords.current,
          nonce: code,
        });
        if (error) throw error;
        setMessage({ type: 'success', text: 'Mot de passe modifié avec succès !' });
        resetPasswordChangeForm();
        setTimeout(() => setMessage(null), 3000);
      } catch (error: unknown) {
        const msg =
          error && typeof error === 'object' && 'message' in error
            ? String((error as { message?: string }).message)
            : 'Erreur lors du changement de mot de passe';
        const lower = msg.toLowerCase();
        if (
          lower.includes('invalid') &&
          (lower.includes('credential') || lower.includes('password') || lower.includes('login'))
        ) {
          setPasswordFieldErrors({
            current: 'Mot de passe actuel incorrect ou session expirée.',
          });
          focusFirstPasswordFieldError({ current: 'x' });
        } else {
          setMessage({ type: 'error', text: msg });
        }
      } finally {
        setSaving(false);
      }
      return;
    }

    const policy = validatePasswordPolicy(passwords.new);
    if (!policy.ok) {
      const err: Partial<Record<PasswordFieldKey, string>> = {
        new: 'Le mot de passe ne respecte pas encore tous les critères (voir la politique ci-dessus).',
      };
      setPasswordFieldErrors(err);
      focusFirstPasswordFieldError(err);
      return;
    }

    if (passwords.new !== passwords.confirm) {
      const err: Partial<Record<PasswordFieldKey, string>> = {
        confirm: 'Les deux mots de passe doivent être identiques.',
      };
      setPasswordFieldErrors(err);
      focusFirstPasswordFieldError(err);
      return;
    }

    if (!passwords.current.trim()) {
      const err: Partial<Record<PasswordFieldKey, string>> = {
        current: 'Saisis ton mot de passe actuel.',
      };
      setPasswordFieldErrors(err);
      focusFirstPasswordFieldError(err);
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new,
        current_password: passwords.current,
      });

      if (error) {
        const code = (error as { code?: string }).code;
        if (code === 'reauthentication_needed' || code === 'reauth_nonce_missing') {
          const { error: reErr } = await supabase.auth.reauthenticate();
          if (reErr) throw reErr;
          setPasswordStep('otp');
          setPasswordFieldErrors({});
          setMessage({
            type: 'success',
            text:
              'Un code de confirmation a été envoyé (e-mail, ou SMS si l’e-mail n’est pas vérifié). Saisis-le ci-dessous pour valider le changement.',
          });
          return;
        }
        throw error;
      }

      setMessage({ type: 'success', text: 'Mot de passe modifié avec succès !' });
      resetPasswordChangeForm();
      setTimeout(() => setMessage(null), 3000);
    } catch (error: unknown) {
      const msg =
        error && typeof error === 'object' && 'message' in error
          ? String((error as { message?: string }).message)
          : 'Erreur lors du changement de mot de passe';
      const lower = msg.toLowerCase();
      if (
        lower.includes('invalid') &&
        (lower.includes('credential') || lower.includes('password') || lower.includes('login'))
      ) {
        setPasswordFieldErrors({
          current: 'Mot de passe actuel incorrect ou session expirée.',
        });
        focusFirstPasswordFieldError({ current: 'x' });
      } else {
        setMessage({ type: 'error', text: msg });
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleNotifPref = (key: keyof typeof notifPrefs) => {
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    try { localStorage.setItem('beefs_notif_prefs', JSON.stringify(updated)); } catch {}
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement votre compte ? Cette action est irréversible.')) {
      return;
    }
    if (!confirm('Dernière confirmation : toutes vos données (beefs, messages, points) seront perdues. Continuer ?')) {
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erreur serveur');
      }
      await signOut();
      router.push('/');
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors de la suppression du compte' });
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
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-transparent">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header with Back button */}
        <div className="flex items-center gap-4 mb-8">
          <AppBackButton />
          <div className="flex-1">
            <h1 className="text-4xl font-black text-white">Paramètres</h1>
            <p className="text-gray-400">Gérez votre compte et vos préférences</p>
          </div>
        </div>

        {/* Success/Error Message */}
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
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={SETTINGS_GLASS_CARD}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Informations du profil</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label htmlFor="settings-username" className="block text-white font-semibold mb-2 text-sm">
                  Nom d&apos;utilisateur
                </label>
                <input
                  id="settings-username"
                  type="text"
                  value={profile.username}
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
                <label htmlFor="settings-display-name" className="block text-white font-semibold mb-2 text-sm">
                  Nom affiché
                </label>
                <input
                  id="settings-display-name"
                  type="text"
                  value={profile.display_name}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  placeholder="Comment voulez-vous être appelé?"
                  autoComplete="nickname"
                  className={SETTINGS_INPUT}
                  maxLength={50}
                />
              </div>

              <div>
                <label htmlFor="settings-bio" className="block text-white font-semibold mb-2 text-sm">
                  Bio
                </label>
                <textarea
                  id="settings-bio"
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Parlez-nous de vous..."
                  rows={3}
                  aria-describedby="settings-bio-count"
                  className={SETTINGS_TEXTAREA}
                  maxLength={200}
                />
                <p id="settings-bio-count" className="text-gray-400 text-xs mt-1">
                  {profile.bio.length}/200 caractères
                </p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 text-sm">
                  Adresse Email
                </label>
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-5 h-5 text-gray-400" aria-hidden />
                  <span className="text-white">{profile.email}</span>
                </div>

                {emailChangeStatus === 'pending_confirmation' ? (
                  <div className="rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 text-brand-400 text-sm shadow-lg">
                    <p className="font-bold flex items-center gap-2"><Check className="w-4 h-4" /> E-mail de confirmation envoyé</p>
                    <p className="mt-1 opacity-80 leading-relaxed">
                      Un lien a été envoyé à <strong>{emailForm.newEmail || 'la nouvelle adresse'}</strong>.
                      Veuillez cliquer dessus pour valider le changement. Votre ancienne adresse reste active en attendant.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-2xl border border-white/5 bg-black/20 p-4">
                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-1">Modifier l&apos;adresse</p>
                    <input
                      type="email"
                      placeholder="Nouvelle adresse e-mail"
                      value={emailForm.newEmail}
                      onChange={(e) => setEmailForm({ ...emailForm, newEmail: e.target.value })}
                      className={SETTINGS_INPUT}
                      disabled={emailChangeStatus === 'loading'}
                    />
                    <input
                      type="password"
                      placeholder="Mot de passe actuel (requis pour sécurité)"
                      value={emailForm.currentPassword}
                      onChange={(e) => setEmailForm({ ...emailForm, currentPassword: e.target.value })}
                      className={SETTINGS_INPUT}
                      disabled={emailChangeStatus === 'loading'}
                    />
                    {emailError && (
                      <p className="text-red-400 text-xs flex items-start gap-1.5 mt-1">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>{emailError}</span>
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={handleChangeEmail}
                      disabled={!emailForm.newEmail || !emailForm.currentPassword || emailChangeStatus === 'loading'}
                      className="mt-2 w-full rounded-full border border-white/10 bg-white/5 py-2.5 text-sm font-bold text-white transition-all hover:bg-white/10 hover:border-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {emailChangeStatus === 'loading' ? 'Envoi de la demande...' : 'Mettre à jour l\'e-mail'}
                    </button>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSaveProfile}
                disabled={saving}
                className={SETTINGS_BTN_PRIMARY}
              >
                <Save className="w-5 h-5" />
                {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </div>
          </motion.div>
          )}

          {activeTab === 'security' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className={SETTINGS_GLASS_CARD}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Lock className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Changer le mot de passe</h3>
            </div>

            <div className="space-y-4">
              <p className="text-gray-500 text-xs">
                Saisis d’abord ton mot de passe actuel. Si ton projet Supabase impose une confirmation (session &gt; 24 h ou option
                sécurisée), un <strong className="text-gray-400">code</strong> t’est envoyé par <strong className="text-gray-400">e-mail</strong> (ou par{' '}
                <strong className="text-gray-400">SMS</strong> si l’e-mail n’est pas confirmé).
              </p>
              <p className="text-gray-500 text-xs mb-1" id="settings-password-policy-hint">
                {PASSWORD_POLICY_SHORT_HINT}
              </p>

              <div>
                <label htmlFor="settings-current-password" className="block text-white font-semibold mb-2 text-sm">
                  Mot de passe actuel
                </label>
                <div className="relative">
                  <input
                    id="settings-current-password"
                    type={showPasswords.current ? 'text' : 'password'}
                    value={passwords.current}
                    onChange={(e) => {
                      setPasswords({ ...passwords, current: e.target.value });
                      setPasswordFieldErrors((p) => {
                        const { current: _c, ...rest } = p;
                        return rest;
                      });
                    }}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={passwordStep === 'otp'}
                    aria-invalid={!!passwordFieldErrors.current}
                    aria-describedby={
                      passwordFieldErrors.current ? 'settings-current-password-error' : undefined
                    }
                    className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                      passwordFieldErrors.current ? 'beefs-field-invalid' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, current: !showPasswords.current })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
                    disabled={passwordStep === 'otp'}
                    aria-label={
                      showPasswords.current ? 'Masquer le mot de passe actuel' : 'Afficher le mot de passe actuel'
                    }
                  >
                    {showPasswords.current ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                  </button>
                </div>
                <PasswordInlineError
                  id="settings-current-password-error"
                  message={passwordFieldErrors.current}
                />
              </div>

              <div>
                <label htmlFor="settings-new-password" className="block text-white font-semibold mb-2 text-sm">
                  Nouveau mot de passe
                </label>
                <div className="relative">
                  <input
                    id="settings-new-password"
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwords.new}
                    onChange={(e) => {
                      setPasswords({ ...passwords, new: e.target.value });
                      setPasswordFieldErrors((p) => {
                        const { new: _n, ...rest } = p;
                        return rest;
                      });
                    }}
                    onBlur={(e) => validateSettingsNewPasswordBlur(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-describedby={
                      ['settings-password-policy-hint', passwordFieldErrors.new ? 'settings-new-password-error' : '']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    aria-invalid={!!passwordFieldErrors.new}
                    disabled={passwordStep === 'otp'}
                    className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                      passwordFieldErrors.new ? 'beefs-field-invalid' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
                    disabled={passwordStep === 'otp'}
                    aria-label={showPasswords.new ? 'Masquer le nouveau mot de passe' : 'Afficher le nouveau mot de passe'}
                  >
                    {showPasswords.new ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                  </button>
                </div>
                <PasswordInlineError
                  id="settings-new-password-error"
                  message={passwordFieldErrors.new}
                />
              </div>

              <div>
                <label htmlFor="settings-confirm-password" className="block text-white font-semibold mb-2 text-sm">
                  Confirmer le mot de passe
                </label>
                <div className="relative">
                  <input
                    id="settings-confirm-password"
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwords.confirm}
                    onChange={(e) => {
                      setPasswords({ ...passwords, confirm: e.target.value });
                      setPasswordFieldErrors((p) => {
                        const { confirm: _c, ...rest } = p;
                        return rest;
                      });
                    }}
                    onBlur={(e) => {
                      const pwd =
                        (document.getElementById('settings-new-password') as HTMLInputElement | null)
                          ?.value ?? '';
                      validateSettingsConfirmBlur(pwd, e.target.value);
                    }}
                    placeholder="Répétez le mot de passe"
                    autoComplete="new-password"
                    aria-invalid={!!passwordFieldErrors.confirm}
                    aria-describedby={
                      passwordFieldErrors.confirm ? 'settings-confirm-password-error' : undefined
                    }
                    disabled={passwordStep === 'otp'}
                    className={`${SETTINGS_INPUT} pr-12 disabled:opacity-50 ${
                      passwordFieldErrors.confirm ? 'beefs-field-invalid' : ''
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white disabled:opacity-40"
                    disabled={passwordStep === 'otp'}
                    aria-label={
                      showPasswords.confirm ? 'Masquer la confirmation du mot de passe' : 'Afficher la confirmation du mot de passe'
                    }
                  >
                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" aria-hidden /> : <Eye className="w-5 h-5" aria-hidden />}
                  </button>
                </div>
                <PasswordInlineError
                  id="settings-confirm-password-error"
                  message={passwordFieldErrors.confirm}
                />
              </div>

              {passwordStep === 'otp' && (
                <div>
                  <label htmlFor="settings-password-otp" className="block text-white font-semibold mb-2 text-sm">
                    Code de confirmation
                  </label>
                  <input
                    id="settings-password-otp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={passwordOtp}
                    onChange={(e) => {
                      setPasswordOtp(e.target.value.replace(/\s/g, ''));
                      setPasswordFieldErrors((p) => {
                        const { otp: _o, ...rest } = p;
                        return rest;
                      });
                    }}
                    placeholder="Code reçu par e-mail ou SMS"
                    aria-describedby={
                      ['settings-otp-hint', passwordFieldErrors.otp ? 'settings-password-otp-error' : '']
                        .filter(Boolean)
                        .join(' ') || undefined
                    }
                    aria-invalid={!!passwordFieldErrors.otp}
                    className={`${SETTINGS_INPUT} tracking-widest text-center text-lg ${
                      passwordFieldErrors.otp ? 'beefs-field-invalid' : ''
                    }`}
                  />
                  <p id="settings-otp-hint" className="text-gray-500 text-xs mt-2">
                    Colle le code à une seule utilisation envoyé par Supabase (vérifie les spams).
                  </p>
                  <PasswordInlineError id="settings-password-otp-error" message={passwordFieldErrors.otp} />
                  <button
                    type="button"
                    onClick={handleResendPasswordOtp}
                    disabled={saving}
                    className="mt-2 text-sm font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50"
                  >
                    Renvoyer le code
                  </button>
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={
                    saving ||
                    (passwordStep === 'form'
                      ? !passwords.current || !passwords.new || !passwords.confirm
                      : !passwordOtp.trim())
                  }
                  className={SETTINGS_BTN_PRIMARY}
                >
                  {saving
                    ? 'Modification...'
                    : passwordStep === 'otp'
                      ? 'Valider avec le code'
                      : 'Changer le mot de passe'}
                </button>
                {passwordStep === 'otp' && (
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordStep('form');
                      setPasswordOtp('');
                      setPasswordFieldErrors((p) => {
                        const { otp: _o, ...rest } = p;
                        return rest;
                      });
                    }}
                    className="w-full py-3 rounded-lg border border-white/15 text-gray-300 hover:bg-white/5 text-sm font-semibold"
                  >
                    Retour
                  </button>
                )}
              </div>
            </div>
          </motion.div>
          )}

          {activeTab === 'wallet' && user && (
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
                <p className="text-gray-500 text-xs mt-0.5">Achats, accès aux directs, cadeaux, retraits (50 derniers)</p>
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
              <p className="text-gray-500 text-sm py-4 text-center">Aucun mouvement enregistré pour l’instant.</p>
            ) : (
              <ul className="space-y-2 max-h-80 overflow-y-auto hide-scrollbar pr-1">
                {pointTx.map((tx) => (
                  <li
                    key={tx.id}
                    className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.06] last:border-0 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="text-white font-medium truncate">{tx.description || tx.type}</p>
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
                      <span className={tx.amount >= 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
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
              {/* Accent color */}
              <div>
                <p id="accent-color-label" className="block text-white font-semibold mb-3 text-sm">
                  Couleur d&apos;accent
                </p>
                <div className="flex items-center gap-3 flex-wrap" role="group" aria-labelledby="accent-color-label">
                  {['#E83A14', '#FF6B2C', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'].map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={async () => {
                        setAccentColor(color);
                        if (user) {
                          await supabase.from('users').update({ accent_color: color }).eq('id', user.id);
                        }
                      }}
                      aria-label={`Couleur d&apos;accent ${color}`}
                      aria-pressed={accentColor === color}
                      className={`w-9 h-9 rounded-full transition-all ${
                        accentColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : 'hover:scale-110'
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
                        if (user) {
                          await supabase.from('users').update({ accent_color: e.target.value }).eq('id', user.id);
                        }
                      }}
                      aria-label="Couleur d&apos;accent personnalisée"
                      className="absolute inset-0 w-9 h-9 opacity-0 cursor-pointer"
                    />
                    <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-500 flex items-center justify-center text-gray-400 hover:border-white hover:text-white transition-all">
                      <span className="text-xs font-bold">+</span>
                    </div>
                  </label>
                </div>
              </div>

              {/* Font size */}
              <div>
                <label className="block text-white font-semibold mb-3 text-sm flex items-center gap-2">
                  <Type className="w-4 h-4" />
                  Taille du texte
                </label>
                <div className="grid grid-cols-3 gap-2" role="group" aria-label="Taille du texte">
                  {([
                    { value: 'small' as const, label: 'Petit' },
                    { value: 'normal' as const, label: 'Normal' },
                    { value: 'large' as const, label: 'Grand' },
                  ]).map(({ value, label }) => (
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

              {/* Reduce animations toggle */}
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
                  onClick={() => updatePreferences({ reduceAnimations: !preferences.reduceAnimations })}
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

              {/* High contrast toggle */}
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
                  onClick={() => updatePreferences({ highContrast: !preferences.highContrast })}
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
          )}

          {activeTab === 'profile' && (
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
                    profile.invitation_privacy === opt.id
                      ? 'border-red-500/50 bg-red-500/10 text-white'
                      : 'border-white/10 bg-white/[0.02] text-gray-400 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`text-sm font-bold ${profile.invitation_privacy === opt.id ? 'text-red-400' : 'text-gray-300'}`}
                    >
                      {opt.label}
                    </p>
                    <p className="mt-0.5 text-xs opacity-70">{opt.desc}</p>
                  </div>
                  {profile.invitation_privacy === opt.id ? <Check className="h-5 w-5 text-red-400" /> : null}
                </button>
              ))}
            </div>
          </motion.div>
          )}

          {activeTab === 'preferences' && (
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
              {([
                { key: 'messages' as const, icon: MessageSquare, color: 'text-cobalt-400', label: 'Messages privés', desc: 'Nouveaux messages reçus' },
                { key: 'follows' as const, icon: UserPlus, color: 'text-prestige-gold', label: 'Abonnements', desc: 'Quand quelqu\'un te suit' },
                { key: 'invites' as const, icon: Flame, color: 'text-ember-400', label: 'Invitations', desc: 'Invitations à des beefs' },
                { key: 'beefs_live' as const, icon: Zap, color: 'text-ember-500', label: 'Beefs en direct', desc: 'Quand un beef que tu suis passe en live' },
                { key: 'aura' as const, icon: Sparkles, color: 'text-brand-400', label: 'Étincelles d’Aura', desc: 'Validations d’Aura et bonus sur ton contenu' },
                { key: 'gifts' as const, icon: Gift, color: 'text-prestige-gold', label: 'Cadeaux', desc: 'Quand tu reçois un cadeau' },
                { key: 'browser' as const, icon: Bell, color: 'text-cobalt-300', label: 'Notifications navigateur', desc: 'Popups système même hors de l\'app' },
              ]).map(({ key, icon: Icon, color, label, desc }) => (
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
          )}

          {activeTab === 'preferences' && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className={SETTINGS_GLASS_CARD}
          >
            <h3 className="text-white font-bold text-lg mb-2">Guides d&apos;utilisation</h3>
            <p className="text-gray-400 text-sm mb-4">Réafficher les guides contextuels pour redécouvrir les fonctionnalités.</p>
            <button
              type="button"
              onClick={() => {
                try { localStorage.removeItem('beefs_seen_features'); } catch {}
                setMessage({ type: 'success', text: 'Guides réinitialisés ! Ils réapparaitront lors de ta prochaine navigation.' });
              }}
              className="px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 font-semibold text-sm rounded-lg transition-colors border border-brand-500/30"
            >
              Réinitialiser les guides
            </button>
          </motion.div>
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
              <button
                type="button"
                onClick={handleDeleteAccount}
                className={SETTINGS_BTN_DANGER}
              >
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
