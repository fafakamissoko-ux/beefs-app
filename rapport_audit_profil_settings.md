# Rapport d'audit — Profil & Paramètres (Identité Tier-1)

**Date :** 31 mai 2026  
**Contexte :** Préparation refonte « Premium Glass » profil public + simplification édition  
**Statut :** extraction brute — **aucun code modifié**

---

## Cartographie des routes profil

| Route | Fichier | Rôle |
|-------|---------|------|
| `/profile` | `app/profile/page.tsx` → `ProfileContent.tsx` | Profil **connecté** (propre compte) |
| `/profile/[username]` | `app/profile/[username]/page.tsx` | Profil **public** (visiteur / autre user) |
| `/settings` | `app/settings/page.tsx` | Centre de contrôle édition |

> **Note Architecte :** `profile/page.tsx` est un **wrapper auth** (36 lignes). La façade JSX (bannière, avatar, bio, stats) vit dans `ProfileContent.tsx` (1675 lignes) et `[username]/page.tsx` (1182 lignes).

---

## Synthèse — Façade profil

### `ProfileContent.tsx` (profil connecté `/profile`)

| Zone | Détail |
|------|--------|
| **Bannière** | Upload + crop (`ImageCropModal`), likes Aura (`InlineAuraGivers type="banner"`) |
| **Avatar** | `PremiumAvatarFrame`, upload crop, likes |
| **Bio / identité** | `display_name`, `username`, `bio`, rang Aura (`getAuraRank`) |
| **Stats** | beefs, followers, following, vues, wallet retraits |
| **Onglets** | beefs, médiation, avis Ref, followers |
| **Actions** | Lien `/settings`, partage, édition inline bio |

### `[username]/page.tsx` (profil public)

| Zone | Détail |
|------|--------|
| **Data** | RPC `get_public_profile_by_username`, `get_public_profile_beefs_payload` |
| **Bannière / avatar** | Lightbox `?view=avatar|banner`, likes média |
| **Stats** | `UserStats` — participations, hostés, followers |
| **Social** | `FollowButton`, `FollowListModal`, `ReportBlockModal` |
| **Contenu** | Grille `BeefCard`, avis médiateur, résumés médiation |

---

## Synthèse — Settings (`app/settings/page.tsx` — 1259 lignes)

| Section | Champs / actions |
|---------|------------------|
| **Informations profil** | `display_name`, `bio` (edit) ; `username`, `email` (read-only) → `handleSaveProfile` |
| **Mot de passe** | Flow 2 étapes + OTP Supabase `reauthenticate` |
| **Historique Lingots** | `transactions` table |
| **Affichage** | `accent_color` (update direct Supabase), fontSize, animations, contraste via `ThemeContext` |
| **Bouclier anti-spam** | `invitation_privacy` (everyone / following / nobody) |
| **Radar & alertes** | `localStorage beefs_notif_prefs` |
| **Médiation locale** | `beefs_mediation_access` localStorage |
| **Zone danger** | `POST /api/account/delete` |

> **Gap identité :** pas d'upload avatar/bannière dans `settings/page.tsx` — médias gérés dans `ProfileContent.tsx`.

---

## 1. Code intégral — `app/profile/page.tsx`

```typescript
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import ProfileContent from './ProfileContent';

export default function ProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push('/login?redirect=/profile');
    }
  }, [user, authLoading, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <ProfileContent />;
}
```

---

## 2. Code intégral — `app/profile/ProfileContent.tsx` (façade `/profile`)

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Edit, Share2, Settings, TrendingUp, Users, MessageCircle, Trophy, Crown, Flame, Upload, X, Check, ArrowLeft, Clock, Wallet, Euro, ChevronDown, AlertCircle, Eye, Star } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { PremiumBadge, PremiumAvatarFrame } from '@/components/PremiumBadge';
import { BeefCard } from '@/components/BeefCard';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { mediationCategoryForBeef } from '@/lib/mediation-resolution';
import { MediationBeefEditorPanel } from '@/components/MediationBeefEditorPanel';
import { ImageCropModal } from '@/components/ImageCropModal';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import {
  fetchMediatorViewerReviews,
  type MediatorViewerReviewDisplay,
} from '@/lib/mediator-viewer-reviews';
import { getAuraRank } from '@/lib/prestige';

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string;
  avatar_original_url?: string | null;
  banner_original_url?: string | null;
  accent_color?: string;
  points: number;
  lifetime_points?: number;
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
  card_host_username?: string | null;
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
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'stats' | 'debates' | 'gains'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedResolutionFilter, setSelectedResolutionFilter] = useState<string | null>(null);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner' | null>(null);
  const [cropOriginalFile, setCropOriginalFile] = useState<File | null>(null);

  // Withdrawal state — amounts stored in EUROS for clarity
  const [withdrawalStep, setWithdrawalStep] = useState<'summary' | 'form' | 'confirm' | 'success'>('summary');
  const [withdrawalMethod, setWithdrawalMethod] = useState<string>('');
  const [withdrawalAmountEuros, setWithdrawalAmountEuros] = useState<number>(20);
  const [withdrawalFields, setWithdrawalFields] = useState<Record<string, string>>({});
  const [withdrawalLoading, setWithdrawalLoading] = useState(false);
  const [withdrawalError, setWithdrawalError] = useState<string>('');
  const [withdrawalHistory, setWithdrawalHistory] = useState<any[]>([]);
  const [mediatorReviews, setMediatorReviews] = useState<MediatorViewerReviewDisplay[]>([]);
  // Email + phone selectors
  const [showEmailSuggestions, setShowEmailSuggestions] = useState(false);
  const [phoneCountryCode, setPhoneCountryCode] = useState('+33');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [showCountryDropdown, setShowCountryDropdown] = useState(false);
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);

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
            console.error('Error creating user');
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
            avatar_original_url: data.avatar_original_url,
            banner_original_url: data.banner_original_url,
            accent_color: data.accent_color || '#E83A14',
            points: data.points || 0,
            lifetime_points: data.lifetime_points || 0,
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
          const mediatorUsernameById: Record<string, string> = {};
          if (mediatorIds.length > 0) {
            const { data: mu } = await supabase
              .from('user_public_profile')
              .select('id, display_name, username')
              .in('id', mediatorIds);
            (mu || []).forEach((u: { id: string; display_name?: string; username?: string }) => {
              mediatorMap[u.id] = u.display_name || u.username || 'Médiateur';
              const un = u.username?.trim();
              if (un) mediatorUsernameById[u.id] = un;
            });
          }

          const selfUsername = data.username?.trim() || null;

          const attachHost = (b: Beef): Beef => ({
            ...b,
            card_host_name:
              b.mediator_id === data.id
                ? displayNameSelf
                : (b.mediator_id && mediatorMap[b.mediator_id]) || 'Médiateur',
            card_host_username:
              b.mediator_id === data.id
                ? selfUsername
                : b.mediator_id
                  ? mediatorUsernameById[b.mediator_id] ?? null
                  : null,
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
          setMediationBeefs(mediatedList.map((b) => attachHost({ ...b, card_host_name: displayNameSelf })));

          const viewerReviews = await fetchMediatorViewerReviews(supabase, data.id);
          setMediatorReviews(viewerReviews);
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

  const handleBannerUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    setCropOriginalFile(file);
    setCropImageSrc(url);
    setCropType('banner');
    e.target.value = '';
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !user) return;
    const file = e.target.files[0];
    const url = URL.createObjectURL(file);
    setCropOriginalFile(file);
    setCropImageSrc(url);
    setCropType('avatar');
    e.target.value = '';
  };

  const cancelCropModal = useCallback(() => {
    if (cropImageSrc?.startsWith('blob:')) URL.revokeObjectURL(cropImageSrc);
    setCropImageSrc(null);
    setCropType(null);
    setCropOriginalFile(null);
  }, [cropImageSrc]);

  const handleProcessCroppedImage = async (croppedBlob: Blob) => {
    if (!user || !cropType || !cropOriginalFile) {
      toast('Fichier source introuvable.', 'error');
      return;
    }
    const blobUrlToRevoke = cropImageSrc;
    const originalFile = cropOriginalFile;
    setUploading(true);
    try {
      const rawParts = originalFile.name.split('.');
      const rawExt = rawParts.length > 1 ? rawParts.pop()! : 'jpg';
      const safeExt = rawExt.replace(/[^a-zA-Z0-9]/g, '') || 'jpg';
      const ts = Date.now();

      const originalPath = `${user.id}/original_${user.id}_${ts}.${safeExt}`;
      const cropPath = `${user.id}/${user.id}_${ts}.jpg`;

      const { error: upOriginalError } = await supabase.storage.from('avatars').upload(originalPath, originalFile, {
        upsert: true,
        contentType: originalFile.type || 'application/octet-stream',
      });
      if (upOriginalError) throw upOriginalError;

      const { error: upCropError } = await supabase.storage.from('avatars').upload(cropPath, croppedBlob, {
        upsert: true,
        contentType: 'image/jpeg',
      });
      if (upCropError) throw upCropError;

      const { data: originalRef } = supabase.storage.from('avatars').getPublicUrl(originalPath);
      const { data: cropRef } = supabase.storage.from('avatars').getPublicUrl(cropPath);
      const originalUrl = originalRef.publicUrl;
      const cropUrl = cropRef.publicUrl;

      if (cropType === 'banner') {
        const { error: updateError } = await supabase
          .from('users')
          .update({ banner_url: cropUrl, banner_original_url: originalUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;
        setProfile((prev) =>
          prev ? { ...prev, banner_url: cropUrl, banner_original_url: originalUrl } : null,
        );
        toast('Bannière mise à jour !', 'success');
      } else {
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: cropUrl, avatar_original_url: originalUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;
        setProfile((prev) =>
          prev ? { ...prev, avatar_url: cropUrl, avatar_original_url: originalUrl } : null,
        );
        toast('Avatar mis à jour avec succès!', 'success');
      }
    } catch (error) {
      console.error('Error uploading cropped image:', error);
      toast(
        cropType === 'banner'
          ? "Erreur lors de l'upload de la bannière"
          : "Erreur lors de l'upload de l'avatar.",
        'error',
      );
    } finally {
      setUploading(false);
      if (blobUrlToRevoke?.startsWith('blob:')) URL.revokeObjectURL(blobUrlToRevoke);
      setCropImageSrc(null);
      setCropType(null);
      setCropOriginalFile(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* Cover skeleton */}
          <div className="skeleton h-40 rounded-2xl mb-6" />
          {/* Avatar + info skeleton */}
          <div className="flex items-end gap-4 -mt-16 mb-6 px-4">
            <div className="skeleton w-24 h-24 rounded-[2rem] ring-4 ring-black" />
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 font-semibold">Erreur lors du chargement du profil</p>
        </div>
      </div>
    );
  }

  const showPremiumBadge = profile.is_premium && profile.premium_settings?.showPremiumBadge;
  const showPremiumFrame = profile.is_premium && profile.premium_settings?.showPremiumFrame;

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile Header */}
        <div className="overflow-hidden rounded-[2rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl mb-8">
          {/* Cover Image & Back Button */}
          <div className="h-48 relative overflow-hidden group rounded-t-[2rem]">
            <div className="absolute top-4 left-4 z-10">
              <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
            </div>
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
                <div className={`relative w-32 h-32 rounded-[2rem] bg-gradient-to-br from-gray-700 to-gray-800 border-4 overflow-hidden flex items-center justify-center text-4xl font-black text-white ${profile.is_premium ? 'shadow-[0_0_24px_rgba(212,175,55,0.35)]' : ''}`} style={{ borderColor: profile.is_premium ? '#D4AF37' : (profile.accent_color || '#E83A14') }}>
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

                <label className="absolute bottom-0 right-0 w-10 h-10 bg-brand-500 rounded-xl flex items-center justify-center cursor-pointer hover:bg-brand-600 transition-colors">
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

              <div className="flex gap-2 justify-end">
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
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                  title="Partager"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPublicPreviewOpen(true)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-white transition-colors hover:bg-white/10"
                  title="Aperçu public"
                >
                  <Eye className="h-4 w-4" aria-hidden />
                </button>
                <Link href={hrefWithFrom('/settings', pathname)} className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 font-sans font-semibold text-white transition-colors hover:bg-brand-600">
                  <Settings className="h-4 w-4" />
                  <span className="hidden sm:inline">Modifier</span>
                </Link>
              </div>
            </div>

            {/* User Info & Bio */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-sans text-2xl font-black text-white">{profile.display_name}</h1>
              </div>
              <p className="text-gray-400 text-sm mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-gray-200 text-sm mb-4 leading-relaxed">{profile.bio}</p>
              )}

              {/* Aura (prestige) — séparé des Lingots (solde) */}
              <div
                className="mb-4 flex flex-wrap cursor-pointer items-center gap-3 transition-transform hover:opacity-80 active:scale-95"
                onClick={() => setIsAuraModalOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setIsAuraModalOpen(true)}
                aria-label="Voir mes donateurs d'Aura"
              >
                {(() => {
                  const currentAura = profile.lifetime_points ?? profile.points;
                  const rank = getAuraRank(currentAura);
                  return (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md">
                      <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
                      <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                        {rank.title}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <InlineAuraGivers
                    targetId={profile.id}
                    type="profile"
                    ownerId={profile.id}
                  />
                  <Flame className="h-4 w-4 text-brand-500" aria-hidden />
                  <span className="font-bold text-white">
                    {(profile.lifetime_points ?? profile.points).toLocaleString('fr-FR')}
                  </span>{' '}
                  Aura
                </div>
              </div>

              {/* Métriques Standard (X/Instagram style) */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <button type="button" onClick={goStatsParticipations} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400">Affaires</span>
                </button>
                <button type="button" onClick={goStatsMediations} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400">Médiations</span>
                </button>
                {(stats.beefs_participated > 0 || stats.beefs_hosted > 0) && (
                  <div className="flex gap-1.5 cursor-help" title="Forfaits ou désistements">
                    <span className="font-bold text-white">{stats.beefs_abandoned}</span>
                    <span className="text-gray-400">Réputation</span>
                  </div>
                )}
                <button type="button" onClick={goStatsFollowers} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.followers}</span>
                  <span className="text-gray-400">Abonnés</span>
                </button>
                <button type="button" onClick={goStatsFollowing} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.following}</span>
                  <span className="text-gray-400">Abonnements</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-[2rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl p-6">
          <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 [scrollbar-width:none] backdrop-blur-md [-ms-overflow-style:none] mb-6 [&::-webkit-scrollbar]:hidden">
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'stats'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Statistiques
            </button>
            <button
              onClick={() => setActiveTab('debates')}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'debates'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Mes Affaires
            </button>
            <button
              onClick={() => { setActiveTab('gains'); setWithdrawalStep('summary'); }}
              className={`flex items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'gains'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Wallet className="w-4 h-4" />
              Mes Lingots
            </button>
          </div>

          {activeTab === 'stats' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-2">⚖️ Historique des Jugements</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-4 max-w-3xl">
                Chaque beef médié est classé selon son statut en base :{' '}
                <strong className="text-gray-400">En cours</strong> (live, programmé, préparation),{' '}
                <strong className="text-gray-400">Résolu</strong> quand la session se termine avec une clôture « succès »
                (fin explicite par le médiateur, temps max, etc.),{' '}
                <strong className="text-gray-400">Non résolu</strong> si personne n’a pu débattre jusqu’au bout,{' '}
                <strong className="text-gray-400">Abandonné</strong> si la room s’arrête sans médiation aboutie (déconnexion, bug, fin sans statut).
                Les anciens tests marqués « résolus » par défaut peuvent encore apparaître ainsi jusqu’à correction des données.
              </p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {([
                  { id: 'resolved', value: stats.beefs_resolved, label: 'Verdicts', desc: 'Conflits tranchés', color: 'green', icon: Check },
                  { id: 'in_progress', value: stats.beefs_in_progress, label: 'En cours', desc: 'Beefs actifs ou programmés', color: 'blue', icon: Clock },
                  { id: 'unresolved', value: stats.beefs_unresolved, label: 'Impasses', desc: 'Médiation sans accord', color: 'brand', icon: X },
                  { id: 'abandoned', value: stats.beefs_abandoned, label: 'Désertions', desc: 'Beefs annulés/forfaits', color: 'gray', icon: Flame },
                ] as const).map((tile) => {
                  const Icon = tile.icon;
                  const active = selectedResolutionFilter === tile.id;
                  const accent = tile.color === 'brand' ? 'brand-500' : tile.color === 'gray' ? 'gray-500' : `${tile.color}-500`;
                  return (
                    <button
                      key={tile.id}
                      onClick={() => setSelectedResolutionFilter(active ? null : tile.id)}
                      className={`rounded-2xl bg-white/[0.04] backdrop-blur-xl border p-4 text-left transition-all duration-200 hover:scale-[0.98] hover:bg-white/[0.06] ${
                        active ? `border-${accent} ring-2 ring-${accent}/50` : 'border-white/[0.08]'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-2">
                        <div className={`w-10 h-10 bg-${accent}/15 rounded-xl flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`} />
                        </div>
                        <div>
                          <p className="font-mono text-2xl font-black text-white tabular-nums">{tile.value}</p>
                          <p className={`font-sans text-[10px] font-bold uppercase tracking-[0.12em] text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`}>{tile.label}</p>
                        </div>
                      </div>
                      <p className="font-sans text-[11px] text-white/35">{tile.desc}</p>
                      {active && <p className={`font-mono text-[10px] mt-2 font-bold tracking-wider text-${tile.color === 'brand' ? 'brand-400' : tile.color === 'gray' ? 'gray-400' : `${tile.color}-400`}`}>FILTRE ACTIF</p>}
                    </button>
                  );
                })}
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
                      {selectedResolutionFilter === 'resolved' && '✅ Verdicts'}
                      {selectedResolutionFilter === 'in_progress' && '⏳ Beefs En Cours'}
                      {selectedResolutionFilter === 'unresolved' && '❌ Impasses'}
                      {selectedResolutionFilter === 'abandoned' && '🚫 Désertions'}
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
                          host_username={beef.card_host_username}
                          status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                          created_at={beef.created_at}
                          viewer_count={beef.viewer_count || 0}
                          tags={beef.tags}
                          scheduled_at={beef.scheduled_at}
                          onClick={() => {
                          if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                            router.push(`/beef/${beef.id}/summary`);
                          } else {
                            router.push(`/arena/${beef.id}`);
                          }
                        }}
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
                        host_username={beef.card_host_username}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        onClick={() => {
                          if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                            router.push(`/beef/${beef.id}/summary`);
                          } else {
                            router.push(`/arena/${beef.id}`);
                          }
                        }}
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
                    <p className="text-gray-500 text-xs mt-1">
                      {profile?.points || 0} Lingots · 100 Lingots = 1€
                    </p>
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
                      Il vous faut au moins <strong>20€</strong> (2 000 Lingots) pour retirer. Il vous manque{' '}
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
                      = {withdrawalAmountEuros * 100} Lingots · Solde restant après retrait :{' '}
                      {((profile?.points || 0) / 100 - withdrawalAmountEuros).toFixed(2)}€
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
                          <div className="absolute left-0 right-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-[2px] shadow-2xl z-dropdown py-1 overflow-hidden">
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
                              <div className="absolute left-0 top-full mt-1 bg-gray-800 border border-gray-600 rounded-[2px] shadow-2xl z-dropdown w-56 py-1 max-h-72 overflow-y-auto">
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
          className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-sm"
          role="presentation"
          onClick={closePublicPreview}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="profile-preview-title"
            className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-[2rem] border border-white/[0.1] bg-white/[0.04] backdrop-blur-2xl shadow-2xl"
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
                    className={`relative w-24 h-24 rounded-[1.5rem] border-4 border-[#0f0f0f] overflow-hidden bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-3xl font-black text-white ${
                      profile.is_premium ? 'shadow-[0_0_20px_rgba(212,175,55,0.35)]' : ''
                    }`}
                    style={{ borderColor: profile.is_premium ? '#D4AF37' : profile.accent_color || '#E83A14' }}
                  >
                    {profile.avatar_url ? (
                      <Image src={profile.avatar_url} alt="" fill className="object-cover" sizes="96px" />
                    ) : (
                      profile.username[0].toUpperCase()
                    )}
                  </div>
                  {/* User Info & Bio — aperçu */}
                  <div className="mb-4 mt-3">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-sans text-2xl font-black text-white">{profile.display_name}</h3>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">@{profile.username}</p>

                    {profile.bio && (
                      <p className="text-gray-200 text-sm mb-4 leading-relaxed whitespace-pre-wrap line-clamp-6">{profile.bio}</p>
                    )}

                    {/* Aura (aperçu public) */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                      {(() => {
                        const currentAura = profile.lifetime_points ?? profile.points;
                        const rank = getAuraRank(currentAura);
                        return (
                          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md">
                            <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
                            <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                              {rank.title}
                            </span>
                          </div>
                        );
                      })()}
                      <div className="flex items-center gap-1.5 text-sm text-gray-400">
                        <InlineAuraGivers
                          targetId={profile.id}
                          type="profile"
                          ownerId={profile.id}
                        />
                        <Flame className="h-4 w-4 text-brand-500" aria-hidden />
                        <span className="font-bold text-white">
                          {(profile.lifetime_points ?? profile.points).toLocaleString('fr-FR')}
                        </span>{' '}
                        Aura
                      </div>
                      {stats.beefs_resolved >= 3 && (
                        <div className="flex items-center gap-1.5 text-sm text-gray-400" title="Indice de Sagesse">
                          <span className="font-bold text-prestige-gold">
                            ✦ {(stats.beefs_resolved / Math.max(stats.beefs_hosted, 1) * 100).toFixed(0)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Métriques Standard (X/Instagram style) */}
                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <button type="button" onClick={goPreviewParticipations} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.beefs_participated}</span>
                        <span className="text-gray-400">Affaires</span>
                      </button>
                      <button type="button" onClick={goPreviewMediations} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.beefs_hosted}</span>
                        <span className="text-gray-400">Médiations</span>
                      </button>
                      <div className="flex gap-1.5 cursor-help" title="Forfaits ou désistements">
                        <span className="font-bold text-white">{stats.beefs_abandoned}</span>
                        <span className="text-gray-400">Réputation</span>
                      </div>
                      <button type="button" onClick={goPreviewFollowers} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.followers}</span>
                        <span className="text-gray-400">Abonnés</span>
                      </button>
                      <button type="button" onClick={goPreviewFollowing} className="flex gap-1.5 hover:underline">
                        <span className="font-bold text-white">{stats.following}</span>
                        <span className="text-gray-400">Abonnements</span>
                      </button>
                    </div>
                  </div>
                  {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
                    <div className="mt-5 pt-4 border-t border-white/[0.08]">
                      <h4 className="font-sans text-xs font-bold text-white mb-2 flex items-center gap-2">
                        <Star className="w-3.5 h-3.5 text-prestige-gold" aria-hidden />
                        Vox Populi (Évaluations)
                      </h4>
                      {mediatorReviews.length === 0 ? (
                        <p className="font-sans text-xs text-white/25 italic">
                          Aucun avis pour le moment — déposés après un direct sur la page résumé.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {mediatorReviews.slice(0, 3).map((review) => (
                            <li
                              key={review.id}
                              className="rounded-xl bg-white/[0.04] border border-white/[0.06] px-3 py-2 backdrop-blur-xl"
                            >
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <ProfileUserLink
                                  username={review.authorUsername}
                                  className="font-sans text-[10px] font-bold text-white/60"
                                >
                                  {review.authorName}
                                </ProfileUserLink>
                                <span className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                                  {Array.from({ length: review.rating }).map((_, i) => (
                                    <Star key={i} className="w-2 h-2 fill-prestige-gold text-prestige-gold" />
                                  ))}
                                </span>
                              </div>
                              {review.comment ? (
                                <p className="font-sans text-xs text-white/40 font-light italic leading-relaxed">
                                  &ldquo;{review.comment}&rdquo;
                                </p>
                              ) : (
                                <p className="font-sans text-[10px] text-white/20">Note sans commentaire</p>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
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

      {cropImageSrc && (
        <ImageCropModal
          imageSrc={cropImageSrc}
          cropShape={cropType === 'banner' ? 'rect' : 'round'}
          aspect={cropType === 'banner' ? 3 : 1}
          onCropComplete={(blob) => void handleProcessCroppedImage(blob)}
          onCancel={cancelCropModal}
        />
      )}

      <AuraGiversModal
        isOpen={isAuraModalOpen}
        onClose={() => setIsAuraModalOpen(false)}
        targetId={profile.id}
        type="profile"
        ownerId={profile.id}
      />
    </div>
  );
}
```

---

## 3. Code intégral — `app/profile/[username]/page.tsx` (profil public)

```typescript
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { useParams, useRouter, usePathname } from 'next/navigation';
import { Share2, Flame, Calendar, MoreVertical, Star, TrendingUp, X, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { BeefCard } from '@/components/BeefCard';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { FollowListModal } from '@/components/FollowListModal';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import { ReportBlockModal } from '@/components/ReportBlockModal';
import { FollowButton } from '@/components/FollowButton';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { MediationSummaryPublic } from '@/components/MediationSummaryPublic';
import { resolutionStatusLabel } from '@/lib/mediation-outcome-labels';
import {
  fetchMediatorViewerReviews,
  type MediatorViewerReviewDisplay,
} from '@/lib/mediator-viewer-reviews';
import { escapeForIlikeExact } from '@/lib/ilike-exact';
import { getAuraRank } from '@/lib/prestige';

/** Prestige Affiché « Aura » Radar (lifetime_points ; compat si colonne legacy absente). */
function prestigeAuraDisplay(profile: Pick<UserProfile, 'lifetime_points' | 'points'>): number {
  return profile.lifetime_points ?? profile.points;
}

interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  bio?: string;
  avatar_url?: string;
  banner_url?: string | null;
  /** Upload brut avant recadrage (lightbox HD si présent). */
  avatar_original_url?: string | null;
  banner_original_url?: string | null;
  /** Compteurs agrégés (trigger `profile_media_likes`). */
  avatar_likes?: number;
  banner_likes?: number;
  points: number;
  lifetime_points?: number;
  is_premium: boolean;
  created_at: string;
}

interface UserStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
}

interface Beef {
  id: string;
  title: string;
  description?: string;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | string;
  resolution_status?: string | null;
  mediation_summary?: string | null;
  tags?: string[];
  scheduled_at?: string;
  created_at: string;
  is_premium: boolean;
  price?: number;
  viewer_count?: number;
  host_name: string;
  host_username?: string | null;
}

/** Lignes renvoyées par get_public_profile_beefs_payload (hors champs médiateur extra). */
function beefFromPublicRpcRow(
  b: Record<string, unknown>,
  host_name: string,
  host_username: string | null,
): Beef {
  return {
    id: String(b.id),
    title: String(b.title ?? ''),
    description: typeof b.description === 'string' ? b.description : undefined,
    status: (typeof b.status === 'string' ? b.status : 'ended') as Beef['status'],
    resolution_status: (b.resolution_status as string | null) ?? null,
    mediation_summary: (b.mediation_summary as string | null) ?? null,
    tags: Array.isArray(b.tags) ? (b.tags as string[]) : undefined,
    scheduled_at: typeof b.scheduled_at === 'string' ? b.scheduled_at : undefined,
    created_at: String(b.created_at ?? ''),
    is_premium: Boolean(b.is_premium),
    price: Number(b.price ?? 0),
    viewer_count: Number(b.viewer_count ?? 0),
    host_name,
    host_username,
  };
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  const username = params.username as string;

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [stats, setStats] = useState<UserStats>({
    beefs_participated: 0,
    beefs_hosted: 0,
    followers: 0,
    following: 0,
  });
  const [beefs, setBeefs] = useState<Beef[]>([]);
  const [participantBeefs, setParticipantBeefs] = useState<Beef[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showReportModal, setShowReportModal] = useState(false);
  const [showFollowModal, setShowFollowModal] = useState<null | 'followers' | 'following'>(null);
  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  const [mediatorReviews, setMediatorReviews] = useState<MediatorViewerReviewDisplay[]>([]);
  const [activeTab, setActiveTab] = useState<'debates' | 'participations' | 'reviews'>('debates');
  const [viewingImage, setViewingImage] = useState<{ url: string; type: 'avatar' | 'banner' } | null>(null);
  const [mediaAuraLoading, setMediaAuraLoading] = useState(false);
  const [mediaLikes, setMediaLikes] = useState({
    avatar: { count: 0, liked: false },
    banner: { count: 0, liked: false },
  });
  const [dopamineBursts, setDopamineBursts] = useState<
    { id: number; text: string; minus?: boolean; anchor: 'follow' | 'aura'; solar?: boolean }[]
  >([]);
  const burstSeq = useRef(0);
  const isLikingMedia = useRef(false);

  const queueBurst = useCallback(
    (text: string, anchor: 'follow' | 'aura', minus = false, solar = false) => {
      const id = ++burstSeq.current;
      setDopamineBursts((prev) => [...prev, { id, text, minus, anchor, solar }]);
      setTimeout(() => {
        setDopamineBursts((prev) => prev.filter((b) => b.id !== id));
      }, 520);
    },
    [],
  );

  // Check if it's the current user's profile
  const isOwnProfile = user && profile && user.id === profile.id;

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (viewingImage) document.body.style.overflow = 'hidden';
    else document.body.style.overflow = 'unset';
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [viewingImage]);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const usernameKey = decodeURIComponent(String(username || '')).trim();
      if (!usernameKey) {
        setLoading(false);
        return;
      }

      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();

      let profileData: Record<string, unknown> | null = null;

      if (authUser) {
        const { data: pubRow, error: pubErr } = await supabase
          .from('user_public_profile')
          .select('*')
          .ilike('username', escapeForIlikeExact(usernameKey))
          .maybeSingle();
        if (pubErr || !pubRow) {
          setLoading(false);
          return;
        }
        if (authUser.id === pubRow.id) {
          const { data: full, error: fullErr } = await supabase
            .from('users')
            .select('*')
            .eq('id', authUser.id)
            .single();
          if (fullErr || !full) {
            setLoading(false);
            return;
          }
          profileData = full as Record<string, unknown>;
        } else {
          profileData = pubRow as Record<string, unknown>;
        }
      } else {
        const { data: pubRows, error: rpcError } = await supabase.rpc('get_public_profile_by_username', {
          p_username: usernameKey,
        });
        if (rpcError) {
          setLoading(false);
          return;
        }
        const pub = Array.isArray(pubRows) ? pubRows[0] : pubRows;
        if (!pub || typeof pub !== 'object') {
          setLoading(false);
          return;
        }
        const p = pub as {
          id: string;
          username: string;
          display_name: string;
          bio?: string | null;
          avatar_url?: string | null;
          banner_url?: string | null;
          avatar_original_url?: string | null;
          banner_original_url?: string | null;
          points: number;
          lifetime_points?: number | null;
          is_premium: boolean;
          created_at: string;
          avatar_likes?: number | null;
          banner_likes?: number | null;
        };
        profileData = {
          id: p.id,
          username: p.username,
          display_name: p.display_name,
          bio: p.bio,
          avatar_url: p.avatar_url,
          banner_url: p.banner_url,
          avatar_original_url: p.avatar_original_url ?? null,
          banner_original_url: p.banner_original_url ?? null,
          points: p.points,
          lifetime_points: p.lifetime_points ?? 0,
          is_premium: p.is_premium,
          created_at: p.created_at,
          avatar_likes: Number(p.avatar_likes ?? 0),
          banner_likes: Number(p.banner_likes ?? 0),
        };
      }

      if (!profileData) {
        setLoading(false);
        return;
      }

      const raw = profileData as Record<string, unknown>;
      const lpFromRow = Number(raw.lifetime_points ?? 0);
      const pd: UserProfile = {
        ...(profileData as unknown as UserProfile),
        lifetime_points: Number.isFinite(lpFromRow) ? lpFromRow : 0,
        avatar_likes: Number(raw.avatar_likes ?? 0),
        banner_likes: Number(raw.banner_likes ?? 0),
        avatar_original_url: typeof raw.avatar_original_url === 'string' ? raw.avatar_original_url : null,
        banner_original_url: typeof raw.banner_original_url === 'string' ? raw.banner_original_url : null,
      };

      setProfile(pd);

      let followersCount = 0;
      let followingCount = 0;
      if (authUser) {
        const { data: followersData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('following_id', pd.id);
        const { data: followingData } = await supabase
          .from('followers')
          .select('id', { count: 'exact' })
          .eq('follower_id', pd.id);
        followersCount = followersData?.length || 0;
        followingCount = followingData?.length || 0;
      } else {
        const { data: fcRows, error: fcErr } = await supabase.rpc('get_public_follow_counts', {
          p_user_id: pd.id,
        });
        if (!fcErr && fcRows?.length) {
          const fc = fcRows[0] as { followers_count?: number | string; following_count?: number | string };
          followersCount = Number(fc.followers_count ?? 0);
          followingCount = Number(fc.following_count ?? 0);
        }
      }

      if (!authUser) {
        const { data: bundleJson, error: bundleErr } = await supabase.rpc('get_public_profile_beefs_payload', {
          p_profile_user_id: pd.id,
        });
        if (bundleErr) {
          console.error('[profile] get_public_profile_beefs_payload', bundleErr);
        }
        const bundle = (bundleJson as Record<string, unknown> | null) ?? {};
        const hosted = Array.isArray(bundle.hosted) ? bundle.hosted : [];
        const participated = Array.isArray(bundle.participated) ? bundle.participated : [];
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;

        setStats({
          beefs_participated: Number(bundle.participated_count ?? 0),
          beefs_hosted: Number(bundle.hosted_count ?? 0),
          followers: followersCount,
          following: followingCount,
        });

        setBeefs(
          hosted.map((row) => beefFromPublicRpcRow(row as Record<string, unknown>, hn, hu)),
        );

        setParticipantBeefs(
          participated.slice(0, 12).map((row) => {
            const r = row as Record<string, unknown>;
            const mid = r.mediator_id as string | undefined;
            const medUn =
              typeof r.mediator_username === 'string' ? r.mediator_username.trim() : '';
            const medDn =
              typeof r.mediator_display_name === 'string' ? r.mediator_display_name.trim() : '';
            const isSelf = !mid || mid === pd.id;
            return beefFromPublicRpcRow(
              r,
              isSelf ? hn : medDn || medUn || 'Médiateur',
              isSelf ? hu : medUn || null,
            );
          }),
        );

        const viewerReviewsGuest = await fetchMediatorViewerReviews(supabase, pd.id);
        setMediatorReviews(viewerReviewsGuest);
        setMediaLikes({
          avatar: { count: pd.avatar_likes ?? 0, liked: false },
          banner: { count: pd.banner_likes ?? 0, liked: false },
        });
        return;
      }

      const { data: beefsData } = await supabase
        .from('beefs')
        .select('id', { count: 'exact' })
        .eq('mediator_id', pd.id);

      const { data: partRows } = await supabase
        .from('beef_participants')
        .select('beef_id')
        .eq('user_id', pd.id);

      const beefsParticipated = new Set((partRows || []).map((r: { beef_id: string }) => r.beef_id)).size;

      setStats({
        beefs_participated: beefsParticipated,
        beefs_hosted: beefsData?.length || 0,
        followers: followersCount,
        following: followingCount,
      });

      // Load user's beefs
      const { data: userBeefs, error: beefsError } = await supabase
        .from('beefs')
        .select('*')
        .eq('mediator_id', pd.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (userBeefs) {
        const hn = pd.display_name || pd.username;
        const hu = pd.username.trim() || null;
        setBeefs(userBeefs.map(beef => ({
          ...beef,
          host_name: hn,
          host_username: hu,
        })));
      }

      const { data: partWithBeefs } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs(*)')
        .eq('user_id', pd.id);

      const pbRaw: Beef[] = [];
      const seenPb = new Set<string>();
      for (const row of partWithBeefs || []) {
        const raw = row.beefs as Beef | Beef[] | null | undefined;
        const b = Array.isArray(raw) ? raw[0] : raw;
        if (!b?.id || seenPb.has(b.id)) continue;
        seenPb.add(b.id);
        pbRaw.push(b as Beef);
      }
      pbRaw.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      const medIds = [
        ...new Set(
          pbRaw
            .map((b) => (b as { mediator_id?: string }).mediator_id)
            .filter((id): id is string => !!id && id !== pd.id),
        ),
      ];
      let medNameById: Record<string, string> = {};
      let medUsernameById: Record<string, string> = {};
      if (medIds.length > 0) {
        const { data: mus } = await supabase
          .from('user_public_profile')
          .select('id, display_name, username')
          .in('id', medIds);
        for (const u of mus || []) {
          const row = u as { id: string; display_name?: string; username?: string };
          medNameById[row.id] = row.display_name || row.username || 'Médiateur';
          const un = row.username?.trim();
          if (un) medUsernameById[row.id] = un;
        }
      }
      const selfName = pd.display_name || pd.username;
      const selfUsername = pd.username.trim() || null;
      setParticipantBeefs(
        pbRaw.slice(0, 12).map((b) => {
          const mid = (b as { mediator_id?: string }).mediator_id;
          const host_name =
            !mid || mid === pd.id ? selfName : medNameById[mid] || 'Médiateur';
          const host_username =
            !mid || mid === pd.id ? selfUsername : medUsernameById[mid] ?? null;
          return { ...b, host_name, host_username };
        }),
      );

      // Check if current user follows this profile
      if (user && user.id !== pd.id) {
        const { data: followData } = await supabase
          .from('followers')
          .select('id')
          .eq('follower_id', user.id)
          .eq('following_id', pd.id)
          .maybeSingle();

        setIsFollowing(!!followData);
      }

      const viewerReviews = await fetchMediatorViewerReviews(supabase, pd.id);
      setMediatorReviews(viewerReviews);

      let likedAvatar = false;
      let likedBanner = false;
      if (authUser && authUser.id !== pd.id) {
        const { data: myMediaLikes } = await supabase
          .from('profile_media_likes')
          .select('media_type')
          .eq('media_owner_id', pd.id)
          .eq('user_id', authUser.id);
        for (const row of myMediaLikes || []) {
          const mt = (row as { media_type?: string }).media_type;
          if (mt === 'avatar') likedAvatar = true;
          if (mt === 'banner') likedBanner = true;
        }
      }
      setMediaLikes({
        avatar: { count: pd.avatar_likes ?? 0, liked: likedAvatar },
        banner: { count: pd.banner_likes ?? 0, liked: likedBanner },
      });
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  }, [username, user]);

  const handleMediaAuraClick = useCallback(async () => {
    if (!profile || !viewingImage) return;
    if (!user) {
      toast('Connectez-vous pour liker ce média.', 'info');
      router.push('/login');
      return;
    }
    if (user.id === profile.id) {
      toast('Tu ne peux pas liker ton propre média.', 'info');
      return;
    }

    if (isLikingMedia.current) return;
    isLikingMedia.current = true;

    const type = viewingImage.type;
    const wasLiked = mediaLikes[type].liked;

    setMediaLikes((prev) => {
      const cur = prev[type];
      const nextLiked = !cur.liked;
      return {
        ...prev,
        [type]: {
          liked: nextLiked,
          count: Math.max(0, cur.count + (nextLiked ? 1 : -1)),
        },
      };
    });

    queueBurst(wasLiked ? '-1 ✨' : '+1 ✨', 'aura', wasLiked, true);

    setMediaAuraLoading(true);
    try {
      if (wasLiked) {
        const { error } = await supabase.from('profile_media_likes').delete().match({
          media_owner_id: profile.id,
          user_id: user.id,
          media_type: type,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('profile_media_likes').insert({
          media_owner_id: profile.id,
          user_id: user.id,
          media_type: type,
        });
        if (error) throw error;
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: profile.id } }));
      }
    } catch {
      toast('Impossible de mettre à jour ce like.', 'error');
      setMediaLikes((prev) => ({
        ...prev,
        [type]: {
          liked: wasLiked,
          count: Math.max(0, prev[type].count + (wasLiked ? 1 : -1)),
        },
      }));
    } finally {
      setMediaAuraLoading(false);
      setTimeout(() => {
        isLikingMedia.current = false;
      }, 1000);
    }
  }, [profile, viewingImage, user, mediaLikes, toast, router, queueBurst]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!profile || typeof window === 'undefined') return;

    const searchParams = new URLSearchParams(window.location.search);
    const viewType = searchParams.get('view');

    if (viewType === 'avatar' && profile.avatar_url) {
      setViewingImage({
        url: profile.avatar_original_url || profile.avatar_url,
        type: 'avatar',
      });
    } else if (viewType === 'banner' && profile.banner_url) {
      setViewingImage({
        url: profile.banner_original_url || profile.banner_url,
        type: 'banner',
      });
    }
  }, [profile]);

  /** Ancres #beefs / #followers / #following / #participations / #reviews / #vox-populi */
  useEffect(() => {
    if (!profile) return;

    const syncFromHash = () => {
      if (typeof window === 'undefined') return;
      const raw = window.location.hash.slice(1);

      if (raw === 'followers') {
        setShowFollowModal('followers');
      } else if (raw === 'following') {
        setShowFollowModal('following');
      } else if (raw === 'beefs' || raw === 'mediations' || raw === 'debates') {
        setActiveTab('debates');
        setTimeout(() => {
          document.getElementById('profile-section-beefs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } else if (raw === 'participations') {
        setActiveTab('participations');
        setTimeout(() => {
          document.getElementById('profile-section-participations')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 150);
      } else if (raw === 'reviews' || raw === 'vox-populi') {
        if (stats.beefs_hosted > 0 || mediatorReviews.length > 0) {
          setActiveTab('reviews');
          setTimeout(() => {
            document.getElementById('profile-section-reviews')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 150);
        }
      }
    };

    syncFromHash();
    window.addEventListener('hashchange', syncFromHash);
    return () => window.removeEventListener('hashchange', syncFromHash);
  }, [profile, stats.beefs_hosted, mediatorReviews.length]);

  const handleShare = () => {
    const url = `${window.location.origin}/profile/${username}`;
    if (navigator.share) {
      navigator.share({
        title: `Profil de ${profile?.display_name || username}`,
        text: `Découvre le profil de ${profile?.display_name || username} sur Beefs!`,
        url: url,
      });
    } else {
      navigator.clipboard.writeText(url);
      toast('Lien copié dans le presse-papiers!', 'success');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-red-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white font-semibold">Chargement...</p>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
            <Flame className="w-10 h-10 text-gray-600" />
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Utilisateur introuvable</h2>
          <p className="text-gray-500 mb-6">@{username} n'existe pas ou a été supprimé.</p>
          <div className="flex gap-3 justify-center flex-wrap">
            <AppBackButton className="px-5 py-2.5 bg-white/5 hover:bg-white/10 rounded-[2px] [&_span]:text-white [&_span]:hover:text-white" fallback="/feed" />
            <Link
              href="/feed"
              className="px-5 py-2.5 brand-gradient text-white font-semibold rounded-[2px]"
            >
              Accueil
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile Header */}
        <div className="bg-gradient-to-br from-gray-800/50 to-gray-900/50 rounded-3xl border border-gray-700 overflow-hidden mb-6">
          {/* Cover Image & Back Button */}
          <div className="h-48 bg-gradient-to-r from-brand-500/20 via-brand-400/20 to-brand-600/20 relative rounded-t-3xl overflow-hidden">
            <div className="absolute top-4 left-4 z-10">
              <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
            </div>
            {profile.banner_url ? (
              <button
                type="button"
                onClick={() =>
                  setViewingImage({
                    url: profile.banner_original_url || profile.banner_url!,
                    type: 'banner',
                  })
                }
                className="absolute inset-0 z-0 h-full w-full cursor-pointer border-0 p-0"
                aria-label="Voir la bannière en grand"
              >
                <Image src={profile.banner_url} alt="Bannière" fill className="object-cover" sizes="100vw" priority />
              </button>
            ) : (
              <div className="pointer-events-none absolute inset-0 z-0 bg-white/5" />
            )}
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            {/* Avatar */}
            <div className="flex items-end justify-between mb-4">
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 border-gray-900 bg-gradient-to-br from-gray-700 to-gray-800 text-4xl font-black text-white">
                {profile.avatar_url ? (
                  <button
                    type="button"
                    onClick={() =>
                      setViewingImage({
                        url: profile.avatar_original_url || profile.avatar_url!,
                        type: 'avatar',
                      })
                    }
                    className="relative block h-full w-full cursor-pointer border-0 p-0"
                    aria-label="Voir la photo de profil en grand"
                  >
                    <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" sizes="128px" priority />
                  </button>
                ) : (
                  profile.username[0].toUpperCase()
                )}
              </div>

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={handleShare}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition-colors hover:bg-white/10"
                  title="Partager"
                >
                  <Share2 className="h-4 w-4" />
                </button>

                {!isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-white transition-colors hover:bg-white/10"
                    aria-label="Signaler ou bloquer"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </button>
                )}

                {!isOwnProfile && profile && (
                  <div className="relative inline-flex items-center justify-center">
                    <AnimatePresence>
                      {dopamineBursts
                        .filter((b) => b.anchor === 'follow')
                        .map((b) => (
                          <motion.span
                            key={b.id}
                            initial={{ opacity: 1, y: 0 }}
                            animate={{ opacity: 0, y: -20 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.5 }}
                            className={`pointer-events-none absolute left-1/2 top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap font-black text-xl ${
                              b.minus ? 'text-gray-400' : 'text-brand-300'
                            }`}
                          >
                            {b.text}
                          </motion.span>
                        ))}
                    </AnimatePresence>
                    <FollowButton
                      followingId={profile.id}
                      initialFollowing={isFollowing}
                      currentFollowersCount={stats.followers}
                      currentLifetimePoints={profile.lifetime_points ?? profile.points}
                      loginRedirectPath={pathname}
                      classNameWhenFollowing="relative flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-white/10 text-white hover:bg-white/20"
                      classNameWhenNotFollowing="relative flex items-center gap-2 rounded-full px-5 py-2 font-semibold transition-all bg-[#00F0FF] text-black shadow-[0_0_18px_rgba(0,240,255,0.45)] hover:brightness-110"
                      onSynced={(p) => {
                        setIsFollowing(p.following);
                        const nextFollowers = p.recipientFollowersCount;
                        if (nextFollowers != null) {
                          setStats((prev) => ({ ...prev, followers: nextFollowers }));
                        }
                        const nextLp = p.recipientLifetimePoints;
                        if (nextLp != null) {
                          setProfile((prev) =>
                            prev ? { ...prev, lifetime_points: nextLp } : null,
                          );
                        }
                        queueBurst(
                          p.following ? '+10 ✨' : '-10 ✨',
                          'follow',
                          !p.following,
                        );
                      }}
                      onError={(msg) => {
                        toast(msg || 'Erreur lors de l\'action', 'error');
                      }}
                    />
                  </div>
                )}

                {isOwnProfile && (
                  <Link
                    href={hrefWithFrom('/profile', pathname)}
                    className="rounded-full bg-brand-500 px-5 py-2 font-semibold text-white transition-colors hover:bg-brand-600"
                  >
                    Modifier
                  </Link>
                )}
              </div>
            </div>

            {/* User Info & Bio */}
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-1">
                <h1 className="font-sans text-2xl font-black text-white">{profile.display_name}</h1>
              </div>
              <p className="text-gray-400 text-sm mb-2">@{profile.username}</p>

              {profile.bio && (
                <p className="text-gray-200 text-sm mb-4 leading-relaxed">{profile.bio}</p>
              )}

              {/* Aura — prestige (lifetime) vs Lingots ≠ affichés ici */}
              <div
                className="flex flex-wrap items-center gap-3 mb-4 cursor-pointer transition-transform active:scale-95 hover:opacity-80"
                onClick={() => setIsAuraModalOpen(true)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setIsAuraModalOpen(true)}
                aria-label="Voir les donateurs d'Aura"
              >
                {(() => {
                  const currentAura = profile.lifetime_points ?? profile.points;
                  const rank = getAuraRank(currentAura);
                  return (
                    <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md">
                      <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
                      <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                        {rank.title}
                      </span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <InlineAuraGivers
                    targetId={profile.id}
                    type="profile"
                    ownerId={profile.id}
                  />
                  <Flame className="h-4 w-4 text-brand-500" aria-hidden />
                  <span className="font-bold text-white">
                    {prestigeAuraDisplay(profile).toLocaleString('fr-FR')}
                  </span>{' '}
                  Aura
                </div>
              </div>

              {/* Métriques Standard (X/Instagram style) */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400">Affaires</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400">Médiations</span>
                </div>
                <button type="button" onClick={() => setShowFollowModal('followers')} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.followers}</span>
                  <span className="text-gray-400">Abonnés</span>
                </button>
                <button type="button" onClick={() => setShowFollowModal('following')} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.following}</span>
                  <span className="text-gray-400">Abonnements</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-gray-500 text-xs mt-4">
                <Calendar className="w-3.5 h-3.5" />
                <span>Rejoint en {new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Publics */}
        <div className="rounded-[2rem] bg-gradient-to-br from-gray-800/50 to-gray-900/50 border border-gray-700 p-6 mt-6 mb-6">
          <div className="flex max-w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-full bg-white/[0.05] p-1 [scrollbar-width:none] backdrop-blur-md [-ms-overflow-style:none] mb-6 [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setActiveTab('debates')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'debates'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <Flame className="w-4 h-4" />
              Médiations
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('participations')}
              className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                activeTab === 'participations'
                  ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                  : 'text-gray-500 hover:text-gray-200'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Affaires
            </button>
            {(stats.beefs_hosted > 0 || mediatorReviews.length > 0) && (
              <button
                type="button"
                onClick={() => setActiveTab('reviews')}
                className={`flex shrink-0 items-center gap-2 rounded-full px-5 py-2 font-sans text-xs font-bold transition-all duration-200 ${
                  activeTab === 'reviews'
                    ? 'text-white bg-white/10 ring-1 ring-white/[0.12]'
                    : 'text-gray-500 hover:text-gray-200'
                }`}
              >
                <Star className="w-4 h-4" />
                Vox Populi
              </button>
            )}
          </div>

          {/* Contenu des Onglets */}
          {activeTab === 'debates' && (
            <div id="profile-section-beefs" className="scroll-mt-24">
              {beefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {beefs.map((beef, idx) => (
                    <div key={beef.id} className="space-y-2">
                      <BeefCard
                        id={beef.id}
                        index={idx}
                        title={beef.title}
                        host_name={beef.host_name}
                        host_username={beef.host_username}
                        status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                        created_at={beef.created_at}
                        viewer_count={beef.viewer_count || 0}
                        tags={beef.tags}
                        scheduled_at={beef.scheduled_at}
                        onClick={() => {
                        if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                          router.push(`/beef/${beef.id}/summary`);
                        } else {
                          router.push(`/arena/${beef.id}`);
                        }
                      }}
                      />
                      {(beef.resolution_status && beef.resolution_status !== 'in_progress') || beef.mediation_summary?.trim() ? (
                        <div className="pl-1 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                          {beef.resolution_status && beef.resolution_status !== 'in_progress' && (
                            <p className="text-[11px] text-gray-500">
                              Issue de la médiation :{' '}
                              <span className="text-gray-400 font-medium">
                                {resolutionStatusLabel(beef.resolution_status)}
                              </span>
                            </p>
                          )}
                          <MediationSummaryPublic text={beef.mediation_summary ?? ''} />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune médiation pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'participations' && (
            <div id="profile-section-participations" className="scroll-mt-24">
              {participantBeefs.length > 0 ? (
                <div className="grid grid-cols-1 gap-4">
                  {participantBeefs.map((beef, idx) => (
                    <BeefCard
                      key={beef.id}
                      id={beef.id}
                      index={idx}
                      title={beef.title}
                      host_name={beef.host_name}
                      host_username={beef.host_username}
                      status={beef.status as 'live' | 'ended' | 'replay' | 'scheduled'}
                      created_at={beef.created_at}
                      viewer_count={beef.viewer_count || 0}
                      tags={beef.tags}
                      scheduled_at={beef.scheduled_at}
                      onClick={() => {
                        if (['ended', 'replay', 'completed', 'cancelled'].includes(beef.status)) {
                          router.push(`/beef/${beef.id}/summary`);
                        } else {
                          router.push(`/arena/${beef.id}`);
                        }
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <TrendingUp className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">Aucune affaire pour le moment</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'reviews' && (
            <div id="profile-section-reviews" className="scroll-mt-24">
              <h2 className="mb-3 flex items-center gap-2 font-black text-xl text-white">
                <Star className="h-5 w-5 text-prestige-gold" aria-hidden strokeWidth={1.5} />
                Vox Populi · Évaluations
              </h2>
              <p className="text-xs text-gray-500 mb-4 leading-relaxed">
                Les spectateurs déposent un avis depuis la page résumé d&apos;un direct terminé (une fois par beef).
              </p>
              {mediatorReviews.length === 0 ? (
                <p className="text-sm text-gray-500 italic">Aucun avis pour le moment.</p>
              ) : (
                <ul className="space-y-3">
                  {mediatorReviews.map((review) => (
                    <li
                      key={review.id}
                      className="rounded-xl bg-white/[0.04] border border-white/10 px-4 py-3 backdrop-blur-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                        <ProfileUserLink
                          username={review.authorUsername}
                          className="text-sm font-semibold text-white/80"
                        >
                          {review.authorName}
                        </ProfileUserLink>
                        <span className="flex gap-0.5" aria-label={`${review.rating} sur 5`}>
                          {Array.from({ length: review.rating }).map((_, i) => (
                            <Star key={i} className="w-3.5 h-3.5 fill-prestige-gold text-prestige-gold" />
                          ))}
                        </span>
                      </div>
                      {review.comment ? (
                        <p className="text-sm text-gray-400 italic leading-relaxed">&ldquo;{review.comment}&rdquo;</p>
                      ) : (
                        <p className="text-xs text-gray-600">Note sans commentaire</p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {showReportModal && profile && !isOwnProfile && (
        <ReportBlockModal
          userId={profile.id}
          userName={profile.username}
          onClose={() => setShowReportModal(false)}
        />
      )}

      {showFollowModal && (
        <FollowListModal
          userId={profile.id}
          type={showFollowModal}
          onClose={() => setShowFollowModal(null)}
        />
      )}

      {profile && (
        <AuraGiversModal
          isOpen={isAuraModalOpen}
          onClose={() => setIsAuraModalOpen(false)}
          targetId={profile.id}
          type="profile"
          ownerId={profile.id}
        />
      )}

      {profile && viewingImage && (
        <AuraGiversModal
          isOpen={isMediaModalOpen}
          onClose={() => setIsMediaModalOpen(false)}
          targetId={profile.id}
          type={viewingImage.type}
          ownerId={profile.id}
        />
      )}

      <AnimatePresence>
        {viewingImage && (
          <motion.div
            key="profile-image-lightbox"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
            onClick={() => setViewingImage(null)}
          >
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              className="absolute right-6 top-6 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
              aria-label="Fermer"
            >
              <X className="h-6 w-6" />
            </button>

            <div
              className="relative flex w-full max-w-3xl flex-col items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="relative mb-6 aspect-square w-full max-w-lg sm:aspect-video sm:max-w-3xl">
                <Image
                  src={viewingImage.url}
                  alt="Aperçu"
                  fill
                  className={
                    viewingImage.type === 'avatar'
                      ? 'scale-75 rounded-full object-contain'
                      : 'rounded-lg object-contain bg-black/80'
                  }
                  sizes="(max-width: 768px) 100vw, 896px"
                />
              </div>

              <div className="relative flex flex-col items-center">
                <AnimatePresence>
                  {dopamineBursts
                    .filter((b) => b.anchor === 'aura')
                    .map((b) => (
                      <motion.span
                        key={b.id}
                        initial={{ opacity: 1, y: 0 }}
                        animate={{ opacity: 0, y: -20 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.5 }}
                        className={`pointer-events-none absolute left-1/2 top-12 z-[120] -translate-x-1/2 whitespace-nowrap font-black text-xl md:text-2xl ${
                          b.minus
                            ? 'text-gray-400'
                            : b.solar
                              ? 'text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                              : 'text-brand-300'
                        }`}
                      >
                        {b.text}
                      </motion.span>
                    ))}
                </AnimatePresence>

                <div className="flex items-center gap-1.5 rounded-full border-2 border-white/20 bg-slate-900/60 p-1 pr-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleMediaAuraClick();
                    }}
                    disabled={mediaAuraLoading || !!isOwnProfile || !profile}
                    aria-pressed={mediaLikes[viewingImage.type].liked}
                    aria-label={
                      viewingImage.type === 'avatar'
                        ? 'Aura sur la photo de profil'
                        : 'Aura sur la bannière'
                    }
                    title={
                      isOwnProfile ? 'Tu ne peux pas liker ton propre média' : 'Aura sur ce média'
                    }
                    className="flex items-center justify-center rounded-full p-3 transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-45"
                  >
                    <Sparkles
                      className={`h-6 w-6 ${
                        mediaLikes[viewingImage.type].liked && !isOwnProfile
                          ? 'fill-yellow-400 text-yellow-400 drop-shadow-[0_0_12px_rgba(250,204,21,0.9)]'
                          : 'text-white'
                      }`}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsMediaModalOpen(true);
                    }}
                    aria-label="Voir les donateurs"
                    className="flex items-center gap-2 rounded-full px-1 py-1 transition-colors hover:bg-white/10"
                  >
                    <InlineAuraGivers
                      targetId={profile.id}
                      type={viewingImage.type}
                      ownerId={profile.id}
                    />
                    <span className="font-mono tabular-nums text-white">
                      {(mediaLikes[viewingImage.type].count ?? 0).toLocaleString()}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

---

## 4. Code intégral — `app/settings/page.tsx`

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Lock, Mail, Save, Eye, EyeOff, Shield, Bell, X, Check, LayoutTemplate, Type, Zap, MessageSquare, UserPlus, Gift, Flame, History, AlertCircle, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { supabase } from '@/lib/supabase/client';
import { FeatureGuide } from '@/components/FeatureGuide';
import { AppBackButton } from '@/components/AppBackButton';
import { PASSWORD_POLICY_SHORT_HINT, validatePasswordPolicy } from '@/lib/password-policy';

/** Préférence locale : prépare l’affichage des outils médiateur (pas de droit serveur à ce stade). */
const MEDIATION_ACCESS_STORAGE_KEY = 'beefs_mediation_access';

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
  const [mediationAccess, setMediationAccess] = useState(false);
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

  const loadProfile = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('users')
        .select('username, display_name, bio, accent_color, invitation_privacy')
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
    try {
      setMediationAccess(localStorage.getItem(MEDIATION_ACCESS_STORAGE_KEY) === 'true');
    } catch {
      setMediationAccess(false);
    }
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
    <div className="min-h-screen">
      <div className="max-w-4xl mx-auto px-4 py-8">
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

        <div className="space-y-6">
          {/* Profile Settings */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="card rounded-2xl p-6"
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
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-gray-500 cursor-not-allowed"
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
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors"
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
                  className="w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors resize-none"
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
                    className={`w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50 ${
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
                    className={`w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50 ${
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
                    className={`w-full bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3 pr-12 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors disabled:opacity-50 ${
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
                    className={`w-full bg-white/[0.04] border border-brand-500/40 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-brand-500 transition-colors tracking-widest text-center text-lg ${
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
                  className="w-full bg-white text-black font-bold py-3 rounded-lg shadow-[0_0_15px_rgba(255,255,255,0.4)] transition-all hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* Display & Accessibility */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="card rounded-2xl p-6"
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

          {/* Bouclier Anti-Spam (Confidentialité) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="card rounded-2xl p-6"
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

          {/* Notification Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.17 }}
            className="card rounded-2xl p-6"
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

          {/* Accès Médiation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl bg-white/[0.04] backdrop-blur-xl border border-white/[0.08] p-6"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-prestige-gold/15 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5 text-prestige-gold" />
              </div>
              <div>
                <h3 className="font-sans text-lg font-bold text-white">Accès Médiation</h3>
                <p className="font-sans text-xs text-white/40">Débloque les outils de médiation sans changer ton profil public</p>
              </div>
            </div>
            <p className="font-sans text-xs text-white/45 leading-relaxed mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06] px-3 py-2.5">
              Ce réglage est <span className="text-white/70 font-semibold">sauvegardé sur cet appareil</span> (navigateur). Il indique
              que tu veux voir les parcours et outils « médiation » dans l&apos;app dès qu&apos;ils seront reliés au produit.{' '}
              <span className="text-white/55">Il ne donne pas encore de privilège côté serveur</span> : les vrais droits
              (hôte, médiateur d&apos;un beef, etc.) viennent des rôles sur chaque session.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p id="mediation-access-label" className="font-sans text-sm text-white/60">Activer l&apos;accès médiateur</p>
                <p className="font-mono text-[10px] text-white/25 tracking-wider mt-0.5">Aucun badge public · état : {mediationAccess ? 'activé localement' : 'désactivé'}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={mediationAccess}
                aria-labelledby="mediation-access-label"
                onClick={() => {
                  const next = !mediationAccess;
                  setMediationAccess(next);
                  try {
                    localStorage.setItem(MEDIATION_ACCESS_STORAGE_KEY, next ? 'true' : 'false');
                  } catch {
                    /* ignore quota / private mode */
                  }
                }}
                className={`relative shrink-0 w-12 h-7 rounded-full transition-all ${
                  mediationAccess ? 'bg-prestige-gold' : 'bg-white/10'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                    mediationAccess ? 'translate-x-5' : ''
                  }`}
                />
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
                type="button"
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
```

---

*Extraction générée pour refonte Identité Tier-1 Premium Glass — aucune modification de code.*
