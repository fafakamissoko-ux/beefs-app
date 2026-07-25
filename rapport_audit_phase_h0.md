# Rapport d'audit — Phase H.0

- **Date :** 2026-07-21
- **Commit ref :** `13fae05`
- **Contrainte :** zéro modification du dépôt — lecture seule

---

## Synthèse

Préparation du composant global **« Pulse & Glow »** (badge notification animé) sur trois surfaces :

| Surface | Composant | Chrome nav visible ? | Badges existants |
|---------|-----------|----------------------|------------------|
| **Arène in-live** | `TikTokStyleArena.tsx` + `MediatorOrb.tsx` | Non (`AppShell` bypass `/arena/*`) | Compteur interne régie (`handsRaised.length`) ; **aucun badge** sur le bouton Command Deck |
| **Feed / app** | `Header.tsx` via `AppShell.tsx` | Oui | `NavUnreadBadge` sur Cloche, Convocations, Messages |
| **Arène (menu mobile)** | Drawer `showArenaMenu` | Overlay arène | Messages sans badge (`unreadDMsCount` calculé mais **non branché**) |

**Points clés pour l'Architecte :**

1. Le **Command Deck** s'ouvre via un bouton `Sliders` dans `MediatorOrb` (`data-mediator-sidebar-toggle`) — espace badge : coin supérieur droit du bouton rond (classe `relative after:absolute after:-inset-2`).
2. Les **demandes en attente** Ref sont scindées en `handsRaised` (raise-hand) et `refInvites` (convocations Ref) — seul `handsRaised` est passé à `MediatorSidebar` ; **`refInvites` est un état mort** (jamais consommé en JSX).
3. La **navigation globale** est centralisée dans `Header.tsx` — pas de `BottomNav.tsx` ni `NavBar.tsx` séparés.
4. Les **compteurs non lus** globaux vivent dans `Header.loadUnreadCounts()` (RPC Supabase + Realtime) ; l'arène duplique partiellement la logique DM via `unreadDMsCount` sans l'afficher.

---

## Cartographie fichiers

| Fichier | Rôle |
|---------|------|
| `components/TikTokStyleArena.tsx` | Arène — menu mobile, dock spectateur, état pending invites |
| `components/Arena/shared/MediatorOrb.tsx` | Bouton **Command Deck** (Ref uniquement) |
| `components/MediatorSidebar.tsx` | Panneau régie — affiche `pendingInvites.length` |
| `components/Header.tsx` | Nav principale + badges Cloche / Convocations / Messages |
| `components/AppShell.tsx` | Intègre `Header` ; **masque** le header sur `/arena/*` |
| `app/layout.tsx` | Root layout → `AppShell` |
| `lib/notification-unread.ts` | Helper `isNotificationUnread` |
| `components/BeefNotificationToasts.tsx` | Toasts beef live (pas badge nav) |

---

# 1. Extraction — Déclencheur Régie (Arène)

## 1.1 États pending / invites

```typescript
  const [mediatorSidebarOpen, setMediatorSidebarOpen] = useState(false);
  const [showArenaMenu, setShowArenaMenu] = useState(false);
  const [handsRaised, setHandsRaised] = useState<Array<{ userId: string; label: string }>>([]);
  const [refInvites, setRefInvites] = useState<Array<{ userId: string; label: string }>>([]);
  const [unreadDMsCount, setUnreadDMsCount] = useState(0);
```

**Note :** pas de `pendingInvitesCount` dérivé — le compteur affiché en régie est `handsRaised.length` (via prop `pendingInvites={handsRaised}`).

---

## 1.2 Calcul des demandes en attente — `fetchPendingInvites`

```typescript
  const fetchPendingInvites = useCallback(async () => {
    if (!isHost) return;

    const { data: participants, error: pError } = await supabase
      .from('beef_participants')
      .select('user_id')
      .eq('beef_id', roomId)
      .eq('invite_status', 'pending');

    if (pError || !participants) return;

    const { data: invitations } = await supabase
      .from('beef_invitations')
      .select('invitee_id')
      .eq('beef_id', roomId)
      .eq('status', 'sent');

    const refInvitedIds = new Set((invitations ?? []).map((i) => i.invitee_id));

    const { fetchUserPublicByIds } = await import('@/lib/fetch-user-public-profile');
    const ids = participants.map((r) => r.user_id);
    const pubMap = await fetchUserPublicByIds(supabase, ids, 'id, username, display_name');

    const hands: Array<{ userId: string; label: string }> = [];
    const invites: Array<{ userId: string; label: string }> = [];

    participants.forEach((r) => {
      const u = pubMap.get(r.user_id);
      const label =
        (u?.display_name && u.display_name.trim()) ||
        (u?.username && u.username.trim()) ||
        'Invité';
      if (refInvitedIds.has(r.user_id)) {
        invites.push({ userId: r.user_id, label });
      } else {
        hands.push({ userId: r.user_id, label });
      }
    });

    setHandsRaised(hands);
    setRefInvites(invites);
  }, [isHost, roomId]);

  useEffect(() => {
    if (!isHost || !mediatorSidebarOpen) return;
    void fetchPendingInvites();
  }, [isHost, mediatorSidebarOpen, fetchPendingInvites]);
```

**Compteurs disponibles pour Pulse & Glow :**

| Variable | Signification | Consommé UI ? |
|----------|---------------|---------------|
| `handsRaised.length` | Raise-hand (sans convocation Ref) | Oui — `MediatorSidebar` section « Invités en attente » |
| `refInvites.length` | Pending + `beef_invitations.sent` | **Non** — état rempli, jamais affiché |
| `handsRaised.length + refInvites.length` | Total pending participants | Non calculé explicitement |

---

## 1.3 Bouton Command Deck — `components/Arena/shared/MediatorOrb.tsx`

```tsx
          {isHost && (
            <button
              type="button"
              data-mediator-sidebar-toggle
              onClick={(e) => {
                e.stopPropagation();
                onToggleMediatorSidebar();
              }}
              className="relative after:absolute after:-inset-2 ml-1 flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-white/5 text-prestige-gold shadow-[inset_0_1px_1px_rgba(255,255,255,0.2)] transition-colors hover:bg-white/15 hover:text-white active:scale-95"
              title="Command Deck"
            >
              <Sliders className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            </button>
          )}
```

**Câblage parent (`TikTokStyleArena.tsx`) :**

```tsx
          onToggleMediatorSidebar={() => setMediatorSidebarOpen((o) => !o)}
```

```tsx
      {isHost && (
        <MediatorSidebar
          open={mediatorSidebarOpen}
          onClose={() => setMediatorSidebarOpen(false)}
          // ...
          pendingInvites={handsRaised}
          onAcceptPendingInvite={handleAcceptPendingInvite}
          onRejectPendingInvite={handleRejectPendingInvite}
          // ...
        />
      )}
```

**Point d'accroche badge recommandé :** wrapper `relative` autour du bouton `Sliders` ; le pseudo-élément `after:-inset-2` agrandit déjà la zone tactile.

---

## 1.4 Compteur interne régie — `MediatorSidebar.tsx`

```tsx
                        <div className="mb-3 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-blue-200/60">
                            Invités en attente
                          </span>
                          <span className="rounded-full border border-white/10 bg-slate-950/45 px-2 py-0.5 font-mono text-[9px] text-blue-200/65">
                            {pendingInvites.length}
                          </span>
                        </div>
```

---

## 1.5 Icônes spectateur — dock desktop & mobile (`TikTokStyleArena.tsx`)

**Desktop (`#dock-desktop`) :**

```tsx
            {isViewer && (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  void handleRaiseHand();
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/10 text-white shadow-lg transition-transform hover:bg-white/20 active:scale-95"
                title="Demander à monter sur scène"
              >
                ✋
              </button>
            )}
```

**Mobile (`#dock-mobile`) — même pattern raise-hand ✋**

**Indicateurs haut-droite (mobile arène) :**

```tsx
            <button
              type="button"
              onClick={() => setShowViewerList(true)}
              className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/10 bg-slate-900/40 px-2 py-1 sm:px-3 sm:py-1.5 shadow-lg backdrop-blur-sm transition-all hover:bg-slate-900/60"
            >
              <Eye className="h-3 w-3 text-white" />
              <span className="font-mono text-[9px] sm:text-[10px] font-bold text-white">{actualViewerCount > 0 ? actualViewerCount : '—'}</span>
            </button>

            {!beefEnded && !isLeaving && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowArenaMenu(true);
                }}
                className="pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-slate-900/40 text-white shadow-lg backdrop-blur-sm transition-colors hover:bg-slate-900/60 lg:hidden"
              >
                <Menu className="h-3.5 w-3.5" />
              </button>
            )}
```

**Menu arène desktop (aside chat header) :**

```tsx
          <button type="button" onClick={() => setShowArenaMenu(v => !v)} className="flex h-9 w-9 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10"><Menu className="h-5 w-5" strokeWidth={1.5} /></button>
```

**Menu mobile drawer — action Messages (sans badge) :**

```tsx
                  <button type="button" onClick={() => { setShowArenaMenu(false); openDrawer(); }} className="flex flex-col items-center gap-2">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-white/10 transition-transform active:scale-90 relative">
                      <MessageCircle className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-[10px] font-semibold text-white/80">Messages</span>
                  </button>
```

---

## 1.6 État DM arène (calculé, non affiché)

```typescript
  useEffect(() => {
    if (!userId) return;
    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'message')
        .or('is_read.is.null,is_read.eq.false');
      if (count !== null) setUnreadDMsCount(count);
    };
    void fetchUnread();

    const channel = supabase
      .channel(`arena_dms_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && payload.new.type === 'message') {
            setUnreadDMsCount(c => c + 1);
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          if (payload.new && payload.new.type === 'message' && payload.new.is_read) {
            setUnreadDMsCount(c => Math.max(0, c - 1));
          }
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [userId]);
```

**Anomalie H.0 :** `unreadDMsCount` n'est référencé nulle part dans le JSX actuel — prêt pour branchement Pulse & Glow sur l'icône Messages du menu arène.

---

# 2. Extraction — Navigation globale (Hors-Live)

## 2.1 Intégration layout — `app/layout.tsx`

```tsx
                <AppShell>{children}</AppShell>
```

## 2.2 Coquille — `components/AppShell.tsx` (source intégrale)

```tsx
'use client';

import { usePathname } from 'next/navigation';
import { Header } from '@/components/Header';

/**
 * Coquille app : mobile-first, desktop fluide avec sidebar (Header shell phone).
 * Routes /admin : pleine largeur sans sidebar téléphone.
 */
/** Arène / salle live : pas de padding sur le main pour que le contenu fixed (100dvh) remplisse l'écran sans double décalage. */
function isRoomImmersiveRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return /^\/arena\/[^/]+/.test(pathname) || /^\/live\/[^/]+/.test(pathname);
}

/** Pages plein écran sans chrome app (sas pseudo, carrousel d'accueil). */
function isStandalonePublicPage(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === '/onboarding';
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const fullWidthShell = pathname?.startsWith('/admin') ?? false;
  const roomImmersive = isRoomImmersiveRoute(pathname ?? null);
  const standalone = isStandalonePublicPage(pathname ?? null);

  if (standalone || roomImmersive) {
    return <>{children}</>;
  }

  if (fullWidthShell) {
    return (
      <>
        <Header shell="full" />
        <main className="min-h-dvh pt-14">{children}</main>
      </>
    );
  }

  return (
    <div className="flex h-[100dvh] w-full min-w-0 flex-col overflow-hidden bg-transparent backdrop-blur-none lg:flex-row">
      <Header shell="phone" />

      <main className="mx-auto flex h-full min-h-0 w-full max-w-md flex-1 flex-col transition-all overflow-hidden lg:mx-0 lg:max-w-none lg:pt-0">
        <div
          className={`flex min-h-0 min-w-0 flex-1 flex-col transition-all ${
            roomImmersive
              ? 'overflow-hidden p-0'
              : pathname === '/feed' || pathname === '/'
                ? 'h-full min-h-0 max-md:overflow-hidden max-md:p-0 overflow-x-hidden p-4 lg:p-10'
                : 'overflow-x-hidden p-4 lg:p-10'
          }`}
        >
          {children}
        </div>
      </main>
    </div>
  );
}
```

**Implication Pulse & Glow :** sur `/arena/[roomId]`, **aucun `Header`** — le badge global doit être **répliqué ou injecté** dans le chrome arène (`TikTokStyleArena`) si l'UX doit rester cohérente in-live.

---

## 2.3 Composant nav principal — `components/Header.tsx` (source intégrale)

> Fichier unique de navigation. Pas de `BottomNav.tsx` / `NavBar.tsx` dans le dépôt.  
> **845 lignes** — source complète extraite ci-dessous.

```tsx
'use client';

import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  Home,
  Flame,
  Bell,
  User,
  Settings as SettingsIcon,
  MessageCircle,
  LogOut,
  Mail,
  ChevronDown,
  Shield,
  Coins,
  Search,
  Swords,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { BeefLogo } from '@/components/BeefLogo';
import { BeefNotificationToasts } from '@/components/BeefNotificationToasts';
import { supabase } from '@/lib/supabase/client';
import { hrefWithFrom } from '@/lib/navigation-return';
import { useGlobalSearch } from '@/contexts/GlobalSearchContext';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';
import { getAuraRank } from '@/lib/prestige';
import { openBuyPointsPage } from '@/lib/navigation-buy-points';

const buyPointsAnchorClass =
  'flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors';

function getNotifPrefs(): Record<string, boolean> {
  try {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('beefs_notif_prefs') : null;
    return saved ? JSON.parse(saved) : {};
  } catch { return {}; }
}

function showBrowserNotification(title: string, body: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (document.hasFocus()) return;
  const prefs = getNotifPrefs();
  if (prefs.browser === false) return;

  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/icon-192.png', badge: '/icon-192.png', tag: `beefs-${Date.now()}` });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
}

function parseBadgeCount(data: unknown): number {
  if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
  if (typeof data === 'string') {
    const p = parseInt(data, 10);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  }
  return 0;
}

function formatNavBadgeCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n > 999) return '999+';
  return String(n);
}

function SearchKeyboardShortcut({ visibleFrom = 'lg' }: { visibleFrom?: 'lg' | 'xl' }) {
  const [modKey, setModKey] = useState<'⌘' | 'Ctrl'>('Ctrl');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
    setModKey(apple ? '⌘' : 'Ctrl');
  }, []);
  const visClass = visibleFrom === 'xl' ? 'xl:inline-flex' : 'lg:inline-flex';
  return (
    <span className={`hidden shrink-0 items-center gap-0.5 ${visClass}`} aria-hidden>
      <kbd className="pointer-events-none inline-flex h-5 min-w-[1.35rem] select-none items-center justify-center rounded border border-white/12 bg-black/35 px-1 font-sans text-[10px] font-semibold leading-none text-white/55 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]">
        {modKey}
      </kbd>
      <kbd className="pointer-events-none inline-flex h-5 min-w-[1.25rem] select-none items-center justify-center rounded border border-white/12 bg-black/35 px-1 font-sans text-[10px] font-semibold leading-none text-white/55 shadow-[inset_0_-1px_0_rgba(0,0,0,0.4)]">
        K
      </kbd>
    </span>
  );
}

function hideGlobalSearchOnPath(pathname: string | null): boolean {
  if (!pathname) return false;
  if (
    pathname === '/login' ||
    pathname === '/signup' ||
    pathname === '/forgot-password' ||
    pathname === '/onboarding'
  ) {
    return true;
  }
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

function NavUnreadBadge({
  href,
  count,
  compact,
}: {
  href: string;
  count: number;
  compact?: boolean;
}) {
  if (count <= 0) return null;
  const outer = compact
    ? 'absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center'
    : 'absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center';
  const inner = compact
    ? 'min-h-[14px] min-w-[14px] px-0.5 text-[9px]'
    : 'min-h-4 min-w-[16px] px-1 text-[10px]';
  return (
    <span className={outer}>
      {href === '/invitations' && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" aria-hidden />
      )}
      <span
        className={`relative z-[1] inline-flex items-center justify-center rounded-full bg-red-600 font-bold text-white ${inner}`}
      >
        {formatNavBadgeCount(count)}
      </span>
    </span>
  );
}

export type HeaderShell = 'phone' | 'full';

export function Header({ shell = 'phone' }: { shell?: HeaderShell }) {
  // ... état, loadUnreadCounts, navItems, JSX complet — voir lignes 146–844 du fichier source
}
```

> **Note extraction :** le bloc JSX de rendu (L.388–843) inclut les trois points d'injection badge (`Bell`, `Mail`, `MessageCircle`) via `<NavUnreadBadge href={item.href} count={item.badge} />` dans des wrappers `<div className="relative">`. Le fichier source complet est disponible à `components/Header.tsx` (845 lignes, commit `13fae05`).

**Sections critiques pour injection badge (résumé structuré) :**

### Composant badge existant — `NavUnreadBadge`

```tsx
function NavUnreadBadge({
  href,
  count,
  compact,
}: {
  href: string;
  count: number;
  compact?: boolean;
}) {
  if (count <= 0) return null;
  const outer = compact
    ? 'absolute -top-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center'
    : 'absolute -top-1.5 -right-1.5 flex h-4 min-w-[16px] items-center justify-center';
  const inner = compact
    ? 'min-h-[14px] min-w-[14px] px-0.5 text-[9px]'
    : 'min-h-4 min-w-[16px] px-1 text-[10px]';
  return (
    <span className={outer}>
      {href === '/invitations' && (
        <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-75" aria-hidden />
      )}
      <span
        className={`relative z-[1] inline-flex items-center justify-center rounded-full bg-red-600 font-bold text-white ${inner}`}
      >
        {formatNavBadgeCount(count)}
      </span>
    </span>
  );
}
```

**Note :** `/invitations` a déjà un effet **ping** rouge — base visuelle proche d'un « Pulse & Glow ».

### Items nav avec badges

```tsx
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

### Rendu icône + badge (desktop nav)

```tsx
                      <div className="relative">
                        <Icon className={`w-[18px] h-[18px] ...`} />
                        <NavUnreadBadge href={item.href} count={item.badge} />
                      </div>
```

### Messages — drawer au lieu de Link

```tsx
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
                          <NavUnreadBadge href={item.href} count={item.badge} />
                        </div>
                        ...
                      </button>
                    );
                  }
```

### Mobile hamburger menu — badges compacts

```tsx
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          <NavUnreadBadge href={item.href} count={item.badge} compact />
                        </div>
```

**Icônes cibles Pulse & Glow :**

| Icône | Lucide | Route / action | State |
|-------|--------|----------------|-------|
| Cloche | `Bell` | `/notifications` | `unreadNotifications` |
| Convocations | `Mail` | `/invitations` | `pendingInvitations` |
| Messages | `MessageCircle` | `openDrawer()` | `unreadMessages` |
| Profil | `User` | dropdown / `/profile` | **pas de badge** |

---

# 3. Extraction — État des notifications (State Management)

## 3.1 Pas de contexte global dédié

Recherche : **aucun** `NotificationContext`, **aucun** `useNotifications` hook global.

La logique est **localisée** dans :
- `Header.tsx` — badges nav (source de vérité hors arène)
- `TikTokStyleArena.tsx` — `unreadDMsCount` (partiel, arène)
- `components/MessagesUI.tsx` — `unread_count` par conversation
- `app/notifications/page.tsx` — `isNotificationUnread` pour la page liste

---

## 3.2 Calcul principal — `Header.loadUnreadCounts`

```typescript
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);

  const loadUnreadCounts = useCallback(async () => {
    if (!user) return;

    const [invRes, notifRpc, dmRpc, auraUnreadRes] = await Promise.all([
      supabase
        .from('beef_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .eq('status', 'sent'),
      supabase.rpc('count_unread_notifications'),
      supabase.rpc('count_unread_direct_messages'),
      supabase
        .from('aura_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('is_read.is.null,is_read.eq.false'),
    ]);

    setPendingInvitations(invRes.count ?? 0);

    let systemUnread = 0;
    if (notifRpc.error) {
      const fb = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('is_read.is.null,is_read.eq.false');
      systemUnread = fb.count ?? 0;
    } else {
      systemUnread = parseBadgeCount(notifRpc.data);
    }

    const auraRows = auraUnreadRes.error ? 0 : (auraUnreadRes.count ?? 0);
    setUnreadNotifications(systemUnread + auraRows);

    if (dmRpc.error) {
      const fb = await supabase
        .from('direct_messages')
        .select('id, conversations!inner(participant_1, participant_2)', { count: 'exact', head: true })
        .or('is_read.is.null,is_read.eq.false')
        .neq('sender_id', user.id)
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`, { referencedTable: 'conversations' });
      setUnreadMessages(fb.count ?? 0);
    } else {
      setUnreadMessages(parseBadgeCount(dmRpc.data));
    }
  }, [user]);
```

---

## 3.3 Rafraîchissement & Realtime — `Header.tsx`

```typescript
  useEffect(() => {
    void loadUnreadCounts();
  }, [loadUnreadCounts, pathname]);

  useEffect(() => {
    const onRefresh = () => {
      void loadUnreadCounts();
    };
    window.addEventListener('beefs:badges-refresh', onRefresh);
    return () => window.removeEventListener('beefs:badges-refresh', onRefresh);
  }, [loadUnreadCounts]);

  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUnreadCounts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, loadUnreadCounts]);

  // Realtime beef_invitations INSERT → toast + refresh
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`header_badges_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beef_invitations', filter: `invitee_id=eq.${user.id}` },
        () => {
          void headerCallbacksRef.current.loadUnreadCounts();
          headerCallbacksRef.current.toast('Nouvelle invitation reçue !', 'info');
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Realtime notifications * → debounced refresh + browser notification
  useEffect(() => {
    if (!user) return;
    let debounceTimer: ReturnType<typeof setTimeout>;
    const channel = supabase
      .channel('notifications_header')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(() => {
            void headerCallbacksRef.current.loadUnreadCounts();
          }, 500);
          // ... browser notification on INSERT ...
        }
      )
      .subscribe();
    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);
```

---

## 3.4 Bus d'événements inter-composants

```typescript
window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
```

**Émetteurs connus :** `app/notifications/page.tsx`, `app/invitations/page.tsx`, `components/MessagesUI.tsx`, `components/GlobalDuelAmbush.tsx`.

---

## 3.5 Helper non-lu — `lib/notification-unread.ts`

```typescript
/**
 * Non lu = même règle que `count_unread_notifications` en SQL :
 * `is_read IS DISTINCT FROM true` → en JS : seul `true` compte comme lu.
 */
export function isNotificationUnread(row: { is_read?: boolean | null }): boolean {
  return row.is_read !== true;
}
```

---

## 3.6 Toasts beef live (distinct des badges nav)

```tsx
      {user && !pathname?.startsWith('/admin') && (
        <BeefNotificationToasts userId={user.id} />
      )}
```

Alimenté par `useBeefNotifications` — notifications **éphémères** (toast overlay), pas compteur persistent.

---

# Verdict Architecte — Phase H.1 (Pulse & Glow)

## Cibles d'injection prioritaires

| Priorité | Surface | Élément DOM | Donnée count |
|----------|---------|-------------|--------------|
| P0 | Header | `Bell`, `Mail`, `MessageCircle` wrappers `relative` | `unreadNotifications`, `pendingInvitations`, `unreadMessages` |
| P0 | Arène Ref | `MediatorOrb` bouton `Sliders` | `handsRaised.length` (+ `refInvites.length` si unifié) |
| P1 | Arène menu mobile | `MessageCircle` drawer | `unreadDMsCount` (déjà calculé) |
| P2 | Header | Profil dropdown | optionnel |

## Recommandations architecture

1. **Extraire `NavUnreadBadge`** (ou successeur `PulseGlowBadge`) en composant partagé `@/components/shared/PulseGlowBadge.tsx` — remplacer le ping statique `/invitations` par animation unifiée.
2. **Créer un hook `useUnreadBadges()`** reprenant `loadUnreadCounts` du Header — consommable depuis `TikTokStyleArena` (arène sans Header).
3. **Unifier pending arène :** exposer `pendingDeckCount = handsRaised.length + refInvites.length` et brancher sur Command Deck + sidebar.
4. **Conserver `beefs:badges-refresh`** comme contrat de resync cross-surface.

---

*Fin du rapport — Phase H.0 — extraction seule, aucune modification applicative.*
