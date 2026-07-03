# Audit source — Header & menu utilisateur (dropdown maison)

> **Mission :** extraction à zéro modification pour préparer la migration vers `@radix-ui/react-dropdown-menu`.  
> **Date :** 2026-05-31  
> **Fichier source :** `components/Header.tsx` (849 lignes)

---

## 1. Synthèse architecturale

| Élément | Détail |
|---------|--------|
| **Fichier** | `components/Header.tsx` — composant client `'use client'` |
| **État menu utilisateur** | `userMenuOpen` (`useState<boolean>`, L146) |
| **État menu mobile** | `mobileMenuOpen` — **séparé**, hors scope Radix dropdown desktop |
| **Click outside global** | `useEffect` L189–196 — `document.addEventListener('click', …)` |
| **Ancre DOM** | Attribut `data-user-menu` sur le conteneur (L588) |
| **Rendu dropdown** | `AnimatePresence` + `motion.div` conditionnel `{userMenuOpen && …}` (L606–664) |
| **Fermeture explicite** | `setUserMenuOpen(false)` sur navigation, buy-points, signOut |
| **Reset route** | `useEffect` L174–177 — ferme `userMenuOpen` + `mobileMenuOpen` au changement de `pathname` |

---

## 2. Gestion de `userMenuOpen` — cartographie

### 2.1 Déclaration

```typescript
const [userMenuOpen, setUserMenuOpen] = useState(false);
```

### 2.2 Ouverture / toggle

| Ligne | Action |
|-------|--------|
| L590 | `onClick={() => setUserMenuOpen(!userMenuOpen)}` sur le bouton trigger |
| L603 | `ChevronDown` rotation CSS : `${userMenuOpen ? 'rotate-180' : ''}` |

### 2.3 Fermeture automatique

| Mécanisme | Lignes | Détail |
|-----------|--------|--------|
| **Click outside (document)** | L189–196 | Si clic hors `[data-user-menu]` → `setUserMenuOpen(false)` |
| **Changement de route** | L174–177 | `useEffect([pathname])` → `setUserMenuOpen(false)` |

### 2.4 Fermeture explicite (call sites internes)

| Ligne | Contexte |
|-------|----------|
| L632 | Bouton « Acquérir de l'Aura » (`openBuyPointsPage`) |
| L644 | Liens menu (`Profil`, `Convocations`, `Paramètres`, `Admin`) |
| L655 | Bouton « Déconnexion » (`signOut`) |

### 2.5 Rendu conditionnel du panneau

```tsx
<div className="relative shrink-0" data-user-menu>
  <button onClick={() => setUserMenuOpen(!userMenuOpen)} … />
  <AnimatePresence>
    {userMenuOpen && (
      <motion.div … className="absolute right-0 mt-2 w-60 … lg:bottom-full lg:mb-2">
        {/* header profil + liens + déconnexion */}
      </motion.div>
    )}
  </AnimatePresence>
</div>
```

**Positionnement :** dropdown ancré sous le trigger (`mt-2`), inversé en sidebar desktop (`lg:bottom-full lg:mb-2`).

---

## 3. Bloc « click outside » — cible de suppression Radix

### 3.1 Code exact (L189–196)

```typescript
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    const target = event.target as HTMLElement;
    if (userMenuOpen && !target.closest('[data-user-menu]')) setUserMenuOpen(false);
  };
  document.addEventListener('click', handleClickOutside);
  return () => document.removeEventListener('click', handleClickOutside);
}, [userMenuOpen]);
```

### 3.2 Analyse pour migration

| Aspect | Comportement actuel | Équivalent Radix |
|--------|---------------------|------------------|
| Événement | `click` sur `document` | Géré nativement par `DropdownMenu` (DismissableLayer) |
| Zone safe | `[data-user-menu]` via `closest()` | Trigger + Content dans le même `DropdownMenu.Root` |
| Dépendance état | Re-bind listener à chaque changement `userMenuOpen` | Supprimable entièrement |
| Risque régression | Listener global peut interagir avec autres overlays | Isolation Radix par portail + focus trap |

**Ordre de destruction recommandé :**
1. Remplacer le bloc L588–665 par `DropdownMenu.Root` / `Trigger` / `Content`.
2. Supprimer le `useEffect` L189–196.
3. Retirer l'attribut `data-user-menu`.
4. Remplacer `userMenuOpen` par `open`/`onOpenChange` Radix (ou laisser uncontrolled).
5. Conserver le reset L174–177 via `onOpenChange(false)` ou `key={pathname}` sur le Root.

### 3.3 Autres `document.addEventListener` dans Header (ne pas supprimer)

| Lignes | Événement | Rôle |
|--------|-----------|------|
| L272–273 | `window` `beefs:badges-refresh` | Refresh badges nav |
| L282–283 | `document` `visibilitychange` | Resync badges au retour onglet |

Ces listeners sont **indépendants** du dropdown utilisateur.

---

## 4. Menu mobile — hors scope Radix dropdown

Le menu hamburger (`mobileMenuOpen`, L717–844) utilise :
- toggle bouton L706–712 ;
- backdrop `onClick={() => setMobileMenuOpen(false)}` L728–734 ;
- fermeture sur chaque lien L751, L776, L810, etc.

**Pas de `document.addEventListener`** pour le mobile menu — migration Radix cible uniquement le dropdown desktop/sidebar utilisateur (L588–665).

---

## 5. Items du menu utilisateur (contenu à migrer tel quel)

| Entrée | Type | Action spéciale |
|--------|------|-----------------|
| Profil | `Link` → `/profile` | `hrefWithFrom` |
| Acquérir de l'Aura | `button` | `openBuyPointsPage(router, pathname)` |
| Convocations | `Link` → `/invitations` | — |
| Paramètres | `Link` → `/settings` | — |
| Admin | `Link` → `/admin` | condition `userRole === 'admin'` |
| Déconnexion | `button` | `signOut()` async |

**Classes CSS réutilisables :**
- Liens : `flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors`
- Buy points : `buyPointsAnchorClass` (L35–36)
- Déconnexion : `flex w-full items-center gap-3 px-4 py-2.5 text-sm text-cyan-400 …`

---

## 6. Dépendance Radix — vérification `package.json`

```json
"@radix-ui/react-dropdown-menu": "^2.1.18"
```

**Statut :** ✅ installé (présent dans `package.json` et `package-lock.json`).

**Non utilisé ailleurs dans le codebase** au moment de l'audit — première intégration prévue via `Header.tsx`.

---

## 7. Structure Radix cible (esquisse migration)

```tsx
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';

<DropdownMenu.Root open={userMenuOpen} onOpenChange={setUserMenuOpen}>
  <DropdownMenu.Trigger asChild>
    <button …>{/* avatar + username + ChevronDown */}</button>
  </DropdownMenu.Trigger>
  <DropdownMenu.Portal>
    <DropdownMenu.Content
      side={shell === 'phone' ? 'top' : 'bottom'}
      align="start"
      className="w-60 rounded-2xl border border-white/10 bg-black/80 …"
    >
      <DropdownMenu.Item … />
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>
```

**Points d'attention :**
- `side="top"` en sidebar desktop pour reproduire `lg:bottom-full lg:mb-2`.
- `DropdownMenu.Item` + `asChild` pour les `Link` Next.js.
- `onSelect={(e) => e.preventDefault()}` si navigation programmatique (`openBuyPointsPage`).
- Animations : remplacer `AnimatePresence`/`motion.div` par CSS ou data-state Radix.

---

## 8. Code source brut — `components/Header.tsx`

```tsx
'use client';

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

/** Connexion / inscription / auth : pas de recherche (mÃªme si une session JWT rÃ©siduelle rend `user` truthy). */
/** RÃ©ponse RPC count(*) (PostgREST peut renvoyer number | string). */
function parseBadgeCount(data: unknown): number {
  if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
  if (typeof data === 'string') {
    const p = parseInt(data, 10);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  }
  return 0;
}

/** Nombre exact sur le badge (plus de Â« 9+ Â» trompeur pour 10â€“99). */
function formatNavBadgeCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n > 999) return '999+';
  return String(n);
}

/** Raccourci clavier affichÃ© dans la barre : âŒ˜K (Apple) ou Ctrl+K (Windows/Linux), rendu via <kbd> pour Ã©viter les glyphes cassÃ©s. */
function SearchKeyboardShortcut({ visibleFrom = 'lg' }: { visibleFrom?: 'lg' | 'xl' }) {
  const [modKey, setModKey] = useState<'âŒ˜' | 'Ctrl'>('Ctrl');
  useEffect(() => {
    if (typeof navigator === 'undefined') return;
    const apple = /Mac|iPhone|iPad|iPod/.test(navigator.platform ?? '');
    setModKey(apple ? 'âŒ˜' : 'Ctrl');
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

/** Badge compteur nav â€” rouge vif (Radar) ; ping convocations en rouge. */
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [topUsers, setTopUsers] = useState<
    { id: string; username: string | null; display_name: string | null; avatar_url: string | null; lifetime_points: number }[]
  >([]);
  const pathname = usePathname();
  const router = useRouter();
  const { user, userRole, signOut } = useAuth();
  const { toast } = useToast();
  const { openSearch } = useGlobalSearch();
  const { openDrawer } = useMessagesDrawer();
  const showGlobalSearch = !hideGlobalSearchOnPath(pathname);

  useEffect(() => {
    async function fetchElite() {
      const { data } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url, lifetime_points')
        .not('username', 'is', null)
        .order('lifetime_points', { ascending: false })
        .limit(4);
      if (data) setTopUsers(data);
    }
    void fetchElite();
  }, []);

  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  /** Retire `?from=` de la barre dâ€™adresse (info de navigation interne, pas la page courante). */
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    const params = new URLSearchParams(window.location.search);
    if (!params.has('from')) return;
    params.delete('from');
    const q = params.toString();
    router.replace(`${pathname}${q ? `?${q}` : ''}${window.location.hash}`, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (userMenuOpen && !target.closest('[data-user-menu]')) setUserMenuOpen(false);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [userMenuOpen]);

  const loadUnreadCounts = useCallback(async () => {
    if (!user) return;

    // Toujours interroger la BDD (Ã©tat rÃ©el). Badges nav alignÃ©s avec les pages correspondantes.
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
    /** Radar : non lus table `notifications` + entrÃ©es vue `aura_notifications`. */
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

  /** Retour Stripe : toast succÃ¨s + nettoyage URL (?purchase=success). */
  useEffect(() => {
    if (typeof window === 'undefined' || !pathname) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('purchase') !== 'success') return;
    
    params.delete('purchase');
    const q = params.toString();
    const newUrl = `${pathname}${q ? `?${q}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', newUrl || '/');
    
    toast('Paiement validÃ© ! Lingots crÃ©ditÃ©s.', 'success');
    void loadUnreadCounts();
  }, [pathname, toast, loadUnreadCounts]);

  useEffect(() => {
    void loadUnreadCounts();
  }, [loadUnreadCounts, pathname]);

  useEffect(() => {
    const onRefresh = () => {
      void loadUnreadCounts();
    };
    if (typeof window === 'undefined') return;
    window.addEventListener('beefs:badges-refresh', onRefresh);
    return () => window.removeEventListener('beefs:badges-refresh', onRefresh);
  }, [loadUnreadCounts]);

  /** Retour sur lâ€™onglet / la fenÃªtre : resync des badges (lectures faites ailleurs, autre device, etc.) */
  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUnreadCounts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, loadUnreadCounts]);

  const headerCallbacksRef = useRef({ loadUnreadCounts, toast });
  useEffect(() => {
    headerCallbacksRef.current = { loadUnreadCounts, toast };
  }, [loadUnreadCounts, toast]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`header_badges_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beef_invitations', filter: `invitee_id=eq.${user.id}` },
        () => {
          void headerCallbacksRef.current.loadUnreadCounts();
          headerCallbacksRef.current.toast('Nouvelle invitation reÃ§ue !', 'info');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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

          if (payload.eventType === 'INSERT') {
            const n = payload.new as { type?: string; body?: string; title?: string };
            const prefs = getNotifPrefs();
            const typeMap: Record<string, string> = {
              message: 'messages',
              follow: 'follows',
              invite: 'invites',
              beef_live: 'beefs_live',
              gift: 'gifts',
              aura: 'aura',
            };
            const prefKey = typeMap[n.type || ''];
            if (prefKey && prefs[prefKey] === false) return;

            showBrowserNotification(n.title || 'Beefs', n.body || '');
          }
        }
      )
      .subscribe();

    return () => {
      clearTimeout(debounceTimer);
      supabase.removeChannel(channel);
    };
  }, [user]);

  /** Liens masquÃ©s jusquâ€™Ã  xl sur la barre horizontale (shell full) â€” Ã©vite le carambolage laptop. */
  const navSecondaryHrefs = new Set(['/notifications', '/points', '/invitations']);

  const navItems = [
    { href: '/feed', label: 'Fil dâ€™actu', icon: Home, badge: 0 },
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

  const publicNavItems = [
    { href: '/feed', label: 'Fil dâ€™actu', icon: Home, badge: 0 },
    { href: '/rules', label: "RÃ¨gles de l'Agora", icon: Shield, badge: 0 },
  ];
  const visibleNavItems = user ? navItems : publicNavItems;

  const isActive = (href: string) => {
    if (!pathname) return false;
    /** Sur les pages profil, aucun onglet principal (Fil dâ€™actu, Messages, â€¦) ne doit rester Â« actif Â». */
    if (pathname === '/profile' || pathname.startsWith('/profile/')) {
      return false;
    }
    if (href === '/feed') return pathname === '/feed' || pathname === '/';
    if (href === '/buy-points') return pathname === '/buy-points';
    return pathname.startsWith(href);
  };

  return (
    <>
      {user && !pathname?.startsWith('/admin') && (
        <BeefNotificationToasts userId={user.id} />
      )}
      <header
        className={
          shell === 'phone'
            ? `z-[100] relative mx-auto flex w-full max-w-md shrink-0 flex-col rounded-none border-b border-white/10 bg-transparent lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:w-64 lg:self-stretch lg:border-b-0 lg:border-r lg:border-white/10 ${
                isActive('/feed')
                  ? 'border-none bg-transparent'
                  : 'border-b border-white/10 bg-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] lg:shadow-none lg:border-b-0 lg:border-r lg:border-white/10'
              }`
            : 'fixed left-0 right-0 top-0 z-[100] border-b border-white/10 bg-transparent shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
        }
      >
        <div
          className={
            shell === 'phone'
              ? 'mx-auto flex h-auto min-h-0 w-full max-w-md flex-col lg:mx-0 lg:h-full lg:max-w-none'
              : 'mx-auto max-w-7xl px-4'
          }
        >
          <div
            className={
              shell === 'phone'
                ? 'flex h-14 min-w-0 items-center justify-between gap-2 px-4 lg:h-full lg:min-h-0 lg:w-full lg:flex-col lg:items-start lg:justify-start lg:gap-0 lg:px-6 lg:py-8'
                : 'flex h-14 min-w-0 items-center gap-2'
            }
          >
            {/* Logo â€” invitÃ©s : accueil splash pour Ã©viter prÃ©chargement /feed (RSC) sur login, onboarding, etc. */}
            <Link
              href={user ? '/feed' : '/'}
              className={`relative z-[5] flex shrink-0 items-center gap-2.5 group ${shell === 'phone' ? 'lg:mb-10 lg:w-full' : ''}`}
            >
              <BeefLogo size={32} className="transition-transform group-hover:scale-105 drop-shadow-[0_0_12px_rgba(255,255,255,0.4)]" />
              <span className="hidden sm:block text-xl font-extrabold text-white tracking-tighter drop-shadow-md">
                Beefs
              </span>
            </Link>

            {/* Desktop Nav â€” entrÃ©es complÃ¨tes si connectÃ© ; invitÃ©s : liens publics dâ€™exploration (Ã©vite barre vide). */}
            <nav
              className={`relative z-[5] hidden min-w-0 ${
                shell === 'full'
                  ? 'lg:flex lg:items-center lg:gap-1 lg:flex-1'
                  : 'md:flex md:items-center md:gap-1 md:flex-1'
              } ${
                shell === 'phone'
                  ? 'lg:mt-0 lg:w-full lg:flex-col lg:items-stretch lg:gap-2 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:min-h-0'
                  : ''
              }`}
            >
              {showGlobalSearch && (
                <button
                  type="button"
                  aria-label="Ouvrir la recherche"
                  onClick={() => openSearch()}
                  className={`glass-prestige hidden min-h-[44px] items-center gap-3 rounded-[2px] px-4 py-2 text-left transition hover:bg-white/[0.06] shrink lg:flex ${
                    shell === 'phone'
                      ? 'w-full max-w-xs lg:mr-0 lg:max-w-none lg:w-full'
                      : 'w-[100px] md:w-[150px] xl:w-[250px]'
                  }`}
                >
                  <Search className="h-4 w-4 shrink-0 text-gray-500" strokeWidth={1.75} aria-hidden />
                  <span
                    className={`min-w-0 truncate text-sm text-gray-400 md:hidden lg:min-w-0 lg:flex-1 ${
                      shell === 'phone' ? 'lg:inline' : 'xl:inline'
                    }`}
                  >
                    Rechercher un dossier, un mÃ©diateurâ€¦
                  </span>
                  <SearchKeyboardShortcut visibleFrom={shell === 'phone' ? 'lg' : 'xl'} />
                </button>
              )}
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
                          <NavUnreadBadge href={item.href} count={item.badge} />
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
                        <NavUnreadBadge href={item.href} count={item.badge} />
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
            </nav>

            {/* L'Ã‰lite de l'Agora (Desktop Sidebar) */}
            <div className={`hidden shrink-0 ${shell === 'full' ? 'lg:hidden' : 'lg:flex lg:flex-col lg:gap-4 lg:px-6 lg:mt-4 lg:mb-8'}`}>
              <div className="mb-1 flex items-center gap-2">
                <Flame className="h-4 w-4 text-cyan-500" />
                <h3 className="text-[10px] font-black uppercase tracking-widest text-gray-500">L&apos;Ã‰lite de l&apos;Agora</h3>
              </div>
              <div className="flex flex-col gap-3.5">
                {topUsers.map((u, i) => {
                  const eliteRank = getAuraRank(u.lifetime_points || 0);
                  return (
                  <Link key={u.id} href={`/profile/${u.username}`} className="group flex items-center gap-3">
                    <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-xs font-bold text-white transition-colors group-hover:border-cyan-500/50">
                      {u.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={u.avatar_url} alt={u.username ?? ''} className="h-full w-full rounded-full object-cover" />
                      ) : (
                        u.username?.[0]?.toUpperCase()
                      )}
                      {i === 0 && <span className="absolute -right-2 -top-2 text-[12px] drop-shadow-md">ðŸ‘‘</span>}
                    </div>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-xs font-bold text-gray-300 transition-colors group-hover:text-cyan-400">{u.display_name || u.username}</span>
                      <span className={`text-[9px] font-medium uppercase tracking-wider ${eliteRank.colorClass}`}>
                        {eliteRank.title}
                      </span>
                    </div>
                  </Link>
                  );
                })}
              </div>
            </div>

            {/* Right â€” bas de sidebar (lg+) */}
            <div
              className={`relative z-[5] hidden shrink-0 ${
                shell === 'full' ? 'lg:flex lg:items-center gap-2 md:gap-4' : 'md:flex md:items-center gap-2 md:gap-4'
              } ${shell === 'phone' ? 'lg:mt-auto lg:w-full lg:flex-col lg:items-stretch lg:gap-4' : ''}`}
            >
              {user ? (
                <>
                  <Link
                    href={hrefWithFrom('/create', pathname)}
                    prefetch
                    className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-red-800/70 bg-gradient-to-r from-red-700 to-red-900 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white shadow-[0_0_20px_rgba(185,28,28,0.35)] transition-all hover:from-red-600 hover:to-red-800 active:scale-[0.97] ${
                      shell === 'phone' ? 'lg:w-full lg:justify-center' : ''
                    }`}
                  >
                    <Swords className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="md:hidden lg:inline">Call Out</span>
                  </Link>

                  <div className="relative shrink-0" data-user-menu>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className={`flex shrink-0 items-center gap-3 px-2.5 py-1.5 hover:bg-white/[0.06] rounded-xl transition-all ${
                        shell === 'phone' ? 'lg:w-full lg:justify-between' : ''
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-xs font-bold text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                          {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <span className="hidden lg:block truncate font-sans text-sm font-bold text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">
                          {user.user_metadata?.username || 'Challenger'}
                        </span>
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {userMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-60 rounded-2xl border border-white/10 bg-black/80 shadow-card backdrop-blur-2xl overflow-hidden lg:top-auto lg:bottom-full lg:mb-2 lg:mt-0 lg:left-0 lg:right-auto"
                        >
                          <div className="px-4 py-3 dropdown-divider-bottom">
                            <p className="text-sm font-semibold text-white">{user.user_metadata?.username || 'Utilisateur'}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                          </div>
                          <div className="py-1">
                            {[
                              { href: '/profile', icon: User, label: 'Profil' },
                              { href: '/buy-points', icon: Flame, label: 'AcquÃ©rir de l\'Aura' },
                              { href: '/invitations', icon: Mail, label: 'Convocations' },
                              { href: '/settings', icon: SettingsIcon, label: 'ParamÃ¨tres' },
                              ...(userRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
                            ].map(item =>
                              item.href === '/buy-points' ? (
                                <button
                                  key={item.href}
                                  type="button"
                                  onClick={() => {
                                    setUserMenuOpen(false);
                                    openBuyPointsPage(router, pathname);
                                  }}
                                  className={buyPointsAnchorClass}
                                >
                                  <item.icon className="w-4 h-4 text-gray-500" />
                                  <span>{item.label}</span>
                                </button>
                              ) : (
                                <Link
                                  key={item.href}
                                  href={hrefWithFrom(item.href, pathname)}
                                  onClick={() => setUserMenuOpen(false)}
                                  className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                                >
                                  <item.icon className="w-4 h-4 text-gray-500" />
                                  <span>{item.label}</span>
                                </Link>
                              ),
                            )}
                          </div>
                          <div className="py-1 dropdown-divider-top">
                            <button
                              onClick={async () => { await signOut(); setUserMenuOpen(false); }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/[0.08]"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>DÃ©connexion</span>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <div className={`flex items-center gap-2 ${shell === 'phone' ? 'lg:w-full lg:flex-col lg:gap-3' : ''}`}>
                  <div className="flex flex-col w-full gap-3">
                    <Link
                      href="/signup"
                      className="inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-white px-5 py-2 text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:bg-gray-200 hover:scale-105 active:scale-95"
                    >
                      Rejoindre l&apos;Agora
                    </Link>
                    <Link
                      href="/login"
                      className="text-center text-[11px] font-medium text-gray-400 hover:text-white underline-offset-2 hover:underline"
                    >
                      DÃ©jÃ  membre ? Se connecter
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile â€” boutons d'action Ã©purÃ©s */}
            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 lg:hidden pointer-events-auto">
              {showGlobalSearch && (
                <button
                  type="button"
                  onClick={() => openSearch()}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors border border-white/10 hover:bg-white/20"
                >
                  <Search className="h-4 w-4" strokeWidth={2} />
                </button>
              )}
              {user && (
                <Link
                  href={hrefWithFrom('/create', pathname)}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-red-800/65 bg-gradient-to-br from-red-700 to-red-900 text-white shadow-[0_0_16px_rgba(185,28,28,0.45)] backdrop-blur-md transition-all hover:from-red-600 hover:to-red-800"
                >
                  <Swords className="h-4 w-4" strokeWidth={2} />
                </Link>
              )}
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-md transition-colors border border-white/10 hover:bg-white/20"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" strokeWidth={2} /> : <Menu className="w-5 h-5" strokeWidth={2} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden border-b border-white/10 bg-transparent overflow-y-auto max-h-[calc(100dvh-3.5rem)]"
            >
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 top-14 z-[-1]"
                onClick={() => setMobileMenuOpen(false)}
              />
              <nav className="px-3 py-3 space-y-0.5">
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
                          <NavUnreadBadge href={item.href} count={item.badge} compact />
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
                          <NavUnreadBadge href={item.href} count={item.badge} compact />
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

                <div className={`pt-3 space-y-0.5 ${user ? 'mt-3 border-t border-white/[0.06]' : ''}`}>
                  {user ? (
                    <>
                      <div className="flex items-center gap-3 px-4 py-3 mb-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/[0.03] text-sm font-bold text-white shadow-[0_0_10px_rgba(255,255,255,0.1)]">
                          {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{user.user_metadata?.username || 'Utilisateur'}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
                      {[
                        { href: '/profile', icon: User, label: 'Profil' },
                        { href: '/settings', icon: SettingsIcon, label: 'ParamÃ¨tres' },
                        ...(userRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
                      ].map(item => (
                        <Link key={item.href} href={hrefWithFrom(item.href, pathname)} onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-colors">
                          <item.icon className="w-5 h-5 text-gray-500" />
                          <span>{item.label}</span>
                        </Link>
                      ))}
                      <button onClick={() => { signOut(); setMobileMenuOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-cyan-400 transition-colors hover:bg-cyan-500/[0.08]">
                        <LogOut className="w-5 h-5" />
                        <span>DÃ©connexion</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-3 px-2">
                      <Link
                        href="/signup"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex w-full items-center justify-center rounded-xl bg-white py-3.5 text-center text-sm font-black uppercase tracking-widest text-black shadow-[0_0_20px_rgba(255,255,255,0.4)] transition-transform hover:bg-gray-200 hover:scale-[0.98] active:scale-95"
                      >
                        Rejoindre l&apos;Agora
                      </Link>
                      <Link
                        href="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="text-center text-[11px] font-medium text-gray-400 hover:text-white underline-offset-2 hover:underline"
                      >
                        DÃ©jÃ  membre ? Se connecter
                      </Link>
                    </div>
                  )}
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>
    </>
  );
}

```

---

## 9. Checklist Ordre de Frappe (Radix)

- [ ] Installer / confirmer `@radix-ui/react-dropdown-menu` ✅
- [ ] Remplacer L588–665 par `DropdownMenu.Root/Trigger/Content`
- [ ] **Supprimer** `useEffect` click outside L189–196
- [ ] **Retirer** attribut `data-user-menu`
- [ ] Migrer `userMenuOpen` → `open`/`onOpenChange` Radix
- [ ] Conserver reset au changement de route (L174–177)
- [ ] Reproduire position sidebar (`side="top"` en lg)
- [ ] Préserver styles Premium Glass sur `DropdownMenu.Content`
- [ ] Ne pas toucher au menu mobile (`mobileMenuOpen`)
- [ ] Test : ouverture, clic extérieur, Escape, navigation, signOut, buy-points

---

*Extraction terminée — aucune modification du code source applicatif.*