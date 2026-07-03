# Rapport d'audit global — Aura UI (Notifications, Teaser, Profil)

**Date :** 31 mai 2026  
**Objectif :** extraire l'état actuel pour refonte onglets Notifications + déploiement `InlineAuraGivers`  
**Statut :** extraction uniquement (aucune modification)

---

## 0. Contexte données — page Notifications (entités croisées)

**États séparés :**

```typescript
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [auraNotifications, setAuraNotifications] = useState<AuraSparkNotification[]>([]);
```

**Fetch parallèle (`fetchNotifications`, l. 111–128) :**

```typescript
      const [notifRes, auraRes] = await Promise.all([
        supabase.from('notifications').select('*').eq('user_id', user.id)...,
        supabase.from('aura_notifications')
          .select('id, created_at, giver_name, giver_username, aura_kind, is_read')
          .eq('user_id', user.id)...,
      ]);
      setNotifications((notifRes.data ?? []) as AppNotification[]);
      setAuraNotifications(auraRes.error ? [] : ((auraRes.data ?? []) as AuraSparkNotification[]));
```

**Fusion affichage (`displayNotifications`, l. 304–310) :**

```typescript
  const displayNotifications = useMemo(
    () =>
      [...notifications, ...auraAsAppNotifications].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [notifications, auraAsAppNotifications],
  );
```

**Lecture unitaire spark (`handleRowClick`, branche `isSparkRow`) :** `UPDATE aura_sparks` + `setAuraNotifications` — distinct de `mark_notification_read` sur table `notifications`.

---

## 1. Page Notifications — rendu UI complet (`return`)

**Fichier :** `app/notifications/page.tsx`  
**Lignes :** 317–418

```tsx
  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <AppBackButton className="mb-4" />
        <div className="flex flex-col gap-4 mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <h1 className="text-3xl font-black text-white truncate">
                Notifications
              </h1>
              {unreadCount > 0 && (
                <span className="brand-gradient text-white text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                  {unreadCount}
                </span>
              )}
            </div>
            <Bell className="w-6 h-6 text-gray-500 shrink-0" />
          </div>
          {displayNotifications.length > 0 && unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={markingAll}
              className="self-start text-sm font-semibold text-brand-400 hover:text-brand-300 disabled:opacity-50 transition-colors"
            >
              {markingAll ? 'Mise à jour…' : 'Tout marquer comme lu'}
            </button>
          )}
        </div>

        {isPageLoading ? (
          <div className="flex flex-col gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        ) : displayNotifications.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="py-12 border-b border-white/5 flex flex-col items-center justify-center w-full"
          >
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
              <BellOff className="w-8 h-8 text-gray-600" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              Aucune notification
            </h2>
            <p className="text-gray-500 text-sm">
              Quand tu recevras des suivis, invitations, messages, étincelles d’Aura ou alertes,
              elles apparaîtront ici.
            </p>
          </motion.div>
        ) : (
          <div>
            <AnimatePresence>
              {displayNotifications.map((n, i) => {
                const mapKey =
                  typeof n.type === 'string' && n.type in ICON_MAP ? (n.type as NotificationType) : 'system';
                const { icon: Icon, color, bg } = ICON_MAP[mapKey];
                const unread = isNotificationUnread(n);
                return (
                  <motion.button
                    key={n.id}
                    type="button"
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04, duration: 0.25, ease: 'easeOut' }}
                    onClick={() => handleRowClick(n)}
                    className={`flex items-start gap-4 w-full text-left px-4 py-3 transition-colors hover:bg-white/[0.04] border-b border-white/5 ${
                      unread ? 'bg-brand-500/5' : ''
                    }`}
                  >
                    <div
                      className={`w-10 h-10 rounded-full ${bg} flex items-center justify-center shrink-0`}
                    >
                      <Icon className={`w-5 h-5 ${color}`} />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <p className="text-sm font-bold text-white">{n.title}</p>
                      {n.body ? (
                        <p className="text-sm text-gray-400 line-clamp-2">
                          {n.body}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pt-0.5">
                      <span className="text-xs text-gray-600 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {shortTimeAgo(n.created_at)}
                      </span>
                      {unread && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" aria-hidden />}
                    </div>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
```

**Point d'insertion onglets (Architecte) :** entre le header (`mb-8`) et le ternaire `isPageLoading / empty / list` — aucun composant Tabs aujourd'hui.

---

## 2. BeefCard — Teaser Aura (modale plein écran)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 597–697

```tsx
              {(video_url || onTeaserAuraClick) && (
                <div className="absolute bottom-4 right-4 z-[9999] flex flex-col-reverse items-center gap-3">
                  {video_url && (
                    <button type="button" onClick={handleToggleMute} ...>
                      {isMuted ? <VolumeX ... /> : <Volume2 ... />}
                    </button>
                  )}

                  {onTeaserAuraClick && (
                    <div className="relative flex flex-col items-center gap-1.5">
                      <AnimatePresence>
                        {teaserFloatingAuras.map((aura) => (
                          <motion.span key={aura.id} ...>+1</motion.span>
                        ))}
                      </AnimatePresence>
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={(e) => { ... onTeaserAuraClick?.(); }}
                        onKeyDown={(e) => { ... onTeaserAuraClick?.(); }}
                        aria-label="Aura teaser"
                        className={`flex h-12 w-12 cursor-pointer ...`}
                      >
                        <Sparkles className={`h-6 w-6 ${has_liked_teaser ? 'fill-amber-400 ...' : 'text-white'}`} />
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
                        className={`cursor-pointer px-3 py-2 -mx-3 -my-2 font-mono text-xs font-bold ...`}
                      >
                        {(teaser_score || 0).toLocaleString()}
                      </span>
                    </div>
                  )}
                </div>
              )}
```

**Modale givers teaser (montage, l. 908–914) :**

```tsx
      <AuraGiversModal
        isOpen={isTeaserAuraModalOpen}
        onClose={() => setIsTeaserAuraModalOpen(false)}
        targetId={id}
        type="teaser"
        ownerId={created_by || ''}
      />
```

**État actuel Phase 8.3 :** `InlineAuraGivers` présent sur **beef** (`engagement_score`) uniquement — **absent** sur le `<span>{teaser_score}</span>`.

**Injection cible :**

```tsx
<InlineAuraGivers targetId={id} type="teaser" ownerId={created_by || ''} />
```

… dans le `<span>` score teaser (avant `teaser_score`), même pattern `flex items-center gap-1.5`.

---

## 2b. BeefCard — Aura beef (référence déjà intégrée)

**Fichier :** `components/BeefCard.tsx`  
**Lignes :** 494–509

```tsx
                  <button
                    type="button"
                    className="flex h-full items-center justify-center gap-1.5 pl-1.5 pr-2.5 ..."
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
```

---

## 3. Profil public — `app/profile/[username]/page.tsx`

**Pas de `ProfileHeader.tsx`** — header profil inline dans cette page (+ miroir `ProfileContent.tsx` pour `/profile` propre).

### 3.1 Bannière & Avatar (clic → lightbox)

**Lignes :** 626–670

```tsx
          <div className="h-48 bg-gradient-to-r from-brand-500/20 ... relative rounded-t-3xl overflow-hidden">
            ...
            {profile.banner_url ? (
              <button
                type="button"
                onClick={() =>
                  setViewingImage({
                    url: profile.banner_original_url || profile.banner_url!,
                    type: 'banner',
                  })
                }
                ...
              >
                <Image src={profile.banner_url} alt="Bannière" fill ... />
              </button>
            ) : (
              <div className="pointer-events-none absolute inset-0 z-0 bg-white/5" />
            )}
          </div>

          <div className="px-6 pb-6 -mt-16 relative">
            <div className="flex items-end justify-between mb-4">
              <div className="relative flex h-32 w-32 ... rounded-full ...">
                {profile.avatar_url ? (
                  <button
                    type="button"
                    onClick={() =>
                      setViewingImage({
                        url: profile.avatar_original_url || profile.avatar_url!,
                        type: 'avatar',
                      })
                    }
                    ...
                  >
                    <Image src={profile.avatar_url} alt={profile.display_name} fill ... />
                  </button>
                ) : (
                  profile.username[0].toUpperCase()
                )}
              </div>
```

### 3.2 Aura profil (prestige lifetime — pas avatar/banner)

**Lignes :** 768–796

```tsx
              <div
                className="flex flex-wrap items-center gap-3 mb-4 cursor-pointer ..."
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
                    <div className="flex items-center gap-1.5 rounded-full border ...">
                      <Flame className={`h-3.5 w-3.5 ${rank.colorClass}`} />
                      <span className={`... ${rank.colorClass}`}>{rank.title}</span>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1.5 text-sm text-gray-400">
                  <Flame className="h-4 w-4 text-brand-500" />
                  <span className="font-bold text-white">
                    {prestigeAuraDisplay(profile).toLocaleString('fr-FR')}
                  </span>{' '}
                  Aura
                </div>
              </div>
```

**Modale profil :**

```tsx
        <AuraGiversModal
          isOpen={isAuraModalOpen}
          onClose={() => setIsAuraModalOpen(false)}
          targetId={profile.id}
          type="profile"
          ownerId={profile.id}
        />
```

### 3.3 Lightbox — bouton Aura avatar / bannière (like média)

**État likes :**

```typescript
  const [mediaLikes, setMediaLikes] = useState({
    avatar: { count: 0, liked: false },
    banner: { count: 0, liked: false },
  });
```

**Handler (`handleMediaAuraClick`, l. 464–527) — extrait :**

```typescript
  const handleMediaAuraClick = useCallback(async () => {
    ...
    const type = viewingImage.type; // 'avatar' | 'banner'
    ...
    if (wasLiked) {
      await supabase.from('profile_media_likes').delete().match({
        media_owner_id: profile.id,
        user_id: user.id,
        media_type: type,
      });
    } else {
      await supabase.from('profile_media_likes').insert({
        media_owner_id: profile.id,
        user_id: user.id,
        media_type: type,
      });
    }
  }, ...);
```

**UI bouton like média (lightbox, l. 1088–1119) :**

```tsx
                <button
                  type="button"
                  onClick={() => { void handleMediaAuraClick(); }}
                  disabled={mediaAuraLoading || !!isOwnProfile || !profile}
                  aria-label={
                    viewingImage.type === 'avatar'
                      ? 'Aura sur la photo de profil'
                      : 'Aura sur la bannière'
                  }
                  className={`relative flex items-center gap-3 rounded-full border-2 px-8 py-4 ...`}
                >
                  <Sparkles className={`h-6 w-6 ${mediaLikes[viewingImage.type].liked ? 'fill-yellow-400 ...' : 'text-white'}`} />
                  <span className="font-mono tabular-nums">
                    {(mediaLikes[viewingImage.type].count ?? 0).toLocaleString()}
                  </span>
                </button>
```

**Injection `InlineAuraGivers` cible :**

| Surface | Props suggérées |
|---------|-----------------|
| Avatar lightbox | `targetId={profile.id}`, `type="avatar"`, `ownerId={profile.id}` |
| Bannière lightbox | `targetId={profile.id}`, `type="banner"`, `ownerId={profile.id}` |

**Note :** `InlineAuraGivers` accepte aujourd'hui `'beef' \| 'teaser' \| 'profile'` — extension **`avatar` / `banner`** requise pour alignement `get_universal_aura_givers`.

---

## 4. Profil propre — `app/profile/ProfileContent.tsx` (miroir)

**Aura prestige (l. 764–792) :** structure identique à `[username]/page.tsx` — clic → `setIsAuraModalOpen(true)`.

**Modale (l. 1654–1660) :**

```tsx
      <AuraGiversModal
        isOpen={isAuraModalOpen}
        onClose={() => setIsAuraModalOpen(false)}
        targetId={profile.id}
        type="profile"
        ownerId={profile.id}
      />
```

Pas de lightbox avatar/banner avec like média sur `ProfileContent` (édition crop uniquement).

---

## 5. Synthèse déploiement `InlineAuraGivers`

| Zone | Fichier | Statut | Type RPC |
|------|---------|--------|----------|
| Beef engagement | `BeefCard.tsx` | ✅ intégré | `beef` |
| Teaser score | `BeefCard.tsx` modale | ❌ absent | `teaser` |
| Profil prestige | `[username]/page.tsx` | ❌ absent | `profile` |
| Avatar like | `[username]/page.tsx` lightbox | ❌ absent | `avatar`* |
| Bannière like | `[username]/page.tsx` lightbox | ❌ absent | `banner`* |

\*Types supportés par `AuraGiversModal` mais pas encore par `InlineAuraGivers`.

---

**Fin du rapport — prêt pour refonte Architecte.**
