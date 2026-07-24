'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { X, Calendar } from 'lucide-react';
import type { ArenaUserProfile } from '@/hooks/useArenaProfile';

function IngotIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="goldGrad-pm" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="25%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#EAB308" />
          <stop offset="75%" stopColor="#CA8A04" />
          <stop offset="100%" stopColor="#A16207" />
        </linearGradient>
        <linearGradient id="goldInner-pm" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#854D0E" />
          <stop offset="50%" stopColor="#CA8A04" />
          <stop offset="100%" stopColor="#FDE047" />
        </linearGradient>
      </defs>
      <rect x="1" y="6" width="22" height="12" rx="3" fill="url(#goldGrad-pm)" stroke="#713F12" strokeWidth="1" />
      <rect x="5" y="9" width="14" height="6" rx="1.5" fill="url(#goldInner-pm)" stroke="#854D0E" strokeWidth="0.5" />
      <circle cx="9" cy="12" r="1" fill="#FEF08A" />
      <circle cx="12" cy="12" r="1" fill="#FEF08A" />
      <circle cx="15" cy="12" r="1" fill="#FEF08A" />
    </svg>
  );
}

interface ArenaProfileModalProps {
  profile: ArenaUserProfile;
  currentUserId: string | null;
  profileFollowsTarget: boolean;
  onClose: () => void;
  onToggleFollow: () => void;
  onOpenDM: (userId: string) => void;
  onReport: (user: { id: string; userName: string }) => void;
}

export function ArenaProfileModal({
  profile,
  currentUserId,
  profileFollowsTarget,
  onClose,
  onToggleFollow,
  onOpenDM,
  onReport,
}: ArenaProfileModalProps) {
  const isOwnProfile = currentUserId === profile.id;
  const isOtherUser = currentUserId && !isOwnProfile;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[125] flex items-center justify-center bg-slate-950/75 backdrop-blur-md p-4 shadow-2xl"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="relative max-w-md w-full overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-gray-800/50 to-gray-900/50 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-white transition-colors hover:bg-white/15"
          aria-label="Fermer"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>

        <div className="relative h-28 bg-gradient-to-r from-cyan-500/20 via-white/10 to-cyan-600/20">
          <div className="absolute inset-0 bg-white/5" />
        </div>

        <div className="relative px-6 pb-6 -mt-12">
          <div className="mb-4 flex justify-center">
            <div className="relative flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-full border-4 border-gray-900 bg-gradient-to-br from-gray-700 to-gray-800 text-3xl font-black text-white">
              {profile.avatarUrl ? (
                <Image src={profile.avatarUrl} alt="" fill className="object-cover" sizes="96px" />
              ) : (
                profile.displayName[0]?.toUpperCase() || '?'
              )}
            </div>
          </div>

          <div className="mb-3 text-center">
            <h2 className="font-sans text-2xl font-black text-white">{profile.displayName}</h2>
            <p className="text-sm text-gray-400">@{profile.username}</p>
          </div>

          {profile.bio ? (
            <p className="mb-4 text-center text-sm text-gray-300">{profile.bio}</p>
          ) : null}

          <div className="mb-4 flex flex-wrap justify-center gap-x-6 gap-y-2">
            <div className="text-center">
              <span className="text-2xl font-black text-white">{profile.stats.participations}</span>
              <span className="ml-1 text-sm text-gray-400">Participations</span>
            </div>
            <div className="text-center">
              <span className="text-2xl font-black text-white">{profile.stats.mediations}</span>
              <span className="ml-1 text-sm text-gray-400">M\u00e9diations</span>
            </div>
            <div className="text-center">
              <span className="text-2xl font-black text-white">{profile.stats.followers}</span>
              <span className="ml-1 text-sm text-gray-400">Abonn\u00e9s</span>
            </div>
            <div className="text-center">
              <span className="text-2xl font-black text-white">{profile.stats.following}</span>
              <span className="ml-1 text-sm text-gray-400">Abonnements</span>
            </div>
            {isOwnProfile && (
              <div className="flex items-center justify-center gap-2">
                <IngotIcon className="h-5 w-5 shrink-0 drop-shadow-md" />
                <span className="text-2xl font-black text-white">{profile.stats.points}</span>
                <span className="text-sm text-gray-400">Lingots</span>
              </div>
            )}
          </div>

          <div className="mb-5 flex items-center justify-center gap-2 text-sm text-gray-400">
            <Calendar className="h-4 w-4 shrink-0" />
            <span>
              Membre depuis{' '}
              {new Date(profile.joinedDate).toLocaleDateString('fr-FR', {
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              {isOtherUser && (
                <button
                  type="button"
                  onClick={onToggleFollow}
                  className={`flex-1 rounded-full py-2.5 font-bold transition-colors ${
                    profileFollowsTarget
                      ? 'border border-white/25 bg-white/10 text-white hover:bg-white/20'
                      : 'bg-white text-black font-black uppercase tracking-widest hover:bg-gray-200'
                  }`}
                >
                  {profileFollowsTarget ? 'Abonn\u00e9 \u2713' : 'Suivre'}
                </button>
              )}
              {isOtherUser && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenDM(profile.id);
                  }}
                  className="flex-1 rounded-full border border-white/10 bg-white/5 py-2.5 font-bold text-white transition-colors hover:bg-white/10"
                >
                  Message
                </button>
              )}
            </div>
            {isOtherUser && (
              <button
                type="button"
                onClick={() => {
                  onReport({ id: profile.id, userName: profile.username });
                  onClose();
                }}
                className="w-full rounded-full border border-white/15 bg-transparent py-2 text-[13px] font-semibold text-white/55 transition-colors hover:border-ember-500/40 hover:text-ember-300/95"
              >
                Signaler ou bloquer
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
