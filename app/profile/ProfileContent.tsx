'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Edit, Share2, Settings, TrendingUp, Users, MessageCircle, Trophy, Crown, Flame, Upload, X, Check, ArrowLeft, Clock, Wallet, Euro, ChevronDown, AlertCircle, Eye } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { PremiumBadge, PremiumAvatarFrame } from '@/components/PremiumBadge';
import { BeefCard } from '@/components/BeefCard';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import {
  type StatsShortcuts,
  DEFAULT_STATS_SHORTCUTS,
  mergeStatsShortcuts,
} from '@/lib/profile-stats-shortcuts';
import { mediationCategoryForBeef } from '@/lib/mediation-resolution';
import { StatShortcutToggles } from '@/components/StatShortcutToggles';
import { MediationBeefEditorPanel } from '@/components/MediationBeefEditorPanel';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  accent_color?: string;
  points: number;
  is_premium: boolean;
  premium_settings?: {
    showPremiumBadge: boolean;
    showPremiumFrame: boolean;
    showPremiumAnimations: boolean;
    /** Liens cliquables sur les stats (profil public + ton profil éditable) */
    statsShortcuts?: StatsShortcuts;
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
  mediation_summary?: string | null;
  tags?: string[];
  scheduled_at?: string;
  created_at: string;
  is_premium: boolean;
  price?: number;
  viewer_count?: number;
  mediator_id?: string;
  /** Nom affiché sur BeefCard (médiateur du beef) */
  card_host_name?: string;
}

export default function ProfileContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  
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
  const [mediationBeefs, setMediationBeefs] = useState<Beef[]>([]);
  const [recentBeefs, setRecentBeefs] = useState<Beef[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'debates' | 'gains'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedResolutionFilter, setSelectedResolutionFilter] = useState<string | null>(null);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [statsShortcuts, setStatsShortcuts] = useState<StatsShortcuts>({ ...DEFAULT_STATS_SHORTCUTS });

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
            banner_url: data.banner_url,
            accent_color: data.accent_color || '#E83A14',
            points: data.points || 0,
            is_premium: data.is_premium || false,
            premium_settings: data.premium_settings || {
              showPremiumBadge: true,
              showPremiumFrame: true,
              showPremiumAnimations: true,
            },
            created_at: data.created_at,
          });

          setStatsShortcuts(mergeStatsShortcuts(data.premium_settings?.statsShortcuts));

          // Load real stats from database
          const { data: followersData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('following_id', data.id);

          const { data: followingData } = await supabase
            .from('followers')
            .select('id', { count: 'exact' })
            .eq('follower_id', data.id);

          const { data: mediatedRows } = await supabase
            .from('beefs')
            .select('*')
            .eq('mediator_id', data.id)
            .order('created_at', { ascending: false });

          const { data: participantRows } = await supabase
            .from('beef_participants')
            .select('beef_id, beefs(*)')
            .eq('user_id', data.id);

          const mediatedList = (mediatedRows || []) as Beef[];
          const fromParticipants: Beef[] = [];
          for (const row of participantRows || []) {
            const raw = row.beefs as Beef | Beef[] | null | undefined;
            if (!raw) continue;
            const b = Array.isArray(raw) ? raw[0] : raw;
            if (b) fromParticipants.push(b as Beef);
          }

          const mergedById = new Map<string, Beef>();
          mediatedList.forEach((b) => mergedById.set(b.id, b));
          fromParticipants.forEach((b) => {
            if (!mergedById.has(b.id)) mergedById.set(b.id, b);
          });

          const mergedSorted = [...mergedById.values()].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          const displayNameSelf = data.display_name || data.username || 'Utilisateur';
          const mediatorIds = [...new Set(mergedSorted.map((b) => b.mediator_id).filter(Boolean))] as string[];
          const mediatorMap: Record<string, string> = {};
          if (mediatorIds.length > 0) {
            const { data: mu } = await supabase
              .from('users')
              .select('id, display_name, username')
              .in('id', mediatorIds);
            (mu || []).forEach((u: { id: string; display_name?: string; username?: string }) => {
              mediatorMap[u.id] = u.display_name || u.username || 'Médiateur';
            });
          }

          const attachHost = (b: Beef): Beef => ({
            ...b,
            card_host_name:
              b.mediator_id === data.id
                ? displayNameSelf
                : (b.mediator_id && mediatorMap[b.mediator_id]) || 'Médiateur',
          });

          const beefsParticipatedCount = new Set((participantRows || []).map((r: { beef_id: string }) => r.beef_id)).size;
          const beefsHostedCount = mediatedList.length;

          // Résolution stats = uniquement beefs médiés (catégorie dérivée status + resolution_status)
          const resolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'resolved').length || 0;
          const unresolvedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'unresolved').length || 0;
          const inProgressBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'in_progress').length || 0;
          const abandonedBeefs =
            mediatedList.filter((beef) => mediationCategoryForBeef(beef) === 'abandoned').length || 0;

          setStats({
            beefs_participated: beefsParticipatedCount,
            beefs_hosted: beefsHostedCount,
            beefs_resolved: resolvedBeefs,
            beefs_unresolved: unresolvedBeefs,
            beefs_in_progress: inProgressBeefs,
            beefs_abandoned: abandonedBeefs,
            total_views: 0,
            followers: followersData?.length || 0,
            following: followingData?.length || 0,
          });

          setBeefs(mergedSorted.map(attachHost));
          setRecentBeefs(mergedSorted.slice(0, 5).map(attachHost));
          setMediationBeefs(mediatedList.map((b) => attachHost({ ...b, card_host_name: displayNameSelf })));
        }

      } catch (error) {
        console.error('Error loading profile:', error);
        toast('Erreur lors du chargement du profil. Vérifie la console.', 'error');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [user, toast]);

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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'debates' || tab === 'stats' || tab === 'gains') {
      setActiveTab(tab);
    }
  }, []);

  const closePublicPreview = useCallback(() => setPublicPreviewOpen(false), []);

  const applyMediationBeefPatch = useCallback(
    (beefId: string, patch: { resolution_status?: string; mediation_summary?: string | null }) => {
      setBeefs((prev) => prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b)));
      setRecentBeefs((prev) => prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b)));
      setMediationBeefs((prev) => {
        const next = prev.map((b) => (b.id === beefId ? { ...b, ...patch } : b));
        setStats((s) => ({
          ...s,
          beefs_resolved: next.filter((b) => mediationCategoryForBeef(b) === 'resolved').length,
          beefs_unresolved: next.filter((b) => mediationCategoryForBeef(b) === 'unresolved').length,
          beefs_in_progress: next.filter((b) => mediationCategoryForBeef(b) === 'in_progress').length,
          beefs_abandoned: next.filter((b) => mediationCategoryForBeef(b) === 'abandoned').length,
        }));
        return next;
      });
    },
    [],
  );

  const persistStatsShortcut = useCallback(
    (key: keyof StatsShortcuts, value: boolean) => {
      if (!user || !profile) return;
      const previous = statsShortcuts;
      const next: StatsShortcuts = { ...statsShortcuts, [key]: value };
      setStatsShortcuts(next);
      const premium_settings = {
        ...profile.premium_settings,
        showPremiumBadge: profile.premium_settings?.showPremiumBadge ?? true,
        showPremiumFrame: profile.premium_settings?.showPremiumFrame ?? true,
        showPremiumAnimations: profile.premium_settings?.showPremiumAnimations ?? true,
        statsShortcuts: next,
      };
      void (async () => {
        const { error } = await supabase.from('users').update({ premium_settings }).eq('id', user.id);
        if (error) {
          toast('Impossible d’enregistrer les préférences', 'error');
          setStatsShortcuts(previous);
          return;
        }
        setProfile((p) => (p ? { ...p, premium_settings } : null));
      })();
    },
    [user, profile, statsShortcuts, toast],
  );

  const goPreviewParticipations = useCallback(() => {
    closePublicPreview();
    router.push('/profile?tab=debates');
  }, [closePublicPreview, router]);

  const goPreviewMediations = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#beefs`);
  }, [closePublicPreview, profile, router]);

  const goPreviewFollowers = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#followers`);
  }, [closePublicPreview, profile, router]);

  const goPreviewFollowing = useCallback(() => {
    if (!profile) return;
    closePublicPreview();
    router.push(`/profile/${encodeURIComponent(profile.username)}#following`);
  }, [closePublicPreview, profile, router]);

  const goStatsParticipations = useCallback(() => {
    setActiveTab('debates');
  }, []);

  const goStatsMediations = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#beefs`);
  }, [profile, router]);

  const goStatsFollowers = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#followers`);
  }, [profile, router]);

  const goStatsFollowing = useCallback(() => {
    if (!profile) return;
    router.push(`/profile/${encodeURIComponent(profile.username)}#following`);
  }, [profile, router]);

  useEffect(() => {
    if (!publicPreviewOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closePublicPreview();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [publicPreviewOpen, closePublicPreview]);

  useEffect(() => {
    if (!publicPreviewOpen) return;
    const t = window.setTimeout(() => {
      document.getElementById('profile-preview-close')?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [publicPreviewOpen]);

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
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/withdrawals/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`,
        },
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

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    
    try {
      const file = e.target.files[0];
      const fileExt = file.name.split('.').pop();
      const fileName = `banner_${user.id}_${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ banner_url: data.publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setProfile(prev => prev ? { ...prev, banner_url: data.publicUrl } : null);
      toast('Bannière mise à jour !', 'success');
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast('Erreur lors de l\'upload de la bannière', 'error');
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
      toast('Avatar mis à jour avec succès!', 'success');
    } catch (error) {
      console.error('Error uploading avatar:', error);
      toast('Erreur lors de l\'upload de l\'avatar.', 'error');
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Cover skeleton */}
          <div className="skeleton h-40 rounded-2xl mb-6" />
          {/* Avatar + info skeleton */}
          <div className="flex items-end gap-4 -mt-16 mb-6 px-4">
            <div className="skeleton w-24 h-24 rounded-full ring-4 ring-black" />
            <div className="flex-1 space-y-2 pb-2">
              <div className="skeleton h-6 w-40" />
              <div className="skeleton h-4 w-24" />
            </div>
          </div>
          {/* Stats skeleton */}
          <div className="flex gap-6 mb-6 px-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-8 w-20 rounded-lg" />
            ))}
          </div>
          {/* Tabs skeleton */}
          <div className="card p-6">
            <div className="flex gap-4 mb-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-10 w-28 rounded-[2px]" />
              ))}
            </div>
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-24 rounded-[2px]" />
              ))}
            </div>
          </div>
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
    <div className="min-h-screen bg-black">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />

        {/* Profile Header */}
        <div className="card rounded-3xl overflow-hidden mb-6">
          {/* Cover Image */}
          <div className="h-48 relative overflow-hidden group">
            {profile.banner_url ? (
              <Image src={profile.banner_url} alt="Banner" fill className="object-cover" sizes="100vw" priority />
            ) : (
              <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${profile.accent_color || '#E83A14'}33, ${profile.accent_color || '#E83A14'}11)` }} />
            )}
            <label className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all cursor-pointer opacity-0 group-hover:opacity-100">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-[2px] text-white text-sm font-medium">
                <Camera className="w-4 h-4" />
                <span>Changer la bannière</span>
              </div>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleBannerUpload}
              />
            </label>
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            {/* Avatar */}
            <div className="flex items-end justify-between mb-4">
              <div className="relative">
                <div className="relative w-32 h-32 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 border-4 overflow-hidden flex items-center justify-center text-4xl font-black text-white" style={{ borderColor: profile.accent_color || '#E83A14' }}>
                  {profile.avatar_url ? (
                    <Image
                      src={profile.avatar_url}
                      alt={profile.display_name}
                      fill
                      className="object-cover"
                      sizes="128px"
                      priority
                    />
                  ) : (
                    profile.username[0].toUpperCase()
                  )}
                </div>

                <label className="absolute bottom-0 right-0 w-10 h-10 bg-brand-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-brand-600 transition-colors">
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

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setPublicPreviewOpen(true)}
                  className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-[2px] text-white font-semibold transition-colors flex items-center gap-2 text-sm"
                  title="Voir ton profil public tel qu’il apparaît pour les autres"
                >
                  <Eye className="w-4 h-4" aria-hidden />
                  Aperçu
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const shareData = {
                      title: `${profile.display_name} sur Beefs`,
                      text: `Regarde le profil de ${profile.display_name} sur Beefs !`,
                      url: `${window.location.origin}/profile/${profile.username}`,
                    };
                    if (navigator.share) {
                      try { await navigator.share(shareData); } catch (_) {}
                    } else {
                      await navigator.clipboard.writeText(shareData.url);
                      toast('Lien copié !', 'success');
                    }
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 rounded-[2px] text-white font-semibold transition-colors flex items-center gap-2"
                >
                  <Share2 className="w-4 h-4" />
                  Partager
                </button>
                <Link
                  href={hrefWithFrom('/settings', pathname)}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 rounded-lg text-white font-semibold transition-colors flex items-center gap-2"
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

            {/* Points — mis en avant */}
            <div className="mb-5 rounded-2xl bg-gradient-to-r from-brand-500/15 via-amber-500/10 to-brand-600/15 border border-brand-500/25 px-5 py-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-gray-400 text-xs font-semibold uppercase tracking-wide">Points totaux</p>
                <p className="text-3xl sm:text-4xl font-black text-white tabular-nums tracking-tight">
                  {profile.points.toLocaleString('fr-FR')}
                </p>
                <p className="text-gray-500 text-xs mt-1">100 pts = 1€ · solde gains</p>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                <Trophy className="w-8 h-8 text-brand-400" />
              </div>
            </div>

            {/* Stats — raccourcis optionnels par ligne (voir cases ci‑dessous) */}
            <div className="flex gap-6 mb-2 flex-wrap">
              {statsShortcuts.participations ? (
                <button
                  type="button"
                  onClick={goStatsParticipations}
                  className="text-left rounded-[2px] -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <span className="text-2xl font-black text-white">{stats.beefs_participated}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Participations</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400 text-sm ml-1">Participations</span>
                </div>
              )}
              {statsShortcuts.mediations ? (
                <button
                  type="button"
                  onClick={goStatsMediations}
                  className="text-left rounded-[2px] -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <span className="text-2xl font-black text-white">{stats.beefs_hosted}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Médiations</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400 text-sm ml-1">Médiations</span>
                </div>
              )}
              {statsShortcuts.followers ? (
                <button
                  type="button"
                  onClick={goStatsFollowers}
                  className="text-left rounded-[2px] -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <span className="text-2xl font-black text-white">{stats.followers}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Abonnés</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.followers}</span>
                  <span className="text-gray-400 text-sm ml-1">Abonnés</span>
                </div>
              )}
              {statsShortcuts.following ? (
                <button
                  type="button"
                  onClick={goStatsFollowing}
                  className="text-left rounded-[2px] -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/40"
                >
                  <span className="text-2xl font-black text-white">{stats.following}</span>
                  <span className="text-brand-400 text-sm ml-1 underline-offset-2 hover:underline">Abonnements</span>
                </button>
              ) : (
                <div>
                  <span className="text-2xl font-black text-white">{stats.following}</span>
                  <span className="text-gray-400 text-sm ml-1">Abonnements</span>
                </div>
              )}
            </div>
            <div className="mb-4 max-w-lg">
              <StatShortcutToggles
                value={statsShortcuts}
                onChange={(key, next) => persistStatsShortcut(key, next)}
              />
            </div>

            {/* Beefs récents (participant ou médiateur) */}
            {recentBeefs.length > 0 && (
              <div className="mt-2 pt-6 border-t border-gray-800">
                <h2 className="text-white font-bold text-lg mb-3 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-brand-400" />
                  Beefs récents
                </h2>
                <div className="space-y-3">
                  {recentBeefs.map((beef, idx) => (
                    <BeefCard
                      key={beef.id}
                      id={beef.id}
                      index={idx}
                      title={beef.title}
                      host_name={beef.card_host_name || profile.display_name || profile.username || 'Utilisateur'}
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
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="card rounded-2xl p-6">
          <div className="flex gap-4 mb-6 border-b border-gray-700 pb-4">
            <button
              onClick={() => setActiveTab('stats')}
              className={`px-4 py-2 font-semibold rounded-lg transition-colors ${
                activeTab === 'stats'
                  ? 'bg-brand-500 text-white'
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
                  ? 'bg-brand-500 text-white'
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
              <h3 className="text-white font-bold text-lg mb-2">📊 Résultats des médiations</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-4 max-w-3xl">
                Chaque beef médié est classé selon son statut en base :{' '}
                <strong className="text-gray-400">En cours</strong> (live, programmé, préparation),{' '}
                <strong className="text-gray-400">Résolu</strong> quand la session se termine avec une clôture « succès »
                (fin explicite par le médiateur, temps max, etc.),{' '}
                <strong className="text-gray-400">Non résolu</strong> si personne n’a pu débattre jusqu’au bout,{' '}
                <strong className="text-gray-400">Abandonné</strong> si la room s’arrête sans médiation aboutie (déconnexion, bug, fin sans statut).
                Les anciens tests marqués « résolus » par défaut peuvent encore apparaître ainsi jusqu’à correction des données.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {/* Resolved */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'resolved' ? null : 'resolved')}
                  className={`bg-gradient-to-br from-green-500/10 to-green-600/5 border rounded-[2px] p-4 text-left transition-all hover:scale-105 ${
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
                  className={`bg-gradient-to-br from-blue-500/10 to-blue-600/5 border rounded-[2px] p-4 text-left transition-all hover:scale-105 ${
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
                  className={`bg-gradient-to-br from-brand-500/10 to-brand-600/5 border rounded-[2px] p-4 text-left transition-all hover:scale-105 ${
                    selectedResolutionFilter === 'unresolved' 
                      ? 'border-brand-500 ring-2 ring-brand-500/50' 
                      : 'border-brand-500/30'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-10 h-10 bg-brand-500/20 rounded-full flex items-center justify-center">
                      <X className="w-5 h-5 text-brand-400" />
                    </div>
                    <div>
                      <p className="text-2xl font-black text-white">{stats.beefs_unresolved}</p>
                      <p className="text-brand-400 text-xs font-semibold">Non résolus</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">Médiation sans accord</p>
                  {selectedResolutionFilter === 'unresolved' && (
                    <p className="text-brand-400 text-xs mt-2 font-semibold">✓ Filtre actif</p>
                  )}
                </button>

                {/* Abandoned */}
                <button
                  onClick={() => setSelectedResolutionFilter(selectedResolutionFilter === 'abandoned' ? null : 'abandoned')}
                  className={`bg-gradient-to-br from-gray-500/10 to-gray-600/5 border rounded-[2px] p-4 text-left transition-all hover:scale-105 ${
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
                    {mediationBeefs
                      .filter((beef) => mediationCategoryForBeef(beef) === selectedResolutionFilter)
                      .map((beef, idx) => (
                        <BeefCard
                          key={beef.id}
                          id={beef.id}
                          index={idx}
                          title={beef.title}
                          host_name={beef.card_host_name || profile?.display_name || profile?.username || 'Utilisateur'}
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
                    {mediationBeefs.filter((beef) => mediationCategoryForBeef(beef) === selectedResolutionFilter)
                      .length === 0 && (
                      <div className="text-center py-12 bg-white/5 rounded-[2px]">
                        <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <p className="text-gray-400">Aucun beef dans cette catégorie</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* Success Rate */}
              <div className="bg-white/5 rounded-[2px] p-6 mb-6">
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
                <div className="bg-white/5 rounded-[2px] p-6">
                  <Trophy className="w-8 h-8 text-yellow-500 mb-3" />
                  <h3 className="text-xl font-bold text-white mb-2">Beefs Hébergés</h3>
                  <p className="text-3xl font-black text-white">{stats.beefs_hosted}</p>
                  <p className="text-gray-400 text-sm mt-1">Total de médiations effectuées</p>
                </div>
                <div className="bg-white/5 rounded-[2px] p-6">
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
                    <div key={beef.id} className="space-y-2">
                      <BeefCard
                        id={beef.id}
                        index={idx}
                        title={beef.title}
                        host_name={beef.card_host_name || profile?.display_name || profile?.username || 'Utilisateur'}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        is_premium={beef.is_premium}
                        price={beef.price}
                        onClick={() => router.push(`/arena/${beef.id}`)}
                      />
                      {user && beef.mediator_id === user.id && (
                        <MediationBeefEditorPanel
                          beefId={beef.id}
                          resolutionStatus={beef.resolution_status}
                          mediationSummary={beef.mediation_summary ?? ''}
                          onSaved={(patch) => applyMediationBeefPatch(beef.id, patch)}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-4">Aucun beef pour le moment</p>
                  <Link
                    href={hrefWithFrom('/create', pathname)}
                    className="inline-block px-6 py-3 brand-gradient hover:opacity-90 text-black font-bold rounded-[2px] transition-all"
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
                <div className="mt-4 p-3 bg-green-500/10 rounded-[2px]">
                  <p className="text-green-400 text-xs font-semibold">✅ Vous recevez exactement le montant demandé — aucuns frais déduits</p>
                </div>
              </div>

              {/* Solde insuffisant */}
              {(profile?.points || 0) < 2000 && (
                <div className="bg-brand-500/10 border border-brand-500/30 rounded-[2px] p-4 mb-6 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-brand-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-brand-300 font-semibold text-sm">Minimum non atteint</p>
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
                  <div className="bg-white/5 rounded-[2px] p-5 mb-4">
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
                  <div className="bg-white/5 rounded-[2px] p-5 mb-2">
                    <label className="text-gray-300 text-sm font-semibold block mb-3">
                      Méthode de retrait
                      {!withdrawalMethod && <span className="text-brand-400 ml-2 text-xs">← Sélectionnez une méthode</span>}
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
                          className={`flex items-center justify-between px-4 py-3 rounded-[2px] text-left transition-all border ${
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
                    className="w-full py-4 mt-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold rounded-[2px] transition-all"
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

                  <div className="bg-white/5 rounded-[2px] p-5 mb-6 space-y-4">
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
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-[2px] shadow-2xl z-50 py-1 overflow-hidden">
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
                              <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-[2px] shadow-2xl z-50 w-56 py-1 max-h-72 overflow-y-auto">
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
                    <div className="bg-red-500/10 border border-red-500/30 rounded-[2px] p-4 mb-4 flex items-center gap-3">
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
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-[2px] transition-all"
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

                  <div className="bg-white/5 rounded-[2px] p-5 mb-6 space-y-3">
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
                    <div className="bg-red-500/10 border border-red-500/30 rounded-[2px] p-4 mb-4 flex items-center gap-3">
                      <AlertCircle className="w-5 h-5 text-red-400" />
                      <p className="text-red-300 text-sm">{withdrawalError}</p>
                    </div>
                  )}

                  <button
                    onClick={handleWithdrawalSubmit}
                    disabled={withdrawalLoading}
                    className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 disabled:opacity-50 text-white font-bold rounded-[2px] transition-all flex items-center justify-center gap-2"
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
                    className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-[2px] text-white font-semibold transition-all"
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
                      <div key={r.id} className="bg-white/5 rounded-[2px] p-4 flex items-center justify-between">
                        <div>
                          <p className="text-white font-semibold">{parseFloat(r.amount_euros).toFixed(2)}€</p>
                          <p className="text-gray-400 text-xs">{r.method.replace('_', ' ')} · {new Date(r.created_at).toLocaleDateString('fr-FR')}</p>
                          {r.admin_note && <p className="text-gray-500 text-xs italic mt-1">{r.admin_note}</p>}
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                          r.status === 'paid'       ? 'bg-green-500/20 text-green-400' :
                          r.status === 'pending'    ? 'bg-brand-500/20 text-brand-400' :
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

      {publicPreviewOpen && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
          role="presentation"
          onClick={closePublicPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-preview-title"
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl border border-white/10 bg-[#0f0f0f] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 flex-shrink-0">
              <h2 id="profile-preview-title" className="text-lg font-bold text-white">
                Aperçu
              </h2>
              <button
                type="button"
                id="profile-preview-close"
                onClick={closePublicPreview}
                className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 touch-manipulation"
                aria-label="Fermer l’aperçu"
              >
                <X className="w-6 h-6 sm:w-5 sm:h-5" aria-hidden />
              </button>
            </div>
            <div className="flex-1 min-h-0 p-4 overflow-y-auto max-h-[min(78vh,760px)]">
              <p className="text-gray-500 text-xs mb-4">
                Aperçu public : même rendu que sur <span className="text-gray-400">/profile/@{profile.username}</span> (sans outils d’édition).
              </p>
              <div className="rounded-2xl border border-white/10 overflow-hidden bg-black/50">
                <div
                  className="h-28 bg-cover bg-center"
                  style={
                    profile.banner_url
                      ? { backgroundImage: `url(${profile.banner_url})` }
                      : {
                          background: `linear-gradient(135deg, ${profile.accent_color || '#E83A14'}44, ${profile.accent_color || '#E83A14'}11)`,
                        }
                  }
                />
                <div className="px-5 pb-5 -mt-12 relative">
                  <div
                    className="relative w-24 h-24 rounded-full border-4 border-[#0f0f0f] overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-3xl font-black text-white"
                    style={{ borderColor: profile.accent_color || '#E83A14' }}
                  >
                    {profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="96px" />
                    ) : (
                      profile.username[0].toUpperCase()
                    )}
                  </div>
                  <h3 className="text-xl font-black text-white mt-3">{profile.display_name}</h3>
                  <p className="text-gray-500 text-sm">@{profile.username}</p>
                  {profile.bio ? (
                    <p className="text-gray-300 text-sm mt-3 whitespace-pre-wrap line-clamp-6">{profile.bio}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
                    {statsShortcuts.participations ? (
                      <button
                        type="button"
                        onClick={goPreviewParticipations}
                        className="text-left rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                      >
                        <span className="text-white font-black">{stats.beefs_participated}</span>
                        <span className="text-brand-400 ml-1 underline-offset-2 hover:underline">Participations</span>
                      </button>
                    ) : (
                      <span>
                        <span className="text-white font-black">{stats.beefs_participated}</span>
                        <span className="text-gray-500 ml-1">Participations</span>
                      </span>
                    )}
                    {statsShortcuts.mediations ? (
                      <button
                        type="button"
                        onClick={goPreviewMediations}
                        className="text-left rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                      >
                        <span className="text-white font-black">{stats.beefs_hosted}</span>
                        <span className="text-brand-400 ml-1 underline-offset-2 hover:underline">Médiations</span>
                      </button>
                    ) : (
                      <span>
                        <span className="text-white font-black">{stats.beefs_hosted}</span>
                        <span className="text-gray-500 ml-1">Médiations</span>
                      </span>
                    )}
                    {statsShortcuts.followers ? (
                      <button
                        type="button"
                        onClick={goPreviewFollowers}
                        className="text-left rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                      >
                        <span className="text-white font-black">{stats.followers}</span>
                        <span className="text-brand-400 ml-1 underline-offset-2 hover:underline">Abonnés</span>
                      </button>
                    ) : (
                      <span>
                        <span className="text-white font-black">{stats.followers}</span>
                        <span className="text-gray-500 ml-1">Abonnés</span>
                      </span>
                    )}
                    {statsShortcuts.following ? (
                      <button
                        type="button"
                        onClick={goPreviewFollowing}
                        className="text-left rounded-lg -m-1 p-1 hover:bg-white/5 transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500/50"
                      >
                        <span className="text-white font-black">{stats.following}</span>
                        <span className="text-brand-400 ml-1 underline-offset-2 hover:underline">Abonnements</span>
                      </button>
                    ) : (
                      <span>
                        <span className="text-white font-black">{stats.following}</span>
                        <span className="text-gray-500 ml-1">Abonnements</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-center mt-4">
                <Link
                  href={`/profile/${encodeURIComponent(profile.username)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-400 text-sm font-semibold hover:underline"
                  onClick={() => setPublicPreviewOpen(false)}
                >
                  Ouvrir la page publique dans un onglet
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
