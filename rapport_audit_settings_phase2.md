# Audit Phase 2 — Extraits `app/settings/page.tsx`

**Date :** 31 mai 2026  
**Commit de référence :** `3ee835d` (`refactor(identity): extract withdrawal wizard to settings wallet tab`)  
**Fichier :** `app/settings/page.tsx` (~1 271 lignes)  
**Nature :** extraction code brut — **aucune modification de code**

**Objectif Phase 2 (Architecte / PO) :** changement d’e-mail sécurisé + Bouclier Anti-Spam (`invitation_privacy`) connecté DB avec save dédié.

---

## 1. Imports (L1–L14)

```typescript
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
```

### Constantes UI utilisées par les onglets Profil / Sécurité (L16–L27)

```typescript
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
```

### Types Profil / onglets (L62–L64)

```typescript
type InvitationPrivacy = 'everyone' | 'following' | 'nobody';

type SettingTab = 'profile' | 'security' | 'wallet' | 'preferences' | 'danger';
```

---

## 2. `useAuth()` et tous les `useState` (L66–L122)

```typescript
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
```

---

## 3. `loadProfile` + `useEffect` principal (L124–L169)

```typescript
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
```

---

## 4. JSX — Onglet `profile` (L538–L627)

> Carte « Informations du profil » : username, display_name, bio, **email lecture seule**, bouton `handleSaveProfile`.

```tsx
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
                <p id="settings-email-label" className="block text-white font-semibold mb-2 text-sm">
                  Email
                </p>
                <div className="flex items-center gap-2" role="group" aria-labelledby="settings-email-label">
                  <Mail className="w-5 h-5 text-gray-400" aria-hidden />
                  <span className="text-gray-400">{profile.email}</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">L&apos;email est géré par votre fournisseur d&apos;authentification</p>
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
```

### JSX — Onglet `profile` — Bouclier Anti-Spam (L1095–L1157)

> **Dette Phase 2 :** `invitation_privacy` modifié ici mais persisté via `handleSaveProfile` sur la carte « Informations du profil » (pas de save immédiat).

```tsx
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
                  onClick={() => setProfile({ ...profile, invitation_privacy: opt.id })}
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
```

---

## 5. JSX — Onglet `security` (L629–L876)

> Flux mot de passe complet : formulaire → OTP Supabase → `handleChangePassword` / `handleResendPasswordOtp`.

```tsx
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
```

---

## 6. Annexe — Handler couplé Profil (Phase 2 impact)

> Non demandé explicitement, mais **indispensable** pour la refonte Bouclier : save actuel groupé.

```typescript
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
          invitation_privacy: profile.invitation_privacy,
        })
        .eq('id', user.id);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Profil mis à jour avec succès!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors de la mise à jour' });
    } finally {
      setSaving(false);
    }
  };
```

---

## 7. Points d’attention Phase 2 (synthèse)

| Zone | Lignes | État actuel | Cible Phase 2 |
|------|--------|-------------|---------------|
| Email | L605–L614 | Affichage statique `profile.email` depuis Auth | `EmailChangeForm` + `supabase.auth.updateUser({ email })` |
| Bouclier | L1095–L1157 | UI 3 états OK, save via `handleSaveProfile` distant | Save immédiat DB `invitation_privacy` |
| Sécurité | L629–L876 | OTP mot de passe intact | Ne pas écraser — modèle reauth pour email |
| Portefeuille | L878+ | `WithdrawalWizard` Phase 1 | Hors scope Phase 2 |

---

**Certification :** extraits alignés sur `3ee835d` — **aucun fichier source modifié**.
