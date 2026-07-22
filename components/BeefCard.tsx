'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';
import { BeefCardMedia } from '@/components/beef/BeefCardMedia';
import { BeefCardOverlay } from '@/components/beef/BeefCardOverlay';
import { BeefTeaserModal } from '@/components/beef/BeefTeaserModal';

interface BeefCardProps {
  id: string;
  title: string;
  description?: string;
  host_name: string;
  host_username?: string | null;
  status: 'live' | 'ended' | 'replay' | 'scheduled' | 'cancelled' | 'pending' | 'ready' | 'completed';
  created_at: string;
  scheduled_at?: string;
  viewer_count?: number;
  tags?: string[];
  thumbnail?: string;
  video_url?: string | null;
  duration?: number;
  engagement_score?: number;
  has_liked_by_user?: boolean;
  teaser_score?: number;
  has_liked_teaser?: boolean;
  onTeaserAuraClick?: () => void;
  participants_count?: number;
  challenger_a_name?: string | null;
  challenger_b_name?: string | null;
  challenger_c_name?: string | null;
  challenger_d_name?: string | null;
  challenger_a_username?: string | null;
  challenger_b_username?: string | null;
  challenger_c_username?: string | null;
  challenger_d_username?: string | null;
  challenger_c_avatar?: string | null;
  challenger_d_avatar?: string | null;
  mediator_id?: string | null;
  mediator_name?: string | null;
  mediator_username?: string | null;
  onDelete?: () => void;
  onEdit?: () => void;
  onForfeit?: () => void;
  onClick: () => void;
  onTagClick?: (tag: string) => void;
  onNotifyClick?: () => void;
  onApply?: () => void;
  onAuraClick?: () => void;
  comment_count?: number;
  onCommentClick?: () => void;
  saisirTab?: boolean;
  onSaisirAffaire?: () => void;
  onValiderRef?: () => void;
  onRefuserRef?: () => void;
  onSeDesister?: () => void;
  onPrepareAudience?: () => void;
  liveAudienceAction?: { variant: 'join' | 'return'; onClick: () => void };
  userInviteStatus?: string | null;
  intent?: string | null;
  created_by?: string | null;
  index: number;
  isActiveVideo?: boolean;
}

export function BeefCard({
  id,
  title,
  description,
  host_name: _host_name,
  host_username,
  status,
  created_at: _created_at,
  scheduled_at,
  viewer_count = 0,
  tags = [],
  thumbnail,
  video_url,
  duration: _duration,
  engagement_score = 0,
  has_liked_by_user = false,
  teaser_score = 0,
  has_liked_teaser = false,
  participants_count: _participants_count,
  challenger_a_name,
  challenger_b_name,
  challenger_c_name,
  challenger_d_name,
  challenger_a_username,
  challenger_b_username,
  challenger_c_username,
  challenger_d_username,
  challenger_c_avatar: _challenger_c_avatar,
  challenger_d_avatar: _challenger_d_avatar,
  mediator_id,
  mediator_name,
  mediator_username: _mediator_username,
  onDelete,
  onEdit,
  onForfeit,
  onClick,
  onTagClick: _onTagClick,
  onNotifyClick,
  onApply,
  onAuraClick,
  comment_count = 0,
  onCommentClick,
  onTeaserAuraClick,
  saisirTab = false,
  onSaisirAffaire,
  onValiderRef,
  onRefuserRef,
  onSeDesister,
  onPrepareAudience,
  liveAudienceAction,
  userInviteStatus,
  intent,
  created_by,
  index,
  isActiveVideo = false,
}: BeefCardProps) {
  const { user } = useAuth();
  const isMuted = useArenaVolatileStore((s) => s.isMuted);
  const toggleMute = useArenaVolatileStore((s) => s.toggleMute);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaBlockRef = useRef<HTMLDivElement | null>(null);

  const [replayHover, setReplayHover] = useState(false);
  const [isTeaserOpen, setIsTeaserOpen] = useState(false);
  const [isBeefAuraModalOpen, setIsBeefAuraModalOpen] = useState(false);
  const [isTeaserAuraModalOpen, setIsTeaserAuraModalOpen] = useState(false);
  const [isViewsModalOpen, setIsViewsModalOpen] = useState(false);

  const isParticipant = user
    ? user.id === created_by ||
      user.user_metadata?.username === challenger_a_username ||
      user.user_metadata?.username === challenger_b_username ||
      user.user_metadata?.username === challenger_c_username ||
      user.user_metadata?.username === challenger_d_username ||
      user.user_metadata?.username === host_username
    : false;

  const isWaitingForMe =
    status === 'pending' &&
    Boolean(mediator_id) &&
    user?.id === mediator_id &&
    user?.id !== created_by;

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleMute();
    const nextMuted = !isMuted;
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (modalVideoRef.current) {
      modalVideoRef.current.muted = nextMuted;
      modalVideoRef.current.play().catch(() => {});
    }
  };

  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const isReplay = status === 'replay';
  const auraTier = engagement_score >= 500 ? 3 : engagement_score >= 50 ? 2 : 1;

  const baseSystem = 'relative flex h-full w-full flex-col overflow-hidden rounded-[1.2rem] transition-all duration-300 md:rounded-[1.5rem] bg-black/20';
  let statusVariant = '';
  if (status === 'live') statusVariant = 'ring-2 ring-cyan-400 border-transparent';
  else if (status === 'pending' || status === 'scheduled' || status === 'ready') statusVariant = 'ring-1 ring-white/10';
  else if (status === 'replay') statusVariant = 'ring-1 ring-cyan-500/40 border-transparent';
  else if (status === 'ended' || status === 'completed' || status === 'cancelled') statusVariant = 'opacity-60 saturate-75 hover:opacity-100 hover:saturate-100';

  const auraFX = auraTier === 3 ? 'shadow-[0_0_20px_rgba(223,255,0,0.15)]' : auraTier === 2 ? 'shadow-[0_0_15px_rgba(0,240,255,0.1)]' : '';
  const manifestoStroke = isManifesto ? 'border-dashed border-white/20' : '';
  const beefCardChromeClass = [baseSystem, statusVariant, auraFX, manifestoStroke].filter(Boolean).join(' ');

  const getPendingRefText = () => {
    if (intent !== 'manifesto') {
      if (user?.id === mediator_id) return 'En attente des combattants…';
      if (userInviteStatus === 'pending') return null;
      if (userInviteStatus === 'accepted') return 'En attente de ton adversaire…';
      return 'En attente des participants…';
    }
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})…` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validation…' : "En attente d'un Ref…";
  };
  const pendingRefText = getPendingRefText();

  return (
    <div className={beefCardChromeClass}>
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: index * 0.04, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
        onClick={() => setIsTeaserOpen(true)}
        onMouseEnter={() => isReplay && setReplayHover(true)}
        onMouseLeave={() => isReplay && setReplayHover(false)}
        className="group relative h-full w-full shrink-0 cursor-pointer overflow-hidden bg-transparent md:aspect-[3/4] md:h-auto md:max-h-[70dvh] md:rounded-[1.5rem]"
      >
        <BeefCardMedia
          thumbnail={thumbnail}
          videoUrl={video_url}
          isActiveVideo={isActiveVideo}
          isMuted={isMuted}
          title={title}
          status={status}
          scheduledAt={scheduled_at}
          auraTier={auraTier}
          onNotifyClick={onNotifyClick}
          onEdit={onEdit}
          onDelete={onDelete}
          onForfeit={onForfeit}
          onToggleMute={handleToggleMute}
          videoRef={videoRef}
          mediaBlockRef={mediaBlockRef}
        />

        <BeefCardOverlay
          id={id}
          title={title}
          intent={intent}
          challengerAName={challenger_a_name}
          challengerBName={challenger_b_name}
          challengerCName={challenger_c_name}
          challengerDName={challenger_d_name}
          mediatorName={mediator_name}
          mediatorId={mediator_id}
          createdBy={created_by}
          viewerCount={viewer_count}
          commentCount={comment_count}
          engagementScore={engagement_score}
          hasLikedByUser={has_liked_by_user}
          onAuraClick={onAuraClick}
          onCommentClick={onCommentClick}
          onViewsModalOpen={() => setIsViewsModalOpen(true)}
          onBeefAuraModalOpen={() => setIsBeefAuraModalOpen(true)}
        />

        {isReplay && (
          <AnimatePresence>
            {replayHover && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-[40] flex items-center justify-center bg-black/60 backdrop-blur-sm"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white/10">
                  <Play className="ml-1 h-5 w-5 fill-white text-white" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}

        {isTeaserOpen && typeof document !== 'undefined' && createPortal(
          <BeefTeaserModal
            id={id}
            title={title}
            description={description}
            thumbnail={thumbnail}
            videoUrl={video_url}
            tags={tags}
            status={status}
            isMuted={isMuted}
            onToggleMute={handleToggleMute}
            modalVideoRef={modalVideoRef}
            teaserScore={teaser_score}
            hasLikedTeaser={has_liked_teaser}
            onTeaserAuraClick={onTeaserAuraClick}
            onCommentClick={onCommentClick}
            onClose={() => setIsTeaserOpen(false)}
            onClick={onClick}
            createdBy={created_by}
            isManifesto={isManifesto}
            onApply={onApply}
            onSaisirAffaire={onSaisirAffaire}
            mediatorName={mediator_name}
            onValiderRef={onValiderRef}
            onRefuserRef={onRefuserRef}
            onSeDesister={onSeDesister}
            onPrepareAudience={onPrepareAudience}
            liveAudienceAction={liveAudienceAction}
            userInviteStatus={userInviteStatus}
            isParticipant={isParticipant}
            pendingRefText={pendingRefText}
            onTeaserAuraModalOpen={() => setIsTeaserAuraModalOpen(true)}
          />
        , document.body)}
      </motion.div>

      <AuraGiversModal
        isOpen={isBeefAuraModalOpen}
        onClose={() => setIsBeefAuraModalOpen(false)}
        targetId={id}
        type="beef"
        ownerId={mediator_id || created_by || ''}
      />
      <AuraGiversModal
        isOpen={isTeaserAuraModalOpen}
        onClose={() => setIsTeaserAuraModalOpen(false)}
        targetId={id}
        type="teaser"
        ownerId={created_by || ''}
      />
      <AuraGiversModal
        isOpen={isViewsModalOpen}
        onClose={() => setIsViewsModalOpen(false)}
        targetId={id}
        type="views"
        ownerId={mediator_id || created_by || ''}
      />
    </div>
  );
}
