'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Edit, Share2, Settings, TrendingUp, Users, MessageCircle, Trophy, Crown, Flame, Upload, X, Check, ArrowLeft, Clock, Wallet, Euro, ChevronDown, AlertCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { PremiumBadge, PremiumAvatarFrame } from '@/components/PremiumBadge';
import { BeefCard } from '@/components/BeefCard';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  points: number;
  is_premium: boolean;
  premium_settings?: {
    showPremiumBadge: boolean;
    showPremiumFrame: boolean;
    showPremiumAnimations: boolean;
  };
  created_at: string;
}

interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  beefs_resolved: number;
  beefs_unresolved: number;
  beefs_in_progress: number;
  beefs_abandoned: number;
  total_views: number;
  followers: number;
  following: number;
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | string;
  resolution_status?: string;
  tags?: string[];
  scheduled_at?: string;
  created_at: string;
  is_premium: boolean;
  price?: number;
  viewer_count?: number;
}

export default function ProfileContent() {
  const router = useRouter();
  const { user } = useAuth();
  
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    beefs_participated: 0,
    beefs_hosted: 0,
    beefs_resolved: 0,
    beefs_unresolved: 0,
    beefs_in_progress: 0,
    beefs_abandoned: 0,
    total_views: 0,
    followers: 0,
    following: 0,
  });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'debates' | 'gains'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedResolutionFilter, setSelectedResolutionFilter] = useState<string | null>(null);

  // Withdrawal state — amounts stored in EUROS for clarity
  const [withdrawalStep, setWithdrawalStep] = useState<'summary' | 'form' | 'confirm' | 'success'>('summary');
  const [withdrawalMethod, setWithdrawalMethod] = useState<string>('');
  const [withdrawalAmountEuros, setWithdrawalAmountEuros] = useState<number>(20);
  const [withdrawalFields, setWithdrawalFields] = useState<Record<string, string>>({});
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string>('');
  const [withdrawalHistory, setWithdrawalHistory] = useState<any[]>([]);
  // Email + phone selectors
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+33');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);

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

  const getEmailSuggestions = (value: string) => {
    const atIndex = value.indexOf('@');
    if (atIndex === -1) return [];
    const typed = value.slice(atIndex + 1).toLowerCase();
    const username = value.slice(0, atIndex);
    return ALL_EMAIL_PROVIDERS
      .filter(p => typed === '' || p.domain.startsWith(typed))
      .slice(0, 6)
      .map(p => `${username}@${p.domain}`);
  };

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

  // Load user profile
  useEffect(() => {
    if (!user) return;

    setLoading(true);
    
    const loadProfile = async () => {
      try {
        let { data, error } = await supabase
          .from('users')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (!data) {
          console.log('User not found in users table, creating...');
          
          const { data: newUser, error: insertError } = await supabase
            .from('users')
            .insert({
              id: user.id,
              email: user.email || '',
              username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
              display_name: user.user_metadata?.display_name || user.user_metadata?.username || user.email?.split('@')[0] || 'User',
              points: 0,
              is_premium: false,
              is_verified: false,
            })
            .select()
            .single();

          if (insertError) {
            console.error('Error creating user:', insertError);
            throw insertError;
          }

          data = newUser;
        }

        if (data) {
          setProfile({
            id: data.id,
            username: data.username,
            display_name: data.display_name || data.username,
            bio: data.bio,
            avatar_url: data.avatar_url,
            points: data.points || 0,
            is_premium: data.is_premium || false,
            premium_settings: data.premium_settings || {
              showPremiumBadge: true,
              showPremiumFrame: true,
              showPremiumAnimations: true,
            },
            created_at: data.created_at,
          });

          // Load real stats from database
          const { data: followersData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('following_id', data.id);

          const { data: followingData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('follower_id', data.id);

          const { data: beefsData } = await supabase
            .from('beefs')
            .select('*')
            .eq('mediator_id', data.id)
            .order('created_at', { ascending: false })
            .limit(10);

          // Count beefs by resolution status
          const allBeefs = beefsData && beefsData.length > 0 ? beefsData : beefs;
          const resolvedBeefs = allBeefs.filter(beef => beef.resolution_status === 'resolved').length || 0;
          const unresolvedBeefs = allBeefs.filter(beef => beef.resolution_status === 'unresolved').length || 0;
          const inProgressBeefs = allBeefs.filter(beef => beef.resolution_status === 'in_progress' || beef.status === 'live' || beef.status === 'scheduled').length || 0;
          const abandonedBeefs = allBeefs.filter(beef => beef.resolution_status === 'abandoned' || beef.status === 'cancelled').length || 0;

          setStats({
            beefs_participated: allBeefs.length || 0,
            beefs_hosted: allBeefs.length || 0,
            beefs_resolved: resolvedBeefs,
            beefs_unresolved: unresolvedBeefs,
            beefs_in_progress: inProgressBeefs,
            beefs_abandoned: abandonedBeefs,
            total_views: 0, // TODO: Add views tracking
            followers: followersData?.length || 0,
            following: followingData?.length || 0,
          });

          if (beefsData) {
            setBeefs(beefsData);
          }

          // Add fake beefs for demo if no beefs exist
          if (!beefsData || beefsData.length === 0) {
            const fakeBeefs = [
              {
                id: 'fake-1',
                title: 'Conflit de propriété intellectuelle résolu',
                description: 'Médiation réussie sur un conflit de startup',
                status: 'ended',
                resolution_status: 'resolved',
                tags: ['startup', 'propriété', 'tech'],
                created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
                is_premium: false,
                viewer_count: 234,
              },
              {
                id: 'fake-2',
                title: 'Dispute financière non résolue',
                description: 'Tentative de médiation sans accord final',
                status: 'ended',
                resolution_status: 'unresolved',
                tags: ['argent', 'business'],
                created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
                is_premium: false,
                viewer_count: 156,
              },
              {
                id: 'fake-3',
                title: 'Beef en cours - Conflit d\'associés',
                description: 'Médiation actuellement en cours',
                status: 'live',
                resolution_status: 'in_progress',
                tags: ['associés', 'startup', 'management'],
                created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                is_premium: true,
                price: 50,
                viewer_count: 89,
              },
              {
                id: 'fake-4',
                title: 'Beef programmé - Litige contractuel',
                description: 'Médiation prévue dans 2 jours',
                status: 'scheduled',
                resolution_status: 'in_progress',
                tags: ['contrat', 'juridique'],
                scheduled_at: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
                is_premium: false,
                viewer_count: 0,
              },
              {
                id: 'fake-5',
                title: 'Beef abandonné - Participants absents',
                description: 'Annulé par manque de présence',
                status: 'cancelled',
                resolution_status: 'abandoned',
                tags: ['annulé'],
                created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                is_premium: false,
                viewer_count: 12,
              },
              {
                id: 'fake-6',
                title: 'Accord trouvé sur un conflit de marque',
                description: 'Résolution amiable et rapide',
                status: 'ended',
                resolution_status: 'resolved',
                tags: ['marque', 'design', 'business'],
                created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString(),
                is_premium: true,
                price: 30,
                viewer_count: 445,
              },
            ];
            setBeefs(fakeBeefs as any);
          }
        }

      } catch (error) {
        console.error('Error loading profile:', error);
        alert('Erreur lors du chargement du profil. Vérifie la console.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user]);

  // Load withdrawal history when gains tab is active
  useEffect(() => {
    if (activeTab !== 'gains' || !user) return;
    supabase
      .from('withdrawal_requests')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setWithdrawalHistory(data || []));
  }, [activeTab, user]);

  const handleWithdrawalSubmit = async () => {
    if (!user || !profile) return;
    setWithdrawalLoading(true);
    setWithdrawalError('');

    const amountPoints = withdrawalAmountEuros * 100;

    const body: Record<string, any> = {
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
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur serveur');
      setProfile(prev => prev ? { ...prev, points: prev.points - (withdrawalAmountEuros * 100) } : null);
      setWithdrawalStep('success');
    } catch (err: any) {
      setWithdrawalError(err.message);
    } finally {
      setWithdrawalLoading(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;

    setUploading(true);

    try {
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: data.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile((prev) => prev ? { ...prev, avatar_url: data.publicUrl } : null);
      alert('Avatar mis à jour avec succès!');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      alert('Erreur lors de l\'upload de l\'avatar.');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement du profil...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">Erreur lors du chargement du profil</p>
        </div>
      </div>
    );
  }

  const showPremiumBadge = profile.is_premium && profile.premium_settings?.showPremiumBadge;
  const showPremiumFrame = profile.is_premium && profile.premium_settings?.showPremiumFrame;

  return (
    <div className="min-h-screen bg-gradient-to-br from-black via-gray-900 to-black">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* Back button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-semibold">Retour</span>
        </button>

        {/* Profile Header */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl border border-gray-700 overflow-hidden mb-6">
          {/* Cover Image */}
          <div className="h-48 bg-gradient-to-r from-red-500/20 via-orange-500/20 to-yellow-500/20 relative">
            <div className="absolute inset-0 bg-[url('/grid-pattern.svg')] opacity-10"></div>
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            {/* Avatar */}
            <div className="flex items-end justify-between mb-4">
              <div className="relative">
                <div className="w-32 h-32 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-4 border-gray-900 overflow-hidden flex items-center justify-center text-4xl font-black text-white">
                  {profile.avatar_url ? (
                    <img
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    profile.username[0].toUpperCase()
                  )}
                </div>

                <label className="absolute bottom-0 right-0 w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-orange-600 transition-colors">
                  <Camera className="w-5 h-5 text-white" />
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarUpload}
                    disabled={uploading}
                  />
                </label>
              </div>

              <div className="flex gap-2">
                <button className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-lg text-white font-semibold transition-colors flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Partager
                </button>
                <Link
                  href="/settings"
                  className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg text-white font-semibold transition-colors flex items-center gap-2"
                >
                  <Settings className="w-4 h-4" />
                  Modifier
                </Link>
              </div>
            </div>

            {/* User Info */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="text-3xl font-black text-white">{profile.display_name}</h1>
              </div>
              <p className="text-gray-400 text-sm">@{profile.username}</p>
            </div>

            {profile.bio && (
              <p className="text-gray-300 mb-4">{profile.bio}</p>
            )}

            {/* Stats Row */}
            <div className="flex gap-6 mb-4 flex-wrap">
              <div>
                <span className="text-2xl font-black text-white">{stats.beefs_participated}</span>
                <span className="text-gray-400 text-sm ml-1">Beefs</span>
              </div>
              <div>
                <span className="text-2xl font-black text-white">{stats.followers}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnés</span>
              </div>
              <div>
                <span className="text-2xl font-black text-white">{stats.following}</span>
                <span className="text-gray-400 text-sm ml-1">Abonnements</span>
              </div>
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-orange-500" />
                <span className="text-2xl font-black text-white">{profile.points}</span>
                <span className="text-gray-400 text-sm">Points</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-2xl border border-gray-700 p-6">
          <div className="flex gap-4 mb-6 border-b border-gray-700 pb-4">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                activeTab === 'stats'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Statistiques
            </button>
            <button
              onClick={() => setActiveTab('debates')}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                activeTab === 'debates'
                  ? 'bg-orange-500 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Flame className="w-4 h-4 inline mr-2" />
              Mes Beefs
            </button>
            <button
              onClick={() => { setActiveTab('gains'); setWithdrawalStep('summary'); }}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                activeTab === 'gains'
                  ? 'bg-green-600 text-white'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <Wallet className="w-4 h-4 inline mr-2" />
              Mes Gains
            </button>
          </div>

          {activeTab === 'stats' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-4">📊 Résultats des médiations</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Resolved */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'resolved' ? null : 'resolved')}
                  className={`bg-gradient-to-br from-green-500/10 to-green-600/5 border rounded-xl p-4 text-left transition-all hover:scale-105 ${
                    selectedResolutionFilter === 'resolved' 
                      ? 'border-green-500 ring-2 ring-green-500/50' 
                      : 'border-green-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-green-500/20 rounded-full flex items-center justify-center">
                      <Check className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{stats.beefs_resolved}</p>
                      <p className="text-green-400 text-xs font-semibold">Résolus</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">Conflits réglés avec succès</p>
                  {selectedResolutionFilter === 'resolved' && (
                    <p className="text-green-400 text-xs mt-2 font-semibold">✓ Filtre actif</p>
                  )}
                </button>

                {/* In Progress */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'in_progress' ? null : 'in_progress')}
                  className={`bg-gradient-to-br from-blue-500/10 to-blue-600/5 border rounded-xl p-4 text-left transition-all hover:scale-105 ${
                    selectedResolutionFilter === 'in_progress' 
                      ? 'border-blue-500 ring-2 ring-blue-500/50' 
                      : 'border-blue-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-blue-500/20 rounded-full flex items-center justify-center">
                      <Clock className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{stats.beefs_in_progress}</p>
                      <p className="text-blue-400 text-xs font-semibold">En cours</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">Beefs actifs ou programmés</p>
                  {selectedResolutionFilter === 'in_progress' && (
                    <p className="text-blue-400 text-xs mt-2 font-semibold">✓ Filtre actif</p>
                  )}
                </button>

                {/* Unresolved */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'unresolved' ? null : 'unresolved')}
                  className={`bg-gradient-to-br from-orange-500/10 to-orange-600/5 border rounded-xl p-4 text-left transition-all hover:scale-105 ${
                    selectedResolutionFilter === 'unresolved' 
                      ? 'border-orange-500 ring-2 ring-orange-500/50' 
                      : 'border-orange-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-orange-500/20 rounded-full flex items-center justify-center">
                      <X className="w-5 h-5 text-orange-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{stats.beefs_unresolved}</p>
                      <p className="text-orange-400 text-xs font-semibold">Non résolus</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">Médiation sans accord</p>
                  {selectedResolutionFilter === 'unresolved' && (
                    <p className="text-orange-400 text-xs mt-2 font-semibold">✓ Filtre actif</p>
                  )}
                </button>

                {/* Abandoned */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'abandoned' ? null : 'abandoned')}
                  className={`bg-gradient-to-br from-gray-500/10 to-gray-600/5 border rounded-xl p-4 text-left transition-all hover:scale-105 ${
                    selectedResolutionFilter === 'abandoned' 
                      ? 'border-gray-400 ring-2 ring-gray-400/50' 
                      : 'border-gray-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-gray-500/20 rounded-full flex items-center justify-center">
                      <Flame className="w-5 h-5 text-gray-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{stats.beefs_abandoned}</p>
                      <p className="text-gray-400 text-xs font-semibold">Abandonnés</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">Beefs annulés</p>
                  {selectedResolutionFilter === 'abandoned' && (
                    <p className="text-gray-400 text-xs mt-2 font-semibold">✓ Filtre actif</p>
                  )}
                </button>
              </div>

              {/* Filtered Beefs List */}
              {selectedResolutionFilter && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-8"
                >
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">
                      {selectedResolutionFilter === 'resolved' && '✅ Beefs Résolus'}
                      {selectedResolutionFilter === 'in_progress' && '⏳ Beefs En Cours'}
                      {selectedResolutionFilter === 'unresolved' && '❌ Beefs Non Résolus'}
                      {selectedResolutionFilter === 'abandoned' && '🚫 Beefs Abandonnés'}
                    </h3>
                    <button
                      onClick={() => setSelectedResolutionFilter(null)}
                      className="text-gray-400 hover:text-white text-sm font-semibold"
                    >
                      Réinitialiser
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {beefs
                      .filter(beef => beef.resolution_status === selectedResolutionFilter)
                      .map((beef, idx) => (
                        <BeefCard
                          key={beef.id}
                          id={beef.id}
                          index={idx}
                          title={beef.title}
                          host_name={profile?.display_name || profile?.username || 'Utilisateur'}
                          status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                          created_at={beef.created_at}
                          viewer_count={beef.viewer_count || 0}
                          tags={beef.tags}
                          scheduled_at={beef.scheduled_at}
                          is_premium={beef.is_premium}
                          price={beef.price}
                          onClick={() => router.push(`/arena/${beef.id}`)}
                        />
                      ))}
                    {beefs.filter(beef => beef.resolution_status === selectedResolutionFilter).length === 0 && (
                      <div className="text-center py-12 bg-white/5 rounded-xl">
                        <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Aucun beef dans cette catégorie</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Success Rate */}
              <div className="bg-white/5 rounded-xl p-6 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-white mb-1">Taux de réussite</h3>
                    <p className="text-gray-400 text-sm">Pourcentage de beefs résolus avec succès</p>
                  </div>
                  <div className="text-right">
                    <p className="text-4xl font-black bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                      {stats.beefs_hosted > 0 ? Math.round((stats.beefs_resolved / stats.beefs_hosted) * 100) : 0}%
                    </p>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="w-full h-3 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-green-500 to-blue-500 transition-all duration-500"
                    style={{ width: `${stats.beefs_hosted > 0 ? (stats.beefs_resolved / stats.beefs_hosted) * 100 : 0}%` }}
                  />
                </div>
              </div>

              {/* Other Stats */}
              <h3 className="text-white font-bold text-lg mb-4">📈 Autres statistiques</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white/5 rounded-xl p-6">
                  <Trophy className="w-8 h-8 text-yellow-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Beefs Hébergés</h3>
                  <p className="text-3xl font-black text-white">{stats.beefs_hosted}</p>
                  <p className="text-gray-400 text-sm mt-1">Total de médiations effectuées</p>
                </div>
                <div className="bg-white/5 rounded-xl p-6">
                  <Users className="w-8 h-8 text-blue-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Vues Totales</h3>
                  <p className="text-3xl font-black text-white">{stats.total_views.toLocaleString()}</p>
                  <p className="text-gray-400 text-sm mt-1">Popularité des beefs</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'debates' && (
            <div>
              {beefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {beefs.map((beef, idx) => (
                    <BeefCard
                      key={beef.id}
                      id={beef.id}
                      index={idx}
                      title={beef.title}
                      host_name={profile?.display_name || profile?.username || 'Utilisateur'}
                      status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                      created_at={beef.created_at}
                      viewer_count={beef.viewer_count || 0}
                      tags={beef.tags}
                      scheduled_at={beef.scheduled_at}
                      is_premium={beef.is_premium}
                      price={beef.price}
                      onClick={() => router.push(`/arena/${beef.id}`)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">Aucun beef pour le moment</p>
                  <Link
                    href="/live"
                    className="inline-block px-6 py-3 bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 text-black font-bold rounded-lg transition-all"
                  >
                    Créer un beef
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* ── GAINS TAB ── */}
          {activeTab === 'gains' && (
            <div>
              {/* Balance card */}
              <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border border-green-500/30 rounded-2xl p-6 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-gray-400 text-sm font-medium mb-1">Solde disponible</p>
                    <p className="text-4xl font-black text-white">
                      {((profile?.points || 0) / 100).toFixed(2)}€
                    </p>
                    <p className="text-gray-500 text-xs mt-1">{profile?.points || 0} pts · 100 pts = 1€</p>
                  </div>
                  <div className="w-16 h-16 bg-green-500/20 rounded-2xl flex items-center justify-center">
                    <Euro className="w-8 h-8 text-green-400" />
                  </div>
                </div>
                <div className="mt-4 p-3 bg-green-500/10 rounded-xl">
                  <p className="text-green-400 text-xs font-semibold">✅ Vous recevez exactement le montant demandé — aucuns frais déduits</p>
                </div>
              </div>

              {/* Solde insuffisant */}
              {(profile?.points || 0) < 2000 && (
                <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-orange-300 font-semibold text-sm">Minimum non atteint</p>
                    <p className="text-gray-400 text-sm">
                      Il vous faut au moins <strong>20€</strong> (2 000 pts) pour retirer. Il vous manque{' '}
                      {((Math.max(0, 2000 - (profile?.points || 0))) / 100).toFixed(0)}€.
                    </p>
                  </div>
                </div>
              )}

              {/* Step 1 — Montant + méthode */}
              {withdrawalStep === 'summary' && (profile?.points || 0) >= 2000 && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <h3 className="text-white font-bold text-lg mb-4">Retirer mes gains</h3>

                  {/* Montant en EUROS */}
                  <div className="bg-white/5 rounded-xl p-5 mb-4">
                    <label className="text-gray-300 text-sm font-semibold block mb-3">Combien voulez-vous retirer ?</label>
                    <div className="flex items-center gap-3 bg-white/10 border border-white/20 rounded-lg px-4 py-3 focus-within:border-green-500 transition-colors">
                      <span className="text-gray-400 font-bold text-lg">€</span>
                      <input
                        type="number"
                        min={20}
                        max={Math.floor((profile?.points || 0) / 100)}
                        step={1}
                        value={withdrawalAmountEuros}
                        onChange={e => {
                          const val = Math.min(Number(e.target.value), Math.floor((profile?.points || 0) / 100));
                          setWithdrawalAmountEuros(val);
                        }}
                        className="flex-1 bg-transparent text-white text-lg font-bold focus:outline-none"
                        placeholder="20"
                      />
                    </div>
                    <p className="text-gray-500 text-xs mt-2">
                      = {withdrawalAmountEuros * 100} pts · Solde restant après retrait : {((profile?.points || 0) / 100 - withdrawalAmountEuros).toFixed(2)}€
                    </p>
                  </div>

                  {/* Méthode */}
                  <div className="bg-white/5 rounded-xl p-5 mb-2">
                    <label className="text-gray-300 text-sm font-semibold block mb-3">
                      Méthode de retrait
                      {!withdrawalMethod && <span className="text-orange-400 ml-2 text-xs">← Sélectionnez une méthode</span>}
                    </label>
                    <div className="grid grid-cols-1 gap-2">
                      {[
                        { id: 'iban', label: '🏦 Virement bancaire (IBAN)', desc: 'Europe — 3-5 jours ouvrés' },
                        { id: 'paypal', label: '💙 PayPal', desc: 'Mondial — 1-2 jours ouvrés' },
                        { id: 'orange_money', label: '🟠 Orange Money', desc: 'Afrique francophone — 24h' },
                        { id: 'wave', label: '🔵 Wave', desc: "Sénégal, Côte d'Ivoire — 24h" },
                      ].map(m => (
                        <button
                          key={m.id}
                          onClick={() => setWithdrawalMethod(m.id)}
                          className={`flex items-center justify-between px-4 py-3 rounded-xl text-left transition-all border ${
                            withdrawalMethod === m.id
                              ? 'border-green-500 bg-green-500/10 text-white'
                              : 'border-white/10 bg-white/5 text-gray-300 hover:border-white/30'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-sm">{m.label}</p>
                            <p className="text-xs text-gray-400">{m.desc}</p>
                          </div>
                          {withdrawalMethod === m.id && <Check className="w-5 h-5 text-green-400 flex-shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    disabled={!withdrawalMethod || withdrawalAmountEuros < 20}
                    onClick={() => setWithdrawalStep('form')}
                    className="w-full py-4 mt-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all"
                  >
                    {!withdrawalMethod ? 'Sélectionnez une méthode pour continuer' : `Continuer — Retirer ${withdrawalAmountEuros}€ →`}
                  </button>
                </motion.div>
              )}

              {/* Step 2 — Coordonnées */}
              {withdrawalStep === 'form' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <button onClick={() => setWithdrawalStep('summary')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm">
                    <ArrowLeft className="w-4 h-4" /> Retour
                  </button>
                  <h3 className="text-white font-bold text-lg mb-4">
                    Coordonnées pour {withdrawalAmountEuros}€
                  </h3>

                  <div className="bg-white/5 rounded-xl p-5 mb-6 space-y-4">
                    {withdrawalMethod === 'iban' && (
                      <>
                        <div>
                          <label className="text-gray-300 text-sm font-semibold block mb-2">Nom du titulaire du compte</label>
                          <input
                            type="text"
                            placeholder="Prénom Nom"
                            value={withdrawalFields.accountHolderName || ''}
                            onChange={e => setWithdrawalFields(p => ({ ...p, accountHolderName: e.target.value }))}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                          />
                        </div>
                        <div>
                          <label className="text-gray-300 text-sm font-semibold block mb-2">IBAN</label>
                          <input
                            type="text"
                            placeholder="FR76 1234 5678 9012 3456 7890 123"
                            value={withdrawalFields.iban || ''}
                            onChange={e => setWithdrawalFields(p => ({ ...p, iban: e.target.value.toUpperCase() }))}
                            className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 font-mono text-sm"
                          />
                        </div>
                      </>
                    )}
                    {withdrawalMethod === 'paypal' && (
                      <div className="relative">
                        <label className="text-gray-300 text-sm font-semibold block mb-2">Adresse email PayPal</label>
                        <input
                          type="email"
                          placeholder="votre@email.com"
                          value={withdrawalFields.paypalEmail || ''}
                          autoComplete="off"
                          onChange={e => {
                            setWithdrawalFields(p => ({ ...p, paypalEmail: e.target.value }));
                            setShowEmailSuggestions(e.target.value.includes('@'));
                          }}
                          onFocus={() => setShowEmailSuggestions((withdrawalFields.paypalEmail || '').includes('@'))}
                          onBlur={() => setTimeout(() => setShowEmailSuggestions(false), 150)}
                          className="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                        />
                        {/* Autocomplete suggestions */}
                        {showEmailSuggestions && getEmailSuggestions(withdrawalFields.paypalEmail || '').length > 0 && (
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-50 py-1 overflow-hidden">
                            {getEmailSuggestions(withdrawalFields.paypalEmail || '').map((suggestion, i) => (
                              <button
                                key={i}
                                type="button"
                                onMouseDown={() => {
                                  setWithdrawalFields(p => ({ ...p, paypalEmail: suggestion }));
                                  setShowEmailSuggestions(false);
                                }}
                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-white/10 transition-colors text-gray-200"
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
                        <label className="text-gray-300 text-sm font-semibold block mb-2">Numéro de téléphone Mobile Money</label>
                        <div className="flex gap-2">
                          {/* Country code selector */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={() => setShowCountryDropdown(v => !v)}
                              className="flex items-center gap-2 bg-white/10 border border-white/20 hover:border-white/40 rounded-lg px-3 py-3 text-white text-sm font-semibold whitespace-nowrap transition-colors"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`https://flagcdn.com/20x15/${COUNTRY_CODES.find(c => c.code === phoneCountryCode)?.iso || 'fr'}.png`}
                                alt=""
                                width={20}
                                height={15}
                                className="rounded-sm"
                              />
                              {phoneCountryCode}
                              <ChevronDown className="w-3 h-3 text-gray-400" />
                            </button>
                            {showCountryDropdown && (
                              <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl z-50 w-56 py-1 max-h-72 overflow-y-auto">
                                {COUNTRY_CODES.map((c, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => {
                                      setPhoneCountryCode(c.code);
                                      setShowCountryDropdown(false);
                                      setWithdrawalFields(prev => ({ ...prev, mobileNumber: `${c.code}${phoneNumber}` }));
                                    }}
                                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left hover:bg-white/10 transition-colors ${phoneCountryCode === c.code ? 'text-green-400 font-semibold' : 'text-gray-200'}`}
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
                                      <p className="text-gray-500 text-xs">{c.code}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {/* Phone number */}
                          <input
                            type="tel"
                            placeholder="77 000 00 00"
                            value={phoneNumber}
                            onChange={e => {
                              const digits = e.target.value.replace(/[^\d\s]/g, '');
                              setPhoneNumber(digits);
                              setWithdrawalFields(p => ({ ...p, mobileNumber: `${phoneCountryCode}${digits.replace(/\s/g, '')}` }));
                            }}
                            className="flex-1 bg-white/10 border border-white/20 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-green-500"
                          />
                        </div>
                        {phoneNumber && (
                          <p className="text-green-400 text-xs mt-2">Numéro complet : <strong>{phoneCountryCode} {phoneNumber}</strong></p>
                        )}
                      </div>
                    )}
                  </div>

                  {withdrawalError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-red-300 text-sm">{withdrawalError}</p>
                    </div>
                  )}

                  <button
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
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all"
                  >
                    Vérifier ma demande →
                  </button>
                </motion.div>
              )}

              {/* Step 3 — Confirmation */}
              {withdrawalStep === 'confirm' && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
                  <button onClick={() => setWithdrawalStep('form')} className="flex items-center gap-2 text-gray-400 hover:text-white mb-4 text-sm">
                    <ArrowLeft className="w-4 h-4" /> Modifier
                  </button>
                  <h3 className="text-white font-bold text-lg mb-4">Confirmer le retrait</h3>

                  <div className="bg-white/5 rounded-xl p-5 mb-6 space-y-3">
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Montant demandé</span>
                      <span className="text-white font-bold">{withdrawalAmountEuros}€</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Frais déduits</span>
                      <span className="text-green-400 font-bold">0€</span>
                    </div>
                    <div className="border-t border-white/10 pt-3 flex justify-between items-center">
                      <span className="text-white font-bold">Vous recevez</span>
                      <span className="text-2xl font-black text-green-400">{withdrawalAmountEuros}€</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400 text-sm">Méthode</span>
                      <span className="text-white text-sm capitalize">{withdrawalMethod.replace('_', ' ')}</span>
                    </div>
                    {withdrawalFields.iban && (
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">IBAN</span>
                        <span className="text-white text-sm font-mono">••••{withdrawalFields.iban.slice(-4)}</span>
                      </div>
                    )}
                    {withdrawalFields.paypalEmail && (
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">PayPal</span>
                        <span className="text-white text-sm">{withdrawalFields.paypalEmail}</span>
                      </div>
                    )}
                    {withdrawalFields.mobileNumber && (
                      <div className="flex justify-between">
                        <span className="text-gray-400 text-sm">Numéro</span>
                        <span className="text-white text-sm">{withdrawalFields.mobileNumber}</span>
                      </div>
                    )}
                    <p className="text-gray-500 text-xs pt-2">⏱ Traitement sous 5-7 jours ouvrés</p>
                  </div>

                  {withdrawalError && (
                    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 mb-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-red-300 text-sm">{withdrawalError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleWithdrawalSubmit}
                    disabled={withdrawalLoading}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2"
                  >
                    {withdrawalLoading
                      ? <><span className="animate-spin inline-block">⏳</span> Envoi en cours...</>
                      : <>✅ Confirmer — Recevoir {withdrawalAmountEuros}€</>
                    }
                  </button>
                </motion.div>
              )}

              {/* Step 4 — Succès */}
              {withdrawalStep === 'success' && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-8">
                  <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Check className="w-10 h-10 text-green-400" />
                  </div>
                  <h3 className="text-2xl font-black text-white mb-2">Demande envoyée !</h3>
                  <p className="text-gray-400 mb-2">
                    Votre retrait de <span className="text-green-400 font-bold">{withdrawalAmountEuros}€</span> est en cours de traitement.
                  </p>
                  <p className="text-gray-500 text-sm mb-6">Un email de confirmation vous sera envoyé une fois le virement effectué (5-7 jours ouvrés).</p>
                  <button
                    onClick={() => { setWithdrawalStep('summary'); setWithdrawalError(''); setWithdrawalFields({}); setWithdrawalMethod(''); setWithdrawalAmountEuros(20); }}
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-xl text-white font-semibold transition-all"
                  >
                    Retour au profil
                  </button>
                </motion.div>
              )}

              {/* Historique */}
              {withdrawalHistory.length > 0 && withdrawalStep === 'summary' && (
                <div className="mt-8">
                  <h3 className="text-white font-bold text-lg mb-4">Historique des retraits</h3>
                  <div className="space-y-3">
                    {withdrawalHistory.map((r) => (
                      <div key={r.id} className="bg-white/5 rounded-xl p-4 flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold">{parseFloat(r.amount_euros).toFixed(2)}€</p>
                          <p className="text-gray-400 text-xs">{r.method.replace('_', ' ')} · {new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                          {r.admin_note && <p className="text-gray-500 text-xs italic mt-1">{r.admin_note}</p>}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          r.status === 'paid'       ? 'bg-green-500/20 text-green-400' :
                          r.status === 'pending'    ? 'bg-orange-500/20 text-orange-400' :
                          r.status === 'processing' ? 'bg-blue-500/20 text-blue-400' :
                                                      'bg-red-500/20 text-red-400'
                        }`}>
                          {r.status === 'paid' ? '✅ Payé' : r.status === 'pending' ? '⏳ En attente' : r.status === 'processing' ? '🔄 En cours' : '❌ Refusé'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
