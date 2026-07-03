# Rapport d'audit — Extraction Feed Swipe TikTok

**Date :** 2026-05-31  
**Objectif :** Préparer la destruction du défilement classique au profit d'une expérience Swipe TikTok (virtualisation plein écran).  
**Statut :** Extraction uniquement — **aucune modification de code**.

---

## 1. Inventaire des librairies (animation / scroll / gestures)

Source : `package.json`

| Librairie | Présente | Version |
|-----------|----------|---------|
| **framer-motion** | Oui | `^11.0.3` |
| **swiper** | Non | — |
| **react-use-gesture** | Non | — |
| **@use-gesture/react** | Non | — |
| **embla-carousel-react** | Non | — |
| **react-spring** | Non | — |
| **react-virtuoso** / **react-window** | Non | — |

**Observations :** scroll natif CSS (`snap-y`, `snap-mandatory`) + `IntersectionObserver` pour vidéo active. Seule lib d'animation installée : **framer-motion**.

---

## 2. IntersectionObserver (logique scroll/vidéo — hors JSX)

Fichier : `app/feed/page.tsx` (L673–715)

```typescript
  useEffect(() => {
    if (loading) return;
    const container = document.getElementById('feed-scroll-container');
    if (!container) return;

    const ratios = new Map<string, number>();

    const pickWinner = () => {
      let bestId: string | null = null;
      let bestRatio = 0;
      for (const [beefId, ratio] of ratios) {
        if (ratio > bestRatio) {
          bestRatio = ratio;
          bestId = beefId;
        }
      }
      setActiveVideoId(bestRatio > 0 ? bestId : null);
    };

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const beefId = (entry.target as HTMLElement).dataset.beefId;
          if (!beefId) continue;
          ratios.set(beefId, entry.isIntersecting ? entry.intersectionRatio : 0);
        }
        pickWinner();
      },
      {
        root: container,
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    const nodes = container.querySelectorAll('[data-beef-id]');
    nodes.forEach((node) => {
      const beefId = (node as HTMLElement).dataset.beefId;
      if (beefId) ratios.set(beefId, 0);
      obs.observe(node);
    });

    return () => obs.disconnect();
  }, [loading, beefs, mobileViewMode]);
```

---

## 3. JSX intégral du `return (...)` — `FeedPage`

Fichier : `app/feed/page.tsx` (L821–1255)

```tsx
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
      <Suspense fallback={null}>
        <OpenCreateModalFromQuery setOpen={setShowCreateModal} />
        <OpenCommentsFromQuery setOpenId={setActiveCommentsBeefId} />
      </Suspense>
        {/* BanniÃ¨re + onglets + filtres (desktop) â€” dans le flux, repousse le scroll */}
        <div className="z-[100] flex w-full shrink-0 flex-col bg-black/30 px-4 pb-3 pt-3 backdrop-blur-sm md:px-0 md:pt-0 lg:bg-transparent lg:backdrop-blur-none">
          <div className="flex w-full flex-col gap-3 border-b border-white/[0.08] pb-3">
            <div className="flex flex-col gap-4 md:flex-row md:items-center justify-between">
              <div className="flex items-center gap-4 max-md:flex-nowrap max-md:overflow-x-auto hide-scrollbar max-md:pb-1">
              {[
                { id: 'pour-vous' as const, label: 'Pour toi', icon: TrendingUp },
                { id: 'abonnements' as const, label: 'Abonnements', icon: Users },
                { id: 'manifestes' as const, label: 'Ã€ Saisir', icon: FileText },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFeedType(tab.id)}
                  className={`group flex min-h-[44px] items-center gap-2 pb-1 transition-colors ${
                    feedType === tab.id
                      ? 'border-b-2 border-white font-black uppercase tracking-widest text-[11px] text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.6)] md:text-[12px]'
                      : 'border-b-2 border-transparent pb-1 text-white/50 hover:text-white font-bold uppercase tracking-widest text-[11px] md:text-[12px]'
                  }`}
                >
                  <tab.icon
                    className={`h-4 w-4 shrink-0 ${
                      feedType === tab.id
                        ? 'text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                        : 'text-white/40 group-hover:text-white'
                    }`}
                  />
                  <span
                    className={
                      feedType === tab.id
                        ? 'drop-shadow-[0_0_12px_rgba(255,255,255,0.6)]'
                        : undefined
                    }
                  >
                    {tab.label}
                  </span>
                </button>
              ))}
              </div>
            <a
              href={hrefWithFrom('/buy-points', pathname)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-[44px] max-md:hidden shrink-0 items-center justify-center gap-2 rounded-full border border-prestige-gold/30 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-prestige-gold transition-colors hover:bg-prestige-gold/10 hover:text-yellow-400 lg:hidden"
            >
              <Coins className="w-4 h-4 flex-shrink-0" />
              <span>Lingots</span>
            </a>
            </div>
            <div className="mt-2 flex w-full items-center justify-between md:mt-0 md:w-auto">
              <div className="flex max-md:flex-nowrap max-md:overflow-x-auto max-md:pb-1 hide-scrollbar items-center gap-3">
                {STATUS_FILTERS.map(s => (
                  <button
                    key={s.id}
                    onClick={() => setSelectedStatus(s.id)}
                    className={`inline-flex min-h-[44px] items-center rounded-full border px-4 py-1.5 font-sans text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all duration-200 ${
                      selectedStatus === s.id
                        ? 'border-white/40 bg-white/10 text-white shadow-[0_0_12px_rgba(255,255,255,0.15)]'
                        : 'border-white/[0.08] bg-transparent text-gray-500 hover:border-white/15 hover:text-gray-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>

              <div className="ml-2 flex shrink-0 items-center gap-1 rounded-full border border-white/10 bg-black/40 p-1 md:hidden">
                <button
                  type="button"
                  onClick={() => setMobileViewMode('list')}
                  className={`rounded-full p-1.5 transition-colors ${mobileViewMode === 'list' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  <List className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setMobileViewMode('grid')}
                  className={`rounded-full p-1.5 transition-colors ${mobileViewMode === 'grid' ? 'bg-white/20 text-white' : 'text-gray-500 hover:text-white'}`}
                >
                  <LayoutGrid className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-col gap-2 md:px-8">
          {/* Selected tags */}
          {selectedTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedTags.map(tag => (
                <motion.div key={tag} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                  className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold text-white">
                  <span>#{tag}</span>
                  <button onClick={() => setSelectedTags(prev => prev.filter(t => t !== tag))} className="hover:bg-white/20 rounded-full p-0.5">
                    <X className="w-3 h-3" />
                  </button>
                </motion.div>
              ))}
              <button onClick={() => setSelectedTags([])} className="px-3 py-1 text-xs font-medium text-gray-500 hover:text-gray-300 transition-colors">
                Effacer
              </button>
            </div>
          )}

          {/* Trending tags */}
          <div className="flex items-center gap-2.5 overflow-x-auto hide-scrollbar pb-1">
            <span className="font-mono text-[10px] text-white/30 font-bold uppercase tracking-[0.15em] flex-shrink-0">Trending</span>
            {trendingTags.filter(t => !selectedTags.includes(t)).slice(0, 8).map(tag => (
              <button
                key={tag}
                onClick={() => handleTagClick(tag)}
                className="inline-flex min-h-[44px] flex-shrink-0 items-center rounded-full border border-white/[0.06] bg-white/[0.03] px-3 py-1 font-sans text-xs font-medium text-white/40 whitespace-nowrap transition-colors hover:text-white"
              >
                #{tag}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div
            id="feed-scroll-container"
            className={`flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-32 md:p-6 md:pt-4 ${
              mobileViewMode === 'grid'
                ? 'grid grid-cols-2 gap-3 px-3 pt-3 items-start md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5'
                : 'flex flex-col snap-y snap-mandatory gap-4 items-stretch px-0 pt-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5 md:snap-none md:items-start'
            }`}
          >
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className={`overflow-hidden rounded-[2rem] border border-white/[0.06] bg-white/[0.04] ${mobileViewMode === 'list' ? 'snap-start snap-always w-full' : 'w-full'}`}
              >
                <div className="skeleton h-48 rounded-none" />
                <div className="space-y-3 p-5">
                  <div className="skeleton h-4 w-3/4 rounded-full" />
                  <div className="skeleton h-3 w-1/2 rounded-full" />
                  <div className="flex gap-2">
                    <div className="skeleton h-5 w-16 rounded-full" />
                    <div className="skeleton h-5 w-12 rounded-full" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : beefs.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 py-16 text-center md:justify-center">
            <div className="relative mb-6 group">
              <div className="absolute inset-0 scale-150 rounded-full bg-prestige-gold/10 transition-all duration-700 group-hover:scale-[1.75] group-hover:bg-prestige-gold/20" />
              <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-white/10 bg-black/40 backdrop-blur-sm shadow-[0_0_30px_rgba(212,175,55,0.15)]">
                <Flame className="h-10 w-10 text-prestige-gold opacity-80" strokeWidth={1.5} />
              </div>
            </div>
            <h3 className="font-sans text-xl md:text-2xl font-bold text-white mb-2 tracking-tight">Le calme avant la tempÃªte</h3>
            <p className="font-sans text-sm md:text-base text-white/40 mb-8 max-w-xs leading-relaxed">Aucune affaire en cours ici. Prenez l'initiative et ouvrez les hostilitÃ©s.</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2.5 rounded-full border border-prestige-gold/30 bg-prestige-gold/10 px-8 py-3.5 text-sm font-bold text-prestige-gold shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all hover:bg-prestige-gold/20 hover:shadow-[0_0_30px_rgba(212,175,55,0.4)] active:scale-[0.97]"
            >
              <Swords className="h-5 w-5" strokeWidth={2} />
              Initier un Beef
            </button>
          </div>
        ) : (
          <>
            <div
              id="feed-scroll-container"
              className={`flex-1 min-h-0 w-full overflow-y-auto hide-scrollbar pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-32 md:p-6 md:pt-4 ${
                mobileViewMode === 'grid'
                  ? 'grid grid-cols-2 gap-3 px-3 pt-3 items-start md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5'
                  : 'flex flex-col snap-y snap-mandatory gap-4 items-stretch px-0 pt-0 md:grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 md:gap-5 md:snap-none md:items-start'
              }`}
            >
              {/* === CARTE APPÃ‚T (Visiteurs) === */}
              {!user && showHero && (
                <div
                  className={`relative flex h-auto min-h-[380px] shrink-0 flex-col items-center justify-between overflow-hidden border border-white/20 bg-gradient-to-br from-white/5 to-obsidian-950 p-6 text-center shadow-[0_0_20px_rgba(255,255,255,0.08)] max-md:rounded-2xl max-md:border md:rounded-[1.5rem] md:border ${mobileViewMode === 'list' ? 'snap-start snap-always w-full' : 'w-full'}`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowHero(false);
                      try {
                        localStorage.setItem('hideAgoraHero', 'true');
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="absolute right-3 top-3 z-20 p-2 text-white/40 hover:text-white"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                  <Flame className="mb-4 h-12 w-12 text-white drop-shadow-[0_0_15px_rgba(255,255,255,0.6)]" aria-hidden />
                  <h2 className="mb-2 font-sans text-xl font-black uppercase italic text-white md:text-2xl">Un compte Ã  rÃ©gler ?</h2>
                  <p className="mx-auto mb-8 max-w-sm text-xs text-gray-400 md:text-sm">
                    Ne laisse plus une affaire sans rÃ©ponse. Convoque ton adversaire dans l&apos;Agora.
                  </p>
                  <button
                    type="button"
                    onClick={() => router.push('/signup?next=/feed')}
                    className="w-full max-w-[220px] rounded-xl bg-white py-3.5 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-105 active:scale-95"
                  >
                    Call Out
                  </button>
                </div>
              )}
              {beefs.map((beef, index) => (
                <div
                  key={beef.id}
                  className={`relative shrink-0 flex justify-center ${mobileViewMode === 'list' ? 'snap-start snap-always w-full' : 'w-full'}`}
                >
                  <div
                    data-beef-id={beef.id}
                    className={mobileViewMode === 'list' ? 'w-full max-w-[380px]' : 'w-full'}
                  >
                    <BeefCard
                    {...beef}
                    isActiveVideo={beef.id === activeVideoId}
                    onPrepareAudience={
                      (beef.status === 'scheduled' || beef.status === 'pending' || beef.status === 'ready') &&
                      (user?.id === beef.mediator_id || (!beef.mediator_id && user?.id === beef.created_by))
                        ? () => router.push(`/arena/${beef.id}`)
                        : undefined
                    }
                    userInviteStatus={beef.user_invite_status}
                    saisirTab={feedType === 'manifestes'}
                    onSaisirAffaire={
                      beef.status === 'pending' &&
                      beef.intent === 'manifesto' &&
                      user?.id &&
                      beef.created_by &&
                      beef.created_by !== user.id &&
                      !beef.mediator_id
                        ? () => void handleClaimManifesto(beef.id)
                        : undefined
                    }
                    onValiderRef={
                      beef.status === 'pending' &&
                      beef.intent === 'manifesto' &&
                      user?.id &&
                      beef.created_by === user.id &&
                      beef.mediator_id
                        ? () => void handleApproveRef(beef.id)
                        : undefined
                    }
                    onRefuserRef={
                      beef.status === 'pending' &&
                      beef.intent === 'manifesto' &&
                      user?.id &&
                      beef.created_by === user.id &&
                      beef.mediator_id
                        ? () => void handleRejectRef(beef.id)
                        : undefined
                    }
                    onSeDesister={
                      beef.status === 'scheduled' &&
                      user?.id === beef.mediator_id &&
                      beef.intent === 'manifesto'
                        ? () => void handleWithdrawManifesto(beef.id)
                        : undefined
                    }
                    liveAudienceAction={
                      beef.status === 'live'
                        ? {
                            variant: beef.user_is_live_ring ? 'return' : 'join',
                            onClick: () => router.push(`/arena/${beef.id}`),
                          }
                        : undefined
                    }
                    onClick={() => handleBeefClick(beef)}
                    comment_count={beef.comment_count || 0}
                    onCommentClick={() => setActiveCommentsBeefId(beef.id)}
                    onAuraClick={() => handleAuraClick(beef.id)}
                    teaser_score={beef.teaser_score}
                    has_liked_teaser={beef.has_liked_teaser}
                    onTeaserAuraClick={() => handleTeaserAuraClick(beef.id)}
                    onTagClick={handleTagClick}
                    onDelete={
                      beef.status === 'pending' && user?.id === beef.created_by
                        ? () => setBeefToDelete(beef.id)
                        : undefined
                    }
                    onEdit={
                      beef.status === 'pending' && user?.id === beef.created_by
                        ? () => setEditBeefId(beef.id)
                        : undefined
                    }
                    onForfeit={
                      beef.status === 'scheduled' && user?.id === beef.created_by
                        ? () => setBeefToForfeit(beef.id)
                        : undefined
                    }
                    onNotifyClick={
                      beef.status === 'scheduled' || (beef.status === 'pending' && !!beef.scheduled_at)
                        ? () => toast('BientÃ´t : rappel quand lâ€™heure approche.', 'info')
                        : undefined
                    }
                    index={index}
                  />
                  </div>
                </div>
              ))}
            </div>
            {hasMore && (
              <div className="flex justify-center mt-12">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="rounded-full bg-white/[0.06] border border-white/[0.08] px-8 py-3 font-sans text-sm font-semibold text-white transition-all duration-200 hover:bg-white/10 hover:border-white/15 disabled:opacity-50"
                >
                  {loadingMore ? 'Chargementâ€¦' : 'Charger plus'}
                </button>
              </div>
            )}
          </>
        )}
      {activeBeef && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="fixed z-[500] bottom-6 right-4 md:bottom-8 md:right-8 flex flex-col items-end pointer-events-none"
        >
          <button
            type="button"
            onClick={() => router.push(`/arena/${activeBeef.id}`)}
            className="group pointer-events-auto flex items-center gap-3 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-2 pr-4 transition-all hover:scale-105 hover:border-cyan-400"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/20">
              <Radio className="h-5 w-5 animate-pulse text-cyan-400" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">Beef en cours</span>
              <span className="max-w-[120px] truncate text-xs font-semibold text-white md:max-w-[150px]">
                {activeBeef.title}
              </span>
            </div>
          </button>
        </motion.div>
      )}
      {/* Modal Suppression */}
      {beefToDelete && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beef-delete-title"
          onClick={() => setBeefToDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/75 backdrop-blur-md p-6 shadow-[0_0_40px_rgba(220,38,38,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="beef-delete-title" className="mb-2 text-xl font-black text-white">
              DÃ©truire l&apos;affaire ?
            </h3>
            <p className="mb-6 text-sm text-gray-400">
              Cette action est irrÃ©versible. L&apos;affaire disparaÃ®tra de l&apos;Agora.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setBeefToDelete(null)} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20">
                Annuler
              </button>
              <button type="button" onClick={() => void confirmDelete()} className="flex-1 rounded-xl bg-blood-600 py-3 text-sm font-bold text-white shadow-glow-blood transition-colors hover:bg-blood-500">
                DÃ©truire
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Forfait */}
      {beefToForfeit && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="beef-forfeit-title"
          onClick={() => setBeefToForfeit(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950/75 backdrop-blur-md p-6 shadow-[0_0_40px_rgba(212,175,55,0.15)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="beef-forfeit-title" className="mb-2 text-xl font-black text-white">
              DÃ©clarer Forfait ?
            </h3>
            <p className="mb-6 text-sm text-gray-400">
              L&apos;affaire est programmÃ©e. Fuir maintenant annulera le combat et impactera votre rÃ©putation.
            </p>
            <div className="flex gap-3">
              <button type="button" onClick={() => setBeefToForfeit(null)} className="flex-1 rounded-xl bg-white/10 py-3 text-sm font-bold text-white transition-colors hover:bg-white/20">
                Combattre
              </button>
              <button type="button" onClick={() => void confirmForfeit()} className="flex-1 rounded-xl bg-prestige-gold py-3 text-sm font-bold text-black shadow-[0_0_15px_rgba(212,175,55,0.5)] transition-colors hover:bg-prestige-gold/90">
                Fuir (Forfait)
              </button>
            </div>
          </div>
        </div>
      )}

      {editBeefId && (
        <EditBeefModal
          beefId={editBeefId}
          onClose={() => setEditBeefId(null)}
          onSaved={() => {
            setEditBeefId(null);
            void loadBeefs();
            toast('Affaire mise Ã  jour', 'success');
          }}
        />
      )}
      {showCreateModal && <CreateBeefForm onSubmit={handleCreateBeef} onCancel={() => setShowCreateModal(false)} />}

      <AnimatePresence>
        {activeCommentsBeefId && (
          <CommentsDrawer
            beefId={activeCommentsBeefId}
            onClose={() => setActiveCommentsBeefId(null)}
          />
        )}
      </AnimatePresence>

    </div>
  );
```

---

## 4. Composant intégral — `components/BeefCard.tsx`

```tsx
'use client';

import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Calendar, Sparkles, Volume2, VolumeX, Bell, Eye, MessageCircle, MoreVertical, Trash2, Edit2, Flag } from 'lucide-react';
import { Countdown } from '@/components/Countdown';
import { useToast } from '@/components/Toast';
import { useAuth } from '@/contexts/AuthContext';
import { AuraGiversModal } from '@/components/AuraGiversModal';
import { InlineAuraGivers } from '@/components/InlineAuraGivers';

/** Alias pour Ã©viter le motif `}[` dans `useState<â€¦>(â€¦)` sous SWC/TSX. */
type FloatingAuraChip = { id: number; x: number };

let globalIsMuted = true;

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
  host_name,
  host_username,
  status,
  created_at,
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
  onTagClick,
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
  const { toast } = useToast();
  const [isMuted, setIsMuted] = useState(globalIsMuted);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const modalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mediaBlockRef = useRef<HTMLDivElement | null>(null);

  const [cardFloatingAuras, setCardFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [teaserFloatingAuras, setTeaserFloatingAuras] = useState<Array<FloatingAuraChip>>([]);
  const [replayHover, setReplayHover] = useState(false);
  const [isTeaserOpen, setIsTeaserOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isReminded, setIsReminded] = useState(false);
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
    const nextMuted = !isMuted;
    globalIsMuted = nextMuted;
    setIsMuted(nextMuted);
    if (videoRef.current) videoRef.current.muted = nextMuted;
    if (modalVideoRef.current) {
      modalVideoRef.current.muted = nextMuted;
      modalVideoRef.current.play().catch(() => {});
    }
  };

  function getPrimaryStatusBadge(): React.ReactNode {
    switch (status) {
      case 'pending':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[10px] font-bold tracking-wider text-white/90 md:text-xs">
            EN ATTENTE
          </div>
        );
      case 'ended':
      case 'replay':
      case 'completed':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
            REPLAY
          </div>
        );
      case 'scheduled':
      case 'ready':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300 md:text-xs">
            <Calendar className="h-3 w-3 shrink-0" /> Ã€ VENIR
          </div>
        );
      case 'cancelled':
        return (
          <div className="flex items-center gap-1.5 rounded-full border border-gray-500/30 bg-gray-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gray-300 md:text-xs">
            ANNULÃ‰
          </div>
        );
      default:
        return null;
    }
  }

  const isManifesto = saisirTab || (intent === 'manifesto' && (status === 'pending' || status === 'ready'));
  const isReplay = status === 'ended' || status === 'replay' || status === 'completed';
  const descText = description?.trim() ?? '';
  const auraTier = engagement_score >= 500 ? 3 : engagement_score >= 50 ? 2 : 1;

  const baseSystem = 'relative flex h-full w-full flex-col overflow-hidden rounded-[1.2rem] transition-all duration-300 md:rounded-[1.5rem] bg-black/20';

  let statusVariant = '';
  if (status === 'live') statusVariant = 'ring-2 ring-cyan-400 border-transparent';
  else if (status === 'pending' || status === 'scheduled' || status === 'ready') statusVariant = 'ring-1 ring-white/10';
  else if (status === 'ended' || status === 'replay' || status === 'completed' || status === 'cancelled') statusVariant = 'opacity-60 saturate-75 hover:opacity-100 hover:saturate-100';

  const auraFX = auraTier === 3 ? 'shadow-[0_0_20px_rgba(223,255,0,0.15)]' : auraTier === 2 ? 'shadow-[0_0_15px_rgba(0,240,255,0.1)]' : '';
  const manifestoStroke = isManifesto ? 'border-dashed border-white/20' : '';

  const beefCardChromeClass = [baseSystem, statusVariant, auraFX, manifestoStroke].filter(Boolean).join(' ');

  const getPendingRefText = () => {
    // Logique pour les MÃ©diations standards
    if (intent !== 'manifesto') {
      if (user?.id === mediator_id) return 'En attente des combattantsâ€¦';
      if (userInviteStatus === 'pending') return null; // MasquÃ© pour Ã©viter le doublon avec le bouton d'action
      if (userInviteStatus === 'accepted') return 'En attente de ton adversaireâ€¦';
      return 'En attente des participantsâ€¦'; // Spectateurs
    }

    // Logique spÃ©cifique aux Manifestes
    if (user?.id === created_by) {
      return user?.id !== mediator_id ? `En attente de ta validation du Ref (@${mediator_name ?? ''})â€¦` : null;
    }
    if (isWaitingForMe) return null;
    return mediator_name ? 'Ref en cours de validationâ€¦' : "En attente d'un Refâ€¦";
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
        className="group relative aspect-[3/4] max-h-[70dvh] w-full shrink-0 cursor-pointer overflow-hidden bg-transparent"
      >
        <div
          ref={mediaBlockRef}
          className="absolute inset-0 z-0 h-full w-full overflow-hidden rounded-[1.2rem] bg-transparent md:rounded-[1.5rem]"
        >
          {isActiveVideo && video_url ? (
            <video
              ref={videoRef}
              src={video_url}
              autoPlay
              loop
              muted={isMuted}
              playsInline
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : thumbnail ? (
            <Image
              src={thumbnail}
              alt={title}
              fill
              className="object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, 384px"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-b from-obsidian-900 to-black" />
          )}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent z-[5]" aria-hidden />

          <div className="absolute left-2 top-2 z-20 flex max-w-[60%] flex-col items-start gap-1">
            {status === 'live' && (
              <div className="flex w-fit items-center gap-1.5 rounded bg-blood-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-tight text-white shadow-glow-blood animate-pulse md:text-xs">
                <div className="h-1.5 w-1.5 rounded-full bg-white" /> LIVE
              </div>
            )}
            {auraTier === 3 && (
              <div className="flex w-fit items-center gap-1 rounded border border-volt-500/40 bg-volt-500/20 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-tight text-volt-400">
                <Sparkles className="h-2 w-2" /> Trending
              </div>
            )}
            {getPrimaryStatusBadge()}
          </div>

          <div className="absolute right-2 top-2 z-[60] flex flex-col items-end gap-1.5">
            {!!scheduled_at && (status === 'scheduled' || status === 'pending') && onNotifyClick && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsReminded(!isReminded);
                  onNotifyClick?.();
                  toast(!isReminded ? 'Rappel activÃ©' : 'Rappel annulÃ©', 'success');
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-all ${isReminded ? 'border-cyan-400 bg-cyan-500 text-white' : 'bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20'}`}
              >
                <Bell className={`h-3.5 w-3.5 ${isReminded ? 'fill-white' : ''}`} />
              </button>
            )}
            {(onEdit || onDelete || onForfeit) && (
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsMenuOpen(!isMenuOpen);
                  }}
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white hover:bg-white/20"
                  aria-expanded={isMenuOpen}
                  aria-label={"Actions sur l'affaire"}
                >
                  <MoreVertical className="h-4 w-4" aria-hidden />
                </button>
                <AnimatePresence>
                  {isMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95, y: -10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95, y: -10 }}
                      className="absolute right-0 z-[70] mt-2 w-40 overflow-hidden rounded-xl bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl py-1 md:w-48"
                    >
                      {onEdit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(false);
                            onEdit();
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-medium text-gray-300 hover:bg-white/5 md:px-4 md:text-sm"
                        >
                          <Edit2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Modifier
                        </button>
                      )}
                      {onForfeit && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(false);
                            onForfeit();
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-prestige-gold hover:bg-prestige-gold/10 md:px-4 md:text-sm"
                        >
                          <Flag className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Forfait
                        </button>
                      )}
                      {onDelete && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setIsMenuOpen(false);
                            onDelete();
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-[11px] font-bold text-blood-400 hover:bg-blood-500/10 md:px-4 md:text-sm"
                        >
                          <Trash2 className="h-3 w-3 md:h-4 md:w-4" aria-hidden /> Supprimer
                        </button>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {video_url && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleToggleMute(e);
                }}
                className="rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg p-1.5 transition-colors hover:bg-white/20"
                aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
              >
                {isMuted ? <VolumeX className="h-3 w-3 text-white" /> : <Volume2 className="h-3 w-3 text-white" />}
              </button>
            )}
          </div>

          <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col items-start gap-1">
            {status === 'scheduled' && scheduled_at && (
              <div
                className="pointer-events-auto origin-bottom-left scale-90 rounded bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2 py-1 [&_.text-blue-400]:text-cyan-400 [&_svg]:text-cyan-400"
                aria-live="polite"
              >
                <Countdown scheduledAt={scheduled_at} />
              </div>
            )}
          </div>
        </div>

        {/* OVERLAY D'INFORMATIONS TIKTOK */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col justify-end p-2.5 pt-12 sm:p-4 sm:pt-20">
          <h3 className="mb-1 sm:mb-2 line-clamp-2 font-sans text-[13px] sm:text-[15px] leading-tight font-bold text-white md:text-[17px] drop-shadow-md">
            {title}
          </h3>
          <div className="mb-3 flex flex-wrap items-center gap-x-2 font-sans text-[10px] font-black uppercase tracking-widest text-white/90 sm:text-xs drop-shadow-md">
            <span className="italic">{challenger_a_name || (intent === 'manifesto' ? 'Ã€ Saisir' : 'Challenger 1')}</span>
            <span className="text-brand-400">VS</span>
            <span className="italic">{challenger_b_name || 'Challenger 2'}</span>
            {challenger_c_name && (
              <>
                <span className="text-brand-400">VS</span>
                <span className="italic">{challenger_c_name}</span>
              </>
            )}
            {challenger_d_name && (
              <>
                <span className="text-brand-400">VS</span>
                <span className="italic">{challenger_d_name}</span>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pointer-events-auto">
            {mediator_name ? (
              <span className="w-fit rounded-full border border-white/20 bg-black/40 px-1.5 py-0.5 text-[8px] font-bold tracking-wide text-gray-200 sm:px-2.5 sm:py-1 sm:text-[10px]">
                REF: <span className="text-white">@{mediator_name}</span>
              </span>
            ) : (
              <span className="w-fit rounded-full border border-prestige-gold/40 bg-prestige-gold/20 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-widest text-prestige-gold sm:px-2.5 sm:py-1 sm:text-[10px]">
                En attente de Ref
              </span>
            )}

            <div className="flex items-center gap-1.5">
              <div
                className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsViewsModalOpen(true);
                }}
              >
                <Eye className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                <span>{viewer_count.toLocaleString()}</span>
              </div>
              <div
                className="flex h-6 sm:h-7 cursor-pointer items-center gap-1.5 rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-2.5 font-mono text-[10px] font-bold text-white transition-all hover:bg-white/10 active:scale-95"
                onClick={(e) => {
                  e.stopPropagation();
                  onCommentClick?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onCommentClick?.();
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label="Voir les commentaires"
              >
                <MessageCircle className="h-3.5 w-3.5" aria-hidden strokeWidth={2.25} />
                <span>{comment_count.toLocaleString()}</span>
              </div>
              {onAuraClick ? (
                <div
                  className={`relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg font-mono text-[9px] sm:text-[10px] font-bold ${
                    has_liked_by_user ? 'border-amber-400/50 text-amber-400' : 'border-white/10 text-white'
                  }`}
                >
                  <AnimatePresence>
                    {cardFloatingAuras.map((aura) => (
                      <motion.span
                        key={aura.id}
                        initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                        animate={{ opacity: 0, y: -28, scale: 1.1 }}
                        exit={{ opacity: 0 }}
                        className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-black text-amber-400"
                      >
                        +1
                      </motion.span>
                    ))}
                  </AnimatePresence>
                  <button
                    type="button"
                    className={`flex h-full items-center justify-center pl-2.5 pr-1.5 transition-all hover:bg-white/10 active:bg-white/20 ${
                      !has_liked_by_user ? 'hover:text-amber-400' : ''
                    }`}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!has_liked_by_user) {
                        const newId = Date.now() + Math.random();
                        setCardFloatingAuras((p) => [...p, { id: newId, x: Math.random() * 30 - 15 }]);
                        setTimeout(() => {
                          setCardFloatingAuras((p) => p.filter((a) => a.id !== newId));
                        }, 800);
                      }
                      onAuraClick?.();
                      if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
                      }
                    }}
                    aria-label={has_liked_by_user ? "Retirer l'Aura" : "Envoyer de l'Aura"}
                  >
                    <Sparkles
                      className={
                        'h-3.5 w-3.5 ' +
                        (has_liked_by_user
                          ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_10px_rgba(251,191,36,0.7)]'
                          : '')
                      }
                      aria-hidden
                    />
                  </button>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <InlineAuraGivers
                      targetId={id}
                      type="beef"
                      ownerId={mediator_id || created_by || ''}
                    />
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              ) : (
                <div className="relative flex h-6 sm:h-7 items-center overflow-hidden rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg font-mono text-[9px] sm:text-[10px] font-bold text-white">
                  <div className="flex h-full items-center justify-center pl-2.5 pr-1.5">
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  </div>
                  <button
                    type="button"
                    className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 transition-all hover:bg-white/10 active:bg-white/20"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsBeefAuraModalOpen(true);
                    }}
                    aria-label="Voir les donateurs d'Aura"
                  >
                    <InlineAuraGivers
                      targetId={id}
                      type="beef"
                      ownerId={mediator_id || created_by || ''}
                    />
                    <span>{engagement_score.toLocaleString()}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

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
        <div
          className="fixed inset-0 z-[9999] flex flex-col bg-black/20 backdrop-blur-[2px] md:flex-row md:items-center md:justify-center md:p-8"
          role="presentation"
          onClick={(e) => {
            e.stopPropagation();
            setIsTeaserOpen(false);
          }}
        >
          <div
            className="relative flex h-full w-full flex-col overflow-hidden bg-slate-950/75 backdrop-blur-md border border-white/10 shadow-2xl md:h-auto md:max-h-[90vh] md:max-w-5xl md:flex-row md:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <button
              type="button"
              onClick={() => setIsTeaserOpen(false)}
              className="absolute right-4 top-4 z-[9999] flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
              aria-label={"Fermer l'aperÃ§u"}
            >
              âœ•
            </button>

            <div className="relative flex min-h-[40vh] flex-[1.5] items-center justify-center bg-black/20">
              {video_url ? (
                <video
                  ref={modalVideoRef}
                  src={video_url}
                  autoPlay
                  loop
                  playsInline
                  muted={isMuted}
                  onClick={handleToggleMute}
                  className="h-full w-full object-contain"
                />
              ) : thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element -- teaser modal pleine page
                <img src={thumbnail} alt={title} className="max-h-[50vh] w-full bg-black object-contain md:h-full md:max-h-none" />
              ) : (
                <div className="text-white/40">Aucun mÃ©dia</div>
              )}

              {/* Conteneur fusionnÃ© anti-collision */}
              {(video_url || onTeaserAuraClick) && (
                <div className="absolute bottom-4 right-4 z-[9999] flex flex-col-reverse items-center gap-3">
                  {video_url && (
                    <button
                      type="button"
                      onClick={handleToggleMute}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg text-white transition-colors hover:bg-white/20"
                      aria-label={isMuted ? 'Activer le son' : 'Couper le son'}
                    >
                      {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
                    </button>
                  )}

                  {onTeaserAuraClick && (
                    <div className="relative flex flex-col items-center gap-1.5">
                      <AnimatePresence>
                        {teaserFloatingAuras.map((aura) => (
                          <motion.span
                            key={aura.id}
                            initial={{ opacity: 1, y: 0, x: aura.x, scale: 0.5 }}
                            animate={{ opacity: 0, y: -40, scale: 1.5 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.65 }}
                            className="pointer-events-none absolute -top-8 left-1/2 z-50 -translate-x-1/2 text-sm font-black text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]"
                          >
                            +1
                          </motion.span>
                        ))}
                      </AnimatePresence>
                      <div className="flex items-center gap-1.5">
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (!has_liked_teaser) {
                              const newId = Date.now() + Math.random();
                              setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                              setTimeout(() => {
                                setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                              }, 800);
                            }
                            onTeaserAuraClick?.();
                            if (typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              if (!has_liked_teaser) {
                                const newId = Date.now() + Math.random();
                                setTeaserFloatingAuras((prev) => [...prev, { id: newId, x: Math.random() * 40 - 20 }]);
                                setTimeout(() => {
                                  setTeaserFloatingAuras((prev) => prev.filter((a) => a.id !== newId));
                                }, 800);
                              }
                              onTeaserAuraClick?.();
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('aura-refresh', { detail: { targetId: id } }));
                              }
                            }
                          }}
                          aria-label="Aura teaser"
                          className={`flex h-12 w-12 cursor-pointer items-center justify-center rounded-full bg-slate-900/40 backdrop-blur-sm border shadow-lg transition-transform active:scale-90 ${
                            has_liked_teaser
                              ? 'border-amber-400/50 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                              : 'border-white/10 hover:bg-white/20'
                          }`}
                        >
                          <Sparkles
                            className={`h-6 w-6 ${
                              has_liked_teaser
                                ? 'fill-amber-400 text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                                : 'text-white'
                            }`}
                          />
                        </div>
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onCommentClick?.();
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              onCommentClick?.();
                            }
                          }}
                          aria-label="Voir les commentaires"
                          className="flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-slate-900/40 shadow-lg backdrop-blur-sm text-white transition-all hover:bg-white/10 active:scale-95"
                        >
                          <MessageCircle className="h-6 w-6" strokeWidth={2.25} />
                        </div>
                      </div>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsTeaserAuraModalOpen(true);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            setIsTeaserAuraModalOpen(true);
                          }
                        }}
                        aria-label="Voir les donateurs d'Aura teaser"
                        className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold drop-shadow-md transition-transform active:scale-95 ${
                          has_liked_teaser
                            ? 'text-amber-400 drop-shadow-[0_0_12px_rgba(251,191,36,0.8)]'
                            : 'text-white'
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <InlineAuraGivers
                            targetId={id}
                            type="teaser"
                            ownerId={created_by || ''}
                          />
                          <span>{(teaser_score || 0).toLocaleString()}</span>
                        </div>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-6 md:p-8">
              <h2 className="mb-4 text-xl font-black text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.4)] md:text-2xl">
                {title}
              </h2>
              <div className="mb-4 flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="hide-scrollbar flex-1 overflow-y-auto pr-2 text-sm font-medium leading-relaxed text-white/80 whitespace-pre-wrap">
                  {descText ||
                    'Aucune description. Rejoignez l\'Agora pour dÃ©couvrir l\'enjeu de cette affaire.'}
                </div>
              </div>
              {tags.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {tags.map((tag, idx) => (
                    <span key={idx} className="rounded border border-white/20 bg-black/40 px-2 py-1 text-[10px] font-bold text-white/80">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {/* --- DYNAMIC CTA (Monolith Standard) --- */}
              <div className="mt-auto flex flex-col gap-3 pt-4">
                {isReplay || status === 'cancelled' ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsTeaserOpen(false);
                      onClick();
                    }}
                    className="w-full rounded-xl border border-white/20 bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-all hover:bg-white/20 active:scale-95"
                  >
                    Voir le Verdict & RÃ©sumÃ©
                  </button>
                ) : status === 'live' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (liveAudienceAction) {
                        liveAudienceAction.onClick();
                      } else {
                        onClick();
                      }
                      setIsTeaserOpen(false);
                    }}
                    className={`w-full rounded-xl py-4 text-sm font-black uppercase tracking-widest transition-transform hover:scale-[1.02] active:scale-95 ${
                      liveAudienceAction?.variant === 'return'
                        ? 'bg-blood-600 text-white shadow-glow-blood'
                        : 'bg-white text-black shadow-[0_0_20px_rgba(255,255,255,0.4)]'
                    }`}
                  >
                    {liveAudienceAction?.variant === 'return' ? 'âš”ï¸ Retourner dans l\'Agora' : 'ðŸ”´ Rejoindre le Direct'}
                  </button>
                ) : status === 'scheduled' || status === 'pending' || status === 'ready' ? (
                  <div className="flex flex-col gap-2">
                    {onPrepareAudience ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPrepareAudience();
                          setIsTeaserOpen(false);
                        }}
                        className="w-full rounded-xl bg-white py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:scale-[1.02] active:scale-95"
                      >
                        ðŸŽ›ï¸ PrÃ©parer la RÃ©gie
                      </button>
                    ) : (
                      <>
                        {isManifesto && onApply && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onApply?.();
                              setIsTeaserOpen(false);
                            }}
                            className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-3 text-xs font-bold uppercase tracking-widest text-prestige-gold transition-colors hover:bg-prestige-gold/20"
                          >
                            + RÃ´le au ring
                          </button>
                        )}
                        {status === 'pending' && onSaisirAffaire && !mediator_name && !isParticipant && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onSaisirAffaire();
                              setIsTeaserOpen(false);
                            }}
                            className="w-full rounded-xl bg-prestige-gold py-4 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_15px_rgba(212,175,55,0.5)] transition-transform hover:scale-[1.02] active:scale-95"
                          >
                            Devenir le Ref
                          </button>
                        )}
                        {status === 'pending' && !!mediator_name && onValiderRef && (
                          <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3">
                            <span className="text-center text-[11px] text-gray-300">@{mediator_name} postule.</span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onRefuserRef?.();
                                  setIsTeaserOpen(false);
                                }}
                                className="flex-1 rounded-lg bg-white/10 py-2.5 text-xs font-bold text-white hover:bg-white/20"
                              >
                                Refuser
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onValiderRef();
                                  setIsTeaserOpen(false);
                                }}
                                className="flex-1 rounded-lg bg-prestige-gold py-2.5 text-xs font-bold text-black shadow-[0_0_10px_rgba(212,175,55,0.4)] hover:bg-yellow-500"
                              >
                                Valider
                              </button>
                            </div>
                          </div>
                        )}

                        {(!isManifesto || (!onApply && !onSaisirAffaire && !onValiderRef)) && (
                          <>
                            {userInviteStatus === 'pending' ? (
                              <div className="w-full rounded-xl border border-prestige-gold/40 bg-prestige-gold/10 py-4 text-center text-sm font-bold text-prestige-gold">
                                âš ï¸ Convocation en attente
                              </div>
                            ) : userInviteStatus === 'declined' ? (
                              <div className="w-full rounded-xl border border-blood-500/40 bg-blood-500/10 py-4 text-center text-sm font-bold text-blood-400">
                                âŒ Convocation refusÃ©e
                              </div>
                            ) : userInviteStatus === 'accepted' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClick();
                                  setIsTeaserOpen(false);
                                }}
                                className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                              >
                                Salle d'attente Combattant
                              </button>
                            ) : status === 'ready' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onClick();
                                  setIsTeaserOpen(false);
                                }}
                                className="w-full rounded-xl bg-white/10 py-4 text-sm font-bold uppercase tracking-widest text-white transition-colors hover:bg-white/20 active:scale-95"
                              >
                                Rejoindre le sas public
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled
                                className="w-full cursor-not-allowed rounded-xl border border-white/5 bg-white/5 py-4 text-sm font-bold uppercase tracking-widest text-white/30"
                              >
                                Ouverture prochaine...
                              </button>
                            )}

                            {status === 'pending' && pendingRefText && userInviteStatus !== 'pending' && (
                              <div className="w-full rounded-xl border border-white/10 bg-black/40 py-4 text-center text-[11px] italic text-white/50">
                                {pendingRefText}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {status === 'scheduled' && onSeDesister && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSeDesister();
                          setIsTeaserOpen(false);
                        }}
                        className="mt-1 w-full text-center text-[11px] font-semibold text-white/40 hover:text-white"
                      >
                        Se dÃ©sister
                      </button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
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
```

---

## 5. Synthèse migration Swipe TikTok

| Élément actuel | Détail |
|----------------|--------|
| Conteneur | `#feed-scroll-container` — `overflow-y-auto`, snap mobile list |
| Mode mobile | `list` (snap vertical) vs `grid` (2 colonnes) |
| Desktop | Grille 2–4 colonnes, snap désactivé |
| Vidéo active | `IntersectionObserver` sur `[data-beef-id]` → `isActiveVideo` |
| Carte | `aspect-[3/4] max-h-[70dvh]` — pas plein écran |
| Pagination | Bouton « Charger plus » hors conteneur scroll |

**Aucune modification apportée au code source.**

