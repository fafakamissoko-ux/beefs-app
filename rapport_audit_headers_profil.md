# Rapport d'audit — Extraction des en-têtes profil (Header)

**Date :** 2026-05-31  
**Mode :** extraction uniquement — aucune modification de code  
**Objectif :** préparer la fusion `ProfileHeader.tsx` (profil privé vs public)

---

## 1. Profil privé — `app/profile/ProfileContent.tsx`

**Plage extraite :** lignes **534–700** (commentaire `{/* Profile Header */}` jusqu'à la fermeture du conteneur header, **avant** `{/* Tabs */}` L702)

**Éléments couverts :**
- Bannière (`banner_url`) + upload
- Avatar (`avatar_url`) + upload + boutons Share / Aperçu / Settings
- Identité (`display_name`, `@username`, `bio`)
- Bloc Aura (rang + compteur)
- Métriques sociales (Affaires, Médiations, Réputation, Abonnés, Abonnements)

```tsx
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
```

---

## 2. Profil public — `app/profile/[username]/page.tsx`

**Plage extraite :** lignes **647–853** (commentaire `{/* Profile Header */}` jusqu'à la fermeture du conteneur header, **avant** `{/* Tabs Publics */}` L855)

**Éléments couverts :**
- Bannière (`banner_url`) + lightbox
- Avatar (`avatar_url`) + lightbox + Share / Signaler / Follow / Modifier
- Identité (`display_name`, `@username`, `bio`)
- Bloc Aura (rang + compteur via `prestigeAuraDisplay`)
- Métriques sociales + date d'inscription

```tsx
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
                aria-label="Voir la banniÃ¨re en grand"
              >
                <Image src={profile.banner_url} alt="BanniÃ¨re" fill className="object-cover" sizes="100vw" priority />
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
                          p.following ? '+10 âœ¨' : '-10 âœ¨',
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

              {/* Aura â€” prestige (lifetime) vs Lingots â‰  affichÃ©s ici */}
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

              {/* MÃ©triques Standard (X/Instagram style) */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_participated}</span>
                  <span className="text-gray-400">Affaires</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="font-bold text-white">{stats.beefs_hosted}</span>
                  <span className="text-gray-400">MÃ©diations</span>
                </div>
                <button type="button" onClick={() => setShowFollowModal('followers')} className="flex gap-1.5 hover:underline">
                  <span className="font-bold text-white">{stats.followers}</span>
                  <span className="text-gray-400">AbonnÃ©s</span>
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
```

---

## 3. Synthèse comparative (lecture seule)

| Zone | Privé (`ProfileContent`) | Public (`[username]/page`) |
|------|---------------------------|------------------------------|
| Conteneur header | `rounded-[2rem] bg-white/[0.04] border-white/[0.08] backdrop-blur-2xl` | `rounded-3xl from-gray-800/50 border-gray-700` |
| Bannière | Upload au hover (`Camera` + `handleBannerUpload`) | Clic → `setViewingImage` (lightbox) |
| Avatar | `rounded-[2rem]` + upload `Camera` | `rounded-full` + lightbox |
| Actions | Share, Aperçu public, Settings | Share, Signaler, `FollowButton`, Modifier (own) |
| Aura compteur | `lifetime_points ?? points` | `prestigeAuraDisplay(profile)` |
| Métriques | Boutons navigables (`goStats*`) | Mix div statiques + modales follow |
| Extra | — | Date « Rejoint en … » |

**Prochaine étape Architecte :** fusion en `ProfileHeader.tsx` avec props de variante (`owner` | `visitor`).
