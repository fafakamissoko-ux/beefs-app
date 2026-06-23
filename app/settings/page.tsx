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
