# Rapport d'audit — Phase H.3

- **Date :** 2026-07-21
- **Commit ref :** `b2018b9`
- **Contrainte :** zéro modification du dépôt — lecture seule

---

## Synthèse

Ce rapport cible les **collisions visuelles** du `PremiumNotificationBadge` et les **pilules redondantes** « X nouvelle(s) » héritées de l'ancien design mobile.

| Zone | Fichier | Lignes | Problème identifié |
|------|---------|--------|-------------------|
| Nav desktop / sidebar | `components/Header.tsx` | L.430–493 | Badge `absolute` dans `<div className="relative">` — pas de pilule « nouvelles » (OK) |
| Drawer mobile hamburger | `components/Header.tsx` | L.699–754 | **Double compteur** : `PremiumNotificationBadge` + pilule cyan `{item.badge} nouvelle(s)` |
| En-tête page Notifications | `app/notifications/page.tsx` | L.362–374 | Pilule `brand-gradient` à côté du `h1` — risque d'artefact / décalage vertical |

**Contexte composant badge (référence collision) :**

```tsx
// components/shared/PremiumNotificationBadge.tsx L.30–40
  const sizeClasses = compact
    ? 'h-3.5 min-w-[14px] px-1 text-[9px] -top-1 -right-1'
    : 'h-4.5 min-w-[18px] px-1.5 text-[10px] -top-1.5 -right-1.5';

  return (
    <div className={`absolute z-[50] flex items-center justify-center rounded-full border backdrop-blur-md font-black ${colors[variant]} ${sizeClasses}`}>
      <div className={`absolute inset-0 rounded-full animate-ping opacity-40 ${halos[variant]}`} aria-hidden />
      <span className="relative z-10 drop-shadow-md">{displayCount}</span>
    </div>
  );
```

**Note :** `h-4.5` n'est pas une classe Tailwind standard — peut provoquer un sizing incohérent en desktop.

---

## Cartographie — source des badges nav

```typescript
  const navItems = [
    { href: '/feed', label: 'Fil d'actu', icon: Home, badge: 0 },
    {
      href: '/notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadNotifications,
    },
    { href: '/points', label: 'Lingots', icon: Coins, badge: 0 },
    {
      href: '/invitations',
      label: 'Convocations',
      icon: Mail,
      badge: pendingInvitations,
    },
    {
      href: '/messages',
      label: 'Messages',
      icon: MessageCircle,
      badge: unreadMessages,
    },
  ];
```

---

# 1. Extraction — Rendu Navigation Desktop & Sidebar

**Fichier :** `components/Header.tsx`  
**Contexte :** `<nav>` desktop / sidebar (`shell === 'phone'` → colonne lg+)  
**Lignes :** 430–493

```tsx
              {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  const itemClasses = `relative flex items-center gap-2 border-l-[3px] border-transparent px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                    active
                      ? 'text-white max-lg:rounded-xl max-lg:border-l-transparent max-lg:bg-white/10 max-lg:text-cyan-400 lg:rounded-none lg:border-cyan-400 lg:bg-gradient-to-r lg:from-cyan-500/15 lg:to-transparent lg:text-white'
                      : 'text-gray-500 max-lg:rounded-xl max-lg:hover:bg-white/[0.04] max-lg:hover:text-gray-200 lg:rounded-none lg:text-gray-400 lg:hover:border-transparent lg:hover:bg-white/[0.04] lg:hover:text-white'
                  } ${shell === 'full' && navSecondaryHrefs.has(item.href) ? 'hidden xl:flex' : ''} ${
                    shell === 'phone' ? 'lg:w-full lg:justify-start lg:px-4' : ''
                  }`;

                  if (item.href === '/messages') {
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          if (pathname === '/messages' || pathname.startsWith('/messages/')) return;
                          openDrawer();
                        }}
                        className={itemClasses}
                      >
                        <div className="relative">
                          <Icon className={`w-[18px] h-[18px] ${active ? 'max-lg:text-cyan-400' : ''}`} />
                          <PremiumNotificationBadge count={item.badge} variant={navBadgeVariant(item.href)} />
                        </div>
                        <span className="md:hidden lg:inline">{item.label}</span>
                        {active && (
                          <motion.div layoutId="nav-indicator" className="absolute -bottom-[13px] left-3 right-3 block h-[2px] rounded-full lg:hidden" style={{ background: 'linear-gradient(90deg, #00F0FF, #00B3CC)' }} transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
                        )}
                      </button>
                    );
                  }

                  return (
                    <Link
                      key={item.href}
                      href={hrefWithFrom(item.href, pathname)}
                      prefetch={false}
                      className={itemClasses}
                    >
                      <div className="relative">
                        <Icon
                          className={`w-[18px] h-[18px] ${
                            active
                              ? 'max-lg:text-cyan-400 ' +
                                (item.href === '/points' ? 'lg:text-cyan-400' : '')
                              : ''
                          }`}
                        />
                        <PremiumNotificationBadge count={item.badge} variant={navBadgeVariant(item.href)} />
                      </div>
                      <span className="md:hidden lg:inline">{item.label}</span>
                      {active && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute -bottom-[13px] left-3 right-3 block h-[2px] rounded-full lg:hidden"
                          style={{ background: 'linear-gradient(90deg, #00F0FF, #00B3CC)' }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
```

**Structure DOM clé (desktop) :**

```
<button|Link.itemClasses (relative flex items-center gap-2)
  └─ div.relative
       ├─ Icon (18×18)
       └─ PremiumNotificationBadge (absolute -top-1.5 -right-1.5)
  └─ span (label, md:hidden lg:inline)
```

**Pas de pilule « nouvelles »** sur cette branche — collision limitée au positionnement `absolute` du badge sur l'icône.

---

# 2. Extraction — Drawer Mobile (pilules « nouvelles » à supprimer)

**Fichier :** `components/Header.tsx`  
**Contexte :** Menu hamburger mobile (`mobileMenuOpen`, `lg:hidden`)  
**Lignes :** 699–754

```tsx
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  const itemClasses = `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                    active
                      ? 'max-lg:rounded-xl max-lg:bg-white/10 text-cyan-400'
                      : 'text-gray-400 hover:text-white hover:bg-white/[0.04] max-lg:rounded-xl'
                  }`;

                  if (item.href === '/messages') {
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          if (pathname === '/messages' || pathname.startsWith('/messages/')) return;
                          openDrawer();
                        }}
                        className={`w-full text-left ${itemClasses}`}
                      >
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          <PremiumNotificationBadge count={item.badge} compact variant={navBadgeVariant(item.href)} />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                            {item.badge} nouvelle{item.badge > 1 ? 's' : ''}
                          </span>
                        )}
                      </button>
                    );
                  }

                  return (
                      <Link
                        key={item.href}
                        href={hrefWithFrom(item.href, pathname)}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className={itemClasses}
                      >
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          <PremiumNotificationBadge count={item.badge} compact variant={navBadgeVariant(item.href)} />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[10px] font-bold text-cyan-400">
                            {item.badge} nouvelle{item.badge > 1 ? 's' : ''}
                          </span>
                        )}
                      </Link>
                    );
                  })}
```

**Cibles destruction H.3 (pilules redondantes) :**

| Occurrence | Lignes | Pattern exact |
|------------|--------|---------------|
| Messages (button) | L.725–729 | `{item.badge > 0 && (<span className="rounded-full bg-cyan-500/10 ...">{item.badge} nouvelle(s)</span>)}` |
| Autres items (Link) | L.747–751 | Idem |

**Structure DOM mobile (double notification) :**

```
button|Link (flex items-center gap-3)
  ├─ div.relative
  │    ├─ Icon (20×20)
  │    └─ PremiumNotificationBadge compact  ← nouveau standard
  ├─ span.flex-1 (label)
  └─ span cyan pill "3 nouvelles"           ← ANCIEN — redondant
```

---

# 3. Extraction — En-tête page Notifications

**Fichier :** `app/notifications/page.tsx`  
**Calcul compteur (amont) :** L.346–347

```typescript
  const unreadCount = displayNotifications.filter(isNotificationUnread).length;
  const unreadFilteredCount = filteredNotifications.filter(isNotificationUnread).length;
```

**Bloc JSX en-tête :** L.361–401

```tsx
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
          <div className="flex flex-wrap gap-2">
            {TAB_OPTIONS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 ${
                  activeTab === tab.id
                    ? 'border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          {filteredNotifications.length > 0 && unreadFilteredCount > 0 && (
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
```

**Classes CSS pilule en-tête :**

| Classe | Rôle |
|--------|------|
| `brand-gradient` | Fond dégradé cyan (utility globale) |
| `text-white text-xs font-bold` | Typo compteur |
| `px-2.5 py-1 rounded-full shrink-0` | Forme pilule, empêche shrink dans flex |
| Conteneur parent | `flex items-center gap-3 min-w-0` — alignement horizontal avec `h1` |

**Artefacts potentiels :**
- Pilule `brand-gradient` ≠ style Premium Glass du `PremiumNotificationBadge` (glass + pulse + border)
- `h1` `text-3xl font-black` vs pilule `text-xs` — décalage baseline possible sans `items-baseline` ou `self-center` explicite sur la pilule
- Icône `Bell` à droite (`justify-between`) sans badge — asymétrie visuelle vs compteur à gauche du titre

---

# Verdict Architecte — Pistes correction H.3

1. **Header mobile (L.725–729, L.747–751)** — Supprimer les deux blocs `{item.badge > 0 && (... nouvelle(s) ...)}` ; conserver uniquement `PremiumNotificationBadge compact`.
2. **PremiumNotificationBadge** — Remplacer `h-4.5` par `h-[18px]` ou `min-h-[18px]` (Tailwind valide) ; vérifier `overflow-visible` sur le wrapper `div.relative`.
3. **Page Notifications (L.367–371)** — Remplacer la pilule `brand-gradient` par `<PremiumNotificationBadge>` inline ou variante « page header » sans `absolute` ; aligner avec `items-center` ou flex dédié.
4. **Cohérence** — Unifier variant : notifications page → `red` ou `cyan` selon charte Pulse & Glow.

---

*Fin du rapport — Phase H.3 — extraction seule, aucune modification applicative.*
