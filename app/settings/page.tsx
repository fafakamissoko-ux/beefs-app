'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Lock, Mail, Save, Eye, EyeOff, Shield, Bell, X, Check, Sun, Moon, Monitor, Type, Zap, MessageSquare, UserPlus, Gift, Flame, History } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import { FeatureGuide } from '@/components/FeatureGuide';

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { preferences, updatePreferences } = useTheme();
  
  const [profile, setProfile] = useState({
    username: '',
    display_name: '',
    bio: '',
    email: '',
  });
  
  const [passwords, setPasswords] = useState({
    new: '',
    confirm: '',
  });
  
  const [showPasswords, setShowPasswords] = useState({
    new: false,
    confirm: false,
  });
  
  const [accentColor, setAccentColor] = useState('#E83A14');
  const [notifPrefs, setNotifPrefs] = useState({
    messages: true,
    follows: true,
    invites: true,
    beefs_live: true,
    gifts: true,
    browser: true,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  type PointTx = {
    id: string;
    amount: number;
    balance_after: number;
    type: string;
    description: string | null;
    created_at: string;
  };
  const [pointTx, setPointTx] = useState<PointTx[]>([]);

  useEffect(() => {
    if (!user) {
      router.push('/login?redirect=/settings');
      return;
    }
    loadProfile();
    try {
      const saved = localStorage.getItem('beefs_notif_prefs');
      if (saved) setNotifPrefs(JSON.parse(saved));
    } catch {}
  }, [user]);

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

  const loadProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, display_name, bio, accent_color')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile({
          username: data.username || '',
          display_name: data.display_name || '',
          bio: data.bio || '',
          email: user.email || '',
        });
        if (data.accent_color) setAccentColor(data.accent_color);
      }
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

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
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors de la mise à jour' });
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwords.new || passwords.new.length < 6) {
      setMessage({ type: 'error', text: 'Le mot de passe doit contenir au moins 6 caractères' });
      return;
    }

    if (passwords.new !== passwords.confirm) {
      setMessage({ type: 'error', text: 'Les mots de passe ne correspondent pas' });
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.new
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Mot de passe modifié avec succès!' });
      setPasswords({ new: '', confirm: '' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors du changement de mot de passe' });
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

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header with Back button */}
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            <span className="font-semibold">Retour</span>
          </button>
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
              className={`mb-6 p-4 rounded-xl border ${
                message.type === 'success'
                  ? 'bg-green-500/10 border-green-500/30 text-green-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <div className="flex items-center gap-2">
                {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                <span className="font-semibold">{message.text}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-6">
          {/* Profile Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                <User className="w-5 h-5 text-purple-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Informations du profil</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Nom d'utilisateur</label>
                <input
                  type="text"
                  value={profile.username}
                  disabled
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
                />
                <p className="text-gray-500 text-xs mt-1">Le nom d'utilisateur ne peut pas être modifié</p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Nom affiché</label>
                <input
                  type="text"
                  value={profile.display_name}
                  onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                  placeholder="Comment voulez-vous être appelé?"
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                  maxLength={50}
                />
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Bio</label>
                <textarea
                  value={profile.bio}
                  onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
                  placeholder="Parlez-nous de vous..."
                  rows={3}
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
                  maxLength={200}
                />
                <p className="text-gray-400 text-xs mt-1">{profile.bio.length}/200 caractères</p>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Email</label>
                <div className="flex items-center gap-2">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-400">{profile.email}</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">L'email est géré par votre fournisseur d'authentification</p>
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving}
                className="w-full brand-gradient text-black font-bold py-3 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:opacity-90 flex items-center justify-center gap-2"
              >
                <Save className="w-5 h-5" />
                {saving ? 'Enregistrement...' : 'Enregistrer les modifications'}
              </button>
            </div>
          </motion.div>

          {/* Password Change */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="card rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                <Lock className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Changer le mot de passe</h3>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Nouveau mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.new ? 'text' : 'password'}
                    value={passwords.new}
                    onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                    placeholder="Minimum 6 caractères"
                    className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, new: !showPasswords.new })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPasswords.new ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-white font-semibold mb-2 text-sm">Confirmer le mot de passe</label>
                <div className="relative">
                  <input
                    type={showPasswords.confirm ? 'text' : 'password'}
                    value={passwords.confirm}
                    onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                    placeholder="Répétez le mot de passe"
                    className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswords({ ...showPasswords, confirm: !showPasswords.confirm })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                  >
                    {showPasswords.confirm ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                onClick={handleChangePassword}
                disabled={saving || !passwords.new || !passwords.confirm}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {saving ? 'Modification...' : 'Changer le mot de passe'}
              </button>
            </div>
          </motion.div>

          {/* Historique des points */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
            className="card rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-brand-500/20 rounded-full flex items-center justify-center">
                <History className="w-5 h-5 text-brand-400" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-xl">Historique des points</h3>
                <p className="text-gray-500 text-xs mt-0.5">Achats, accès aux directs, cadeaux, retraits (50 derniers)</p>
              </div>
              <Link
                href="/buy-points"
                className="text-xs font-semibold text-brand-400 hover:text-brand-300 whitespace-nowrap"
              >
                Acheter des points
              </Link>
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

          {/* Display & Accessibility */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                <Sun className="w-5 h-5 text-orange-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Affichage & accessibilité</h3>
            </div>

            <div className="space-y-6">
              {/* Theme selector */}
              <div className="relative">
                <label className="block text-white font-semibold mb-3 text-sm">Thème</label>
                <FeatureGuide
                  id="settings-theme"
                  title="Personnalise ton thème"
                  description="Choisis entre sombre, clair ou automatique. L'app s'adapte à tes préférences."
                  position="bottom"
                />
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'dark' as const, label: 'Sombre', icon: Moon },
                    { value: 'light' as const, label: 'Clair', icon: Sun },
                    { value: 'auto' as const, label: 'Automatique', icon: Monitor },
                  ]).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => updatePreferences({ theme: value })}
                      className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
                        preferences.theme === value
                          ? 'brand-gradient text-white shadow-lg'
                          : 'bg-white/[0.04] border border-white/[0.06] text-gray-400 hover:text-white hover:bg-white/[0.08]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Accent color */}
              <div>
                <label className="block text-white font-semibold mb-3 text-sm">Couleur d&apos;accent</label>
                <div className="flex items-center gap-3 flex-wrap">
                  {['#E83A14', '#FF6B2C', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'].map((color) => (
                    <button
                      key={color}
                      onClick={async () => {
                        setAccentColor(color);
                        if (user) {
                          await supabase.from('users').update({ accent_color: color }).eq('id', user.id);
                        }
                      }}
                      className={`w-9 h-9 rounded-full transition-all ${
                        accentColor === color ? 'ring-2 ring-white ring-offset-2 ring-offset-black scale-110' : 'hover:scale-110'
                      }`}
                      style={{ background: color }}
                    />
                  ))}
                  <label className="relative cursor-pointer">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={async (e) => {
                        setAccentColor(e.target.value);
                        if (user) {
                          await supabase.from('users').update({ accent_color: e.target.value }).eq('id', user.id);
                        }
                      }}
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
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'small' as const, label: 'Petit' },
                    { value: 'normal' as const, label: 'Normal' },
                    { value: 'large' as const, label: 'Grand' },
                  ]).map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => updatePreferences({ fontSize: value })}
                      className={`px-4 py-3 rounded-xl font-semibold text-sm transition-all ${
                        preferences.fontSize === value
                          ? 'brand-gradient text-white shadow-lg'
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
                  <Zap className="w-5 h-5 text-yellow-400" />
                  <div>
                    <p className="text-white font-semibold text-sm">Réduire les animations</p>
                    <p className="text-gray-500 text-xs">Limite les mouvements et transitions</p>
                  </div>
                </div>
                <button
                  onClick={() => updatePreferences({ reduceAnimations: !preferences.reduceAnimations })}
                  className={`relative w-12 h-7 rounded-full transition-all ${
                    preferences.reduceAnimations ? 'bg-brand-500' : 'bg-gray-300 dark:bg-white/10'
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
                  <Eye className="w-5 h-5 text-cyan-400" />
                  <div>
                    <p className="text-white font-semibold text-sm">Contraste élevé</p>
                    <p className="text-gray-500 text-xs">Augmente le contraste des textes</p>
                  </div>
                </div>
                <button
                  onClick={() => updatePreferences({ highContrast: !preferences.highContrast })}
                  className={`relative w-12 h-7 rounded-full transition-all ${
                    preferences.highContrast ? 'bg-brand-500' : 'bg-gray-300 dark:bg-white/10'
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

          {/* Notification Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17 }}
            className="card rounded-2xl p-6"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                <Bell className="w-5 h-5 text-green-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Notifications</h3>
            </div>

            <div className="space-y-4">
              {([
                { key: 'messages' as const, icon: MessageSquare, color: 'text-blue-400', label: 'Messages privés', desc: 'Nouveaux messages reçus' },
                { key: 'follows' as const, icon: UserPlus, color: 'text-purple-400', label: 'Abonnements', desc: 'Quand quelqu\'un te suit' },
                { key: 'invites' as const, icon: Flame, color: 'text-orange-400', label: 'Invitations', desc: 'Invitations à des beefs' },
                { key: 'beefs_live' as const, icon: Zap, color: 'text-red-400', label: 'Beefs en direct', desc: 'Quand un beef que tu suis passe en live' },
                { key: 'gifts' as const, icon: Gift, color: 'text-yellow-400', label: 'Cadeaux', desc: 'Quand tu reçois un cadeau' },
                { key: 'browser' as const, icon: Bell, color: 'text-cyan-400', label: 'Notifications navigateur', desc: 'Popups système même hors de l\'app' },
              ]).map(({ key, icon: Icon, color, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${color}`} />
                    <div>
                      <p className="text-white font-semibold text-sm">{label}</p>
                      <p className="text-gray-500 text-xs">{desc}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleNotifPref(key)}
                    className={`relative w-12 h-7 rounded-full transition-all ${
                      notifPrefs[key] ? 'bg-brand-500' : 'bg-gray-300 dark:bg-white/10'
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

          {/* Reset guides */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card rounded-2xl p-6"
          >
            <h3 className="text-white font-bold text-lg mb-2">Guides d&apos;utilisation</h3>
            <p className="text-gray-400 text-sm mb-4">Réafficher les guides contextuels pour redécouvrir les fonctionnalités.</p>
            <button
              onClick={() => {
                try { localStorage.removeItem('beefs_seen_features'); } catch {}
                setMessage({ type: 'success', text: 'Guides réinitialisés ! Ils réapparaitront lors de ta prochaine navigation.' });
              }}
              className="px-4 py-2 bg-brand-500/20 hover:bg-brand-500/30 text-brand-400 font-semibold text-sm rounded-lg transition-colors border border-brand-500/30"
            >
              Réinitialiser les guides
            </button>
          </motion.div>

          {/* Danger Zone */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-red-900/10 rounded-2xl p-6 border border-red-500/30"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center">
                <Shield className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-white font-bold text-xl">Zone de danger</h3>
            </div>

            <div className="space-y-4">
              <button
                onClick={handleDeleteAccount}
                className="w-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 font-bold py-3 rounded-lg transition-all"
              >
                Supprimer mon compte
              </button>
              <p className="text-gray-400 text-sm text-center">
                Cette action est irréversible. Toutes vos données seront supprimées définitivement.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
