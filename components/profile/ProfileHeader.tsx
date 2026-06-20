import React from 'react';
import Image from 'next/image';
import { Flame, Calendar, ShieldCheck } from 'lucide-react';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';
import { getAuraRank } from '@/lib/prestige';

export interface ProfileHeaderData {
  id: string;
  username: string;
  display_name: string;
  bio?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  accent_color?: string;
  is_premium?: boolean;
  lifetime_points: number;
  created_at?: string; // Pour la date d'inscription (profil public)
}

export interface ProfileHeaderStats {
  beefs_participated: number;
  beefs_hosted: number;
  followers: number;
  following: number;
  beefs_resolved: number;
  beefs_abandoned: number;
}

export interface ProfileHeaderProps {
  mode: 'owner' | 'public' | 'preview';
  profile: ProfileHeaderData;
  stats: ProfileHeaderStats;
  backButton?: React.ReactNode;
  actionButtons?: React.ReactNode; // Slot (Partager, Modifier, Suivre...)
  uploadOverlayBanner?: React.ReactNode; // Slot (Input file Camera)
  uploadOverlayAvatar?: React.ReactNode; // Slot (Input file Camera)
  onBannerClick?: () => void;
  onAvatarClick?: () => void;
  onAuraClick?: () => void;
  onStatsClick?: (type: 'participated' | 'hosted' | 'followers' | 'following') => void;
}

export function ProfileHeader({
  mode,
  profile,
  stats,
  backButton,
  actionButtons,
  uploadOverlayBanner,
  uploadOverlayAvatar,
  onBannerClick,
  onAvatarClick,
  onAuraClick,
  onStatsClick,
}: ProfileHeaderProps) {
  const rank = getAuraRank(profile.lifetime_points);
  const accent = profile.accent_color || '#E83A14';
  const totalWisdom = stats.beefs_resolved + stats.beefs_abandoned;
  const reliabilityRate = totalWisdom > 0 ? Math.round((stats.beefs_resolved / totalWisdom) * 100) : null;

  return (
    <div className="relative overflow-hidden rounded-[2rem] bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg mb-8">
      {/* --- BANNIÈRE --- */}
      <div className="relative h-48 w-full overflow-hidden group bg-white/5">
        <div className="absolute top-4 left-4 z-20">
          {backButton}
        </div>

        {profile.banner_url ? (
          <button
            type="button"
            onClick={onBannerClick}
            disabled={!onBannerClick}
            className={`absolute inset-0 w-full h-full p-0 border-0 ${onBannerClick ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <Image src={profile.banner_url} alt="Bannière" fill className="object-cover" sizes="100vw" priority />
          </button>
        ) : (
          <div className="w-full h-full" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }} />
        )}

        {/* Slot pour l'upload (invisible sauf au hover si défini) */}
        {uploadOverlayBanner}
      </div>

      {/* --- CONTENU INFÉRIEUR --- */}
      <div className="px-6 pb-6 -mt-16 relative z-10">

        {/* Ligne Avatar & Actions */}
        <div className="flex items-end justify-between mb-4">
          <div className="relative">
            <button
              type="button"
              onClick={onAvatarClick}
              disabled={!onAvatarClick}
              className={`relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 bg-slate-900 text-4xl font-black text-white transition-transform ${onAvatarClick ? 'cursor-pointer hover:scale-[1.02]' : 'cursor-default'} ${profile.is_premium ? 'shadow-[0_0_24px_rgba(212,175,55,0.35)] border-[#D4AF37]' : 'border-slate-900'}`}
              style={{ borderColor: profile.is_premium ? '#D4AF37' : accent }}
            >
              {profile.avatar_url ? (
                <Image src={profile.avatar_url} alt={profile.display_name} fill className="object-cover" sizes="128px" priority />
              ) : (
                profile.username[0].toUpperCase()
              )}
            </button>
            {/* Slot pour l'upload Avatar */}
            {uploadOverlayAvatar}
          </div>

          <div className="flex gap-2 justify-end items-center">
            {actionButtons}
          </div>
        </div>

        {/* Identité */}
        <div className="mb-4">
          <h1 className="font-sans text-2xl font-black text-white flex items-center gap-2">
            {profile.display_name}
          </h1>
          <p className="text-white/50 text-sm mb-2">@{profile.username}</p>
          {profile.bio && <p className="text-white/80 text-sm mb-4 leading-relaxed max-w-2xl">{profile.bio}</p>}

          {/* Aura */}
          <div
            className={`mb-4 flex flex-wrap items-center gap-3 transition-transform ${onAuraClick ? 'cursor-pointer hover:opacity-80 active:scale-95' : ''}`}
            onClick={onAuraClick}
            role={onAuraClick ? 'button' : 'generic'}
            tabIndex={onAuraClick ? 0 : -1}
          >
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-3 py-1 backdrop-blur-md shadow-inner">
              <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} aria-hidden />
              <span className={`font-sans text-[10px] font-bold uppercase tracking-widest ${rank.colorClass}`}>
                {rank.title}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-white/50">
              <InlineAuraGivers targetId={profile.id} type="profile" ownerId={profile.id} />
              <Flame className="h-4 w-4 text-brand-500" aria-hidden />
              <span className="font-bold text-white">{profile.lifetime_points.toLocaleString('fr-FR')}</span> Aura
            </div>
          </div>

          {/* Taux de Fiabilité (Sagesse) */}
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/40 px-3 py-1 backdrop-blur-sm shadow-lg" title="Taux de Fiabilité (Sagesse)">
              <ShieldCheck className={`h-4 w-4 ${reliabilityRate !== null && reliabilityRate >= 80 ? 'text-green-400' : reliabilityRate !== null && reliabilityRate >= 50 ? 'text-orange-400' : 'text-slate-400'}`} aria-hidden />
              <span className="font-sans text-xs font-bold uppercase tracking-wide text-white">
                {totalWisdom < 3 ? 'Ref en évaluation' : `Fiabilité : ${reliabilityRate}%`}
              </span>
            </div>
            {totalWisdom >= 3 && (
              <span className="text-xs text-white/40">
                ({stats.beefs_resolved} résolus)
              </span>
            )}
          </div>

          {/* Métriques Sociales */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <button type="button" onClick={() => onStatsClick?.('participated')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.beefs_participated}</span>
              <span className="text-white/50">Affaires</span>
            </button>
            <button type="button" onClick={() => onStatsClick?.('hosted')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.beefs_hosted}</span>
              <span className="text-white/50">Ref</span>
            </button>

            <button type="button" onClick={() => onStatsClick?.('followers')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.followers}</span>
              <span className="text-white/50">Abonnés</span>
            </button>
            <button type="button" onClick={() => onStatsClick?.('following')} className={`flex gap-1.5 ${onStatsClick ? 'hover:underline' : 'cursor-default'}`}>
              <span className="font-bold text-white">{stats.following}</span>
              <span className="text-white/50">Abonnements</span>
            </button>
          </div>

          {/* Date d'inscription (Optionnelle) */}
          {profile.created_at && (
            <div className="flex items-center gap-2 text-white/40 text-xs mt-4">
              <Calendar className="w-3.5 h-3.5" />
              <span>Rejoint en {new Date(profile.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
