'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, User, Lock, Mail, Save, Eye, EyeOff, Shield, Bell, X, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  
  const [profile, setProfile] = useState({
    username: '',
    display_name: '',
    bio: '',
    email: '',
  });
  
  const [passwords, setPasswords] = useState({
    current: '',
    new: '',
    confirm: '',
  });
  
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false,
  });
  
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!user) {
      router.push('/login?redirect=/settings');
      return;
    }
    loadProfile();
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, display_name, bio')
        .eq('id', user.id)
        .single();

      if (data) {
        setProfile({
          username: data.username || '',
          display_name: data.display_name || '',
          bio: data.bio || '',
          email: user.email || '',
        });
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
      setPasswords({ current: '', new: '', confirm: '' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Erreur lors du changement de mot de passe' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer définitivement votre compte? Cette action est irréversible.')) {
      return;
    }

    try {
      // Delete user data
      await supabase.from('users').delete().eq('id', user?.id);
      
      // Sign out
      await signOut();
      router.push('/');
    } catch (error) {
      setMessage({ type: 'error', text: 'Erreur lors de la suppression du compte' });
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
