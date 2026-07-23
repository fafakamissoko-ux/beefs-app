'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Share2, Settings, TrendingUp, Users, Trophy, Flame, X, Eye } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { AppBackButton } from '@/components/AppBackButton';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useToast } from '@/components/Toast';
import { MediationBeefEditorPanel } from '@/components/MediationBeefEditorPanel';
import { ImageCropModal } from '@/components/ImageCropModal';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { RankDescriptionModal } from '@/components/RankDescriptionModal';
import { ProfileHeader } from '@/components/profile/ProfileHeader';
import { ProfileTabs } from '@/components/profile/ProfileTabs';
import { ProfileBeefGrid } from '@/components/profile/ProfileBeefGrid';
import { useWalletStore } from '@/lib/stores/walletStore';
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

type OwnerProfileQueryData = {
  profile: UserProfile;
  stats: UserStats;
  beefs: Beef[];
  mediationBeefs: Beef[];
};

const EMPTY_OWNER_STATS: UserStats = {
  beefs_participated: 0,
  beefs_hosted: 0,
  beefs_resolved: 0,
  beefs_abandoned: 0,
  total_views: 0,
  followers: 0,
  following: 0,
};

export default function ProfileContent() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const walletBalance = useWalletStore((s) => s.balance);

  const [activeTab, setActiveTab] = useState<'stats' | 'debates'>('stats');
  const [showEditModal, setShowEditModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [publicPreviewOpen, setPublicPreviewOpen] = useState(false);
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [cropType, setCropType] = useState<'avatar' | 'banner' | null>(null);
  const [cropOriginalFile, setCropOriginalFile] = useState<File | null>(null);

  const [isAuraModalOpen, setIsAuraModalOpen] = useState(false);
  const [isRankModalOpen, setIsRankModalOpen] = useState(false);

  const { data, isLoading: loading, isError } = useQuery({
    queryKey: ['owner-profile', user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<OwnerProfileQueryData> => {
      if (!user?.id) {
        throw new Error('Utilisateur non connecté');
      }

      let { data: row } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();

      if (!row) {
        const { data: newUser, error: insertError } = await supabase
          .from('users')
          .insert({
            id: user.id,
            email: user.email || '',
            username: user.user_metadata?.username || user.email?.split('@')[0] || 'user',
            display_name:
              user.user_metadata?.display_name ||
              user.user_metadata?.username ||
              user.email?.split('@')[0] ||
              'User',
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

        row = newUser;
      }

      if (!row) {
        throw new Error('Profil introuvable');
      }

      const finalProfile: UserProfile = {
        id: row.id,
        username: row.username,
        display_name: row.display_name || row.username,
        bio: row.bio,
        avatar_url: row.avatar_url,
        banner_url: row.banner_url,
        avatar_original_url: row.avatar_original_url,
        banner_original_url: row.banner_original_url,
        accent_color: row.accent_color || '#E83A14',
        points: row.points || 0,
        lifetime_points: row.lifetime_points || 0,
        is_premium: row.is_premium || false,
        premium_settings: row.premium_settings || {
          showPremiumBadge: true,
          showPremiumFrame: true,
          showPremiumAnimations: true,
        },
        created_at: row.created_at,
      };

      const { data: followersData } = await supabase
        .from('followers')
        .select('id', { count: 'exact' })
        .eq('following_id', row.id);

      const { data: followingData } = await supabase
        .from('followers')
        .select('id', { count: 'exact' })
        .eq('follower_id', row.id);

      const { data: mediatedRows } = await supabase
        .from('beefs')
        .select('*')
        .eq('mediator_id', row.id)
        .order('created_at', { ascending: false });

      const { data: participantRows } = await supabase
        .from('beef_participants')
        .select('beef_id, beefs(*)')
        .eq('user_id', row.id);

      const mediatedList = (mediatedRows || []) as Beef[];
      const fromParticipants: Beef[] = [];
      for (const partRow of participantRows || []) {
        const raw = partRow.beefs as Beef | Beef[] | null | undefined;
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
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      );

      const displayNameSelf = row.display_name || row.username || 'Utilisateur';
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

      const selfUsername = row.username?.trim() || null;

      const attachHost = (b: Beef): Beef => ({
        ...b,
        card_host_name:
          b.mediator_id === row.id
            ? displayNameSelf
            : (b.mediator_id && mediatorMap[b.mediator_id]) || 'Médiateur',
        card_host_username:
          b.mediator_id === row.id
            ? selfUsername
            : b.mediator_id
              ? mediatorUsernameById[b.mediator_id] ?? null
              : null,
      });

      const beefsParticipatedCount = new Set(
        (participantRows || []).map((r: { beef_id: string }) => r.beef_id),
      ).size;
      const beefsHostedCount = mediatedList.length;

      const finalStats: UserStats = {
        beefs_participated: beefsParticipatedCount,
        beefs_hosted: beefsHostedCount,
        beefs_resolved: row.beefs_resolved ?? 0,
        beefs_abandoned: row.beefs_abandoned ?? 0,
        total_views: 0,
        followers: followersData?.length || 0,
        following: followingData?.length || 0,
      };

      const finalBeefs = mergedSorted.map(attachHost);
      const finalMediationBeefs = mediatedList.map((b) =>
        attachHost({ ...b, card_host_name: displayNameSelf }),
      );

      return {
        profile: finalProfile,
        stats: finalStats,
        beefs: finalBeefs,
        mediationBeefs: finalMediationBeefs,
      };
    },
  });

  const profile = data?.profile ?? null;
  const stats = data?.stats ?? EMPTY_OWNER_STATS;
  const beefs = data?.beefs ?? [];
  const mediationBeefs = data?.mediationBeefs ?? [];

  useEffect(() => {
    if (isError) {
      toast('Erreur lors du chargement du profil. Vérifie la console.', 'error');
    }
  }, [isError, toast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tab = new URLSearchParams(window.location.search).get('tab');
    if (tab === 'debates' || tab === 'stats') {
      setActiveTab(tab);
    }
  }, []);

  const closePublicPreview = useCallback(() => setPublicPreviewOpen(false), []);

  const applyMediationBeefPatch = useCallback(
    (beefId: string, patch: { resolution_status?: string; mediation_summary?: string | null }) => {
      if (!user?.id) return;
      queryClient.setQueryData<OwnerProfileQueryData>(['owner-profile', user.id], (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          beefs: oldData.beefs.map((b) => (b.id === beefId ? { ...b, ...patch } : b)),
          mediationBeefs: oldData.mediationBeefs.map((b) => (b.id === beefId ? { ...b, ...patch } : b)),
        };
      });
    },
    [queryClient, user?.id],
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
        toast('Bannière mise à jour !', 'success');
        queryClient.invalidateQueries({ queryKey: ['owner-profile', user.id] });
      } else {
        const { error: updateError } = await supabase
          .from('users')
          .update({ avatar_url: cropUrl, avatar_original_url: originalUrl })
          .eq('id', user.id);
        if (updateError) throw updateError;
        toast('Avatar mis à jour avec succès!', 'success');
        queryClient.invalidateQueries({ queryKey: ['owner-profile', user.id] });
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
              {[...Array(2)].map((_, i) => (
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

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 py-8">

        {/* Profile Header Unifié */}
        <ProfileHeader
          mode="owner"
          profile={{
            id: profile.id,
            username: profile.username,
            display_name: profile.display_name,
            bio: profile.bio,
            avatar_url: profile.avatar_url,
            banner_url: profile.banner_url,
            accent_color: profile.accent_color,
            is_premium: profile.is_premium,
            lifetime_points: profile.lifetime_points ?? profile.points,
          }}
          stats={{
            beefs_participated: stats.beefs_participated,
            beefs_hosted: stats.beefs_hosted,
            followers: stats.followers,
            following: stats.following,
            beefs_resolved: stats.beefs_resolved,
            beefs_abandoned: stats.beefs_abandoned,
          }}
          backButton={
            <AppBackButton className="backdrop-blur-md bg-black/40 hover:bg-black/60 border border-white/10 rounded-full text-white [&_span]:hidden p-2" fallback="/feed" />
          }
          uploadOverlayBanner={
            <label className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/40 transition-all cursor-pointer opacity-0 hover:opacity-100 z-10">
              <div className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm rounded-[2px] text-white text-sm font-medium">
                <Camera className="w-4 h-4" />
                <span>Changer la bannière</span>
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleBannerUpload} />
            </label>
          }
          uploadOverlayAvatar={
            <label className="absolute bottom-0 right-0 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-brand-500 text-white shadow-lg transition-colors hover:bg-brand-600">
              <Camera className="h-5 w-5" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={uploading} />
            </label>
          }
          actionButtons={
            <>
              <button
                type="button"
                onClick={async () => {
                  const shareData = {
                    title: `${profile.display_name} sur Beefs`,
                    text: `Regarde le profil de ${profile.display_name} sur Beefs !`,
                    url: `${window.location.origin}/profile/${profile.username}`,
                  };
                  if (navigator.share) {
                    try {
                      await navigator.share(shareData);
                    } catch (_) {}
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
              <Link
                href={hrefWithFrom('/settings', pathname)}
                className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2 font-sans font-semibold text-white transition-colors hover:bg-brand-600"
              >
                <Settings className="h-4 w-4" />
                <span className="hidden sm:inline">Modifier</span>
              </Link>
            </>
          }
          walletBalance={walletBalance}
          onRankClick={() => setIsRankModalOpen(true)}
          onAuraClick={() => setIsAuraModalOpen(true)}
          onLingotsClick={() => router.push('/buy-points')}
          onStatsClick={(type) => {
            if (type === 'participated') goStatsParticipations();
            if (type === 'hosted') goStatsMediations();
            if (type === 'followers') goStatsFollowers();
            if (type === 'following') goStatsFollowing();
          }}
        />

        {/* Tabs */}
        <div className="rounded-[2rem] bg-white/[0.04] border border-white/[0.08] backdrop-blur-2xl p-6">
          {/* Navigation Unifiée */}
          <ProfileTabs
            className="mb-6"
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as 'stats' | 'debates')}
            tabs={[
              { id: 'stats', label: 'Statistiques', icon: TrendingUp },
              { id: 'debates', label: 'Mes Affaires', icon: Flame },
            ]}
          />

          {activeTab === 'stats' && (
            <div>
              <h3 className="text-white font-bold text-lg mb-4">📈 Statistiques</h3>
              <p className="text-gray-500 text-xs leading-relaxed mb-6 max-w-3xl">
                Le Taux de Fiabilité (Sagesse) est affiché sur ton en-tête de profil public et provient des compteurs
                synchronisés en base (<strong className="text-gray-400">beefs résolus</strong> /{' '}
                <strong className="text-gray-400">abandons</strong>).
              </p>
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
            <div className="mt-4">
              <ProfileBeefGrid
                beefs={beefs.map((b) => ({
                  ...b,
                  host_name: b.card_host_name || profile?.display_name || profile?.username || 'Utilisateur',
                  host_username: b.card_host_username,
                }))}
                emptyMessage="Aucun beef pour le moment"
                emptyAction={
                  <Link
                    href={hrefWithFrom('/create', pathname)}
                    className="inline-block px-6 py-3 brand-gradient hover:opacity-90 text-black font-bold rounded-[2px] transition-all mt-4"
                  >
                    Créer un beef
                  </Link>
                }
                renderExtra={(beef) =>
                  user && beef.mediator_id === user.id ? (
                    <MediationBeefEditorPanel
                      beefId={beef.id}
                      resolutionStatus={beef.resolution_status}
                      mediationSummary={beef.mediation_summary ?? ''}
                      onSaved={(patch) => applyMediationBeefPatch(beef.id, patch)}
                    />
                  ) : null
                }
              />
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

              <ProfileHeader
                mode="preview"
                profile={{
                  id: profile.id,
                  username: profile.username,
                  display_name: profile.display_name,
                  bio: profile.bio,
                  avatar_url: profile.avatar_url,
                  banner_url: profile.banner_url,
                  accent_color: profile.accent_color,
                  is_premium: profile.is_premium,
                  lifetime_points: profile.lifetime_points ?? profile.points,
                }}
                stats={{
                  beefs_participated: stats.beefs_participated,
                  beefs_hosted: stats.beefs_hosted,
                  followers: stats.followers,
                  following: stats.following,
                  beefs_resolved: stats.beefs_resolved,
                  beefs_abandoned: stats.beefs_abandoned,
                }}
                onAuraClick={undefined}
                onStatsClick={(type) => {
                  if (type === 'participated') goPreviewParticipations();
                  if (type === 'hosted') goPreviewMediations();
                  if (type === 'followers') goPreviewFollowers();
                  if (type === 'following') goPreviewFollowing();
                }}
              />

              <div className="px-2">
                <p className="text-center mt-2">
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

      <RankDescriptionModal
        isOpen={isRankModalOpen}
        onClose={() => setIsRankModalOpen(false)}
        currentRank={getAuraRank(profile.lifetime_points ?? profile.points)}
        currentAura={profile.lifetime_points ?? profile.points}
      />
    </div>
  );
}
