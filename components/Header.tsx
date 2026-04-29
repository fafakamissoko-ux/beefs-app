'use client';

import { useState, useEffect, useCallback } from 'react';
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

/** Connexion / inscription / auth : pas de recherche (même si une session JWT résiduelle rend `user` truthy). */
/** Réponse RPC count(*) (PostgREST peut renvoyer number | string). */
function parseBadgeCount(data: unknown): number {
  if (typeof data === 'number' && Number.isFinite(data)) return Math.max(0, Math.floor(data));
  if (typeof data === 'string') {
    const p = parseInt(data, 10);
    return Number.isFinite(p) ? Math.max(0, p) : 0;
  }
  return 0;
}

/** Nombre exact sur le badge (plus de « 9+ » trompeur pour 10–99). */
function formatNavBadgeCount(count: number): string {
  const n = Math.max(0, Math.floor(count));
  if (n > 999) return '999+';
  return String(n);
}

/** Raccourci clavier affiché dans la barre : ⌘K (Apple) ou Ctrl+K (Windows/Linux), rendu via <kbd> pour éviter les glyphes cassés. */
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
    pathname === '/onboarding' ||
    pathname === '/welcome'
  ) {
    return true;
  }
  if (pathname.startsWith('/auth/')) return true;
  return false;
}

/** Badge compteur nav (desktop + mobile menu) — plasma + ping pour les convocations. */
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
        <span className="absolute inset-0 animate-ping rounded-full bg-plasma-400 opacity-75" aria-hidden />
      )}
      <span
        className={`relative z-[1] inline-flex items-center justify-center rounded-full bg-plasma-500 font-bold text-white ${inner}`}
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
  const pathname = usePathname();
  const router = useRouter();
  const { user, userRole, signOut } = useAuth();
  const { toast } = useToast();
  const { openSearch } = useGlobalSearch();
  const showGlobalSearch = !hideGlobalSearchOnPath(pathname);

  useEffect(() => {
    setUserMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  /** Retire `?from=` de la barre d’adresse (info de navigation interne, pas la page courante). */
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

    // Toujours interroger la BDD (état réel). Badges nav alignés avec les pages correspondantes.
    const [invRes, notifRpc, dmRpc] = await Promise.all([
      supabase
        .from('beef_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .eq('status', 'sent'),
      supabase.rpc('count_unread_notifications'),
      supabase.rpc('count_unread_direct_messages'),
    ]);

    setPendingInvitations(invRes.count ?? 0);

    if (notifRpc.error) {
      const fb = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .or('is_read.is.null,is_read.eq.false');
      setUnreadNotifications(fb.count ?? 0);
    } else {
      setUnreadNotifications(parseBadgeCount(notifRpc.data));
    }

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

  /** Retour sur l’onglet / la fenêtre : resync des badges (lectures faites ailleurs, autre device, etc.) */
  useEffect(() => {
    if (!user) return;
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadUnreadCounts();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [user, loadUnreadCounts]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`header_badges_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beef_invitations', filter: `invitee_id=eq.${user.id}` },
        () => {
          void loadUnreadCounts();
          toast('Nouvelle invitation reçue !', 'info');
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as { type?: string; body?: string; title?: string };
          const prefs = getNotifPrefs();
          const typeMap: Record<string, string> = { message: 'messages', follow: 'follows', invite: 'invites', beef_live: 'beefs_live', gift: 'gifts' };
          const prefKey = typeMap[n.type || ''];
          if (prefKey && prefs[prefKey] === false) return;

          void loadUnreadCounts();
          showBrowserNotification(n.title || 'Beefs', n.body || '');
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          loadUnreadCounts();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, pathname, toast, loadUnreadCounts]);

  /** Liens masqués jusqu’à xl sur la barre horizontale (shell full) — évite le carambolage laptop. */
  const navSecondaryHrefs = new Set(['/notifications', '/live', '/points', '/invitations']);

  const navItems = [
    { href: '/feed', label: 'Fil d’actu', icon: Home, badge: 0 },
    {
      href: '/notifications',
      label: 'Notifications',
      icon: Bell,
      badge: unreadNotifications,
    },
    { href: '/live', label: 'Audiences', icon: Flame, badge: 0 },
    { href: '/points', label: 'Aura', icon: Coins, badge: 0 },
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
    { href: '/feed', label: 'Fil d’actu', icon: Home, badge: 0 },
    { href: '/live', label: 'Audiences', icon: Flame, badge: 0 },
    { href: '/rules', label: "Règles de l'Arène", icon: Shield, badge: 0 },
  ];
  const visibleNavItems = user ? navItems : publicNavItems;

  const isActive = (href: string) => {
    if (!pathname) return false;
    /** Sur les pages profil, aucun onglet principal (Fil d’actu, Messages, …) ne doit rester « actif ». */
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
            ? `z-[100] relative mx-auto flex w-full max-w-md shrink-0 flex-col rounded-none border-b border-white/10 bg-[#050505]/80 backdrop-blur-2xl lg:mx-0 lg:h-full lg:min-h-0 lg:max-w-none lg:w-64 lg:self-stretch lg:border-b-0 lg:border-r lg:border-white/[0.08] lg:backdrop-blur-2xl ${
                isActive('/feed')
                  ? 'border-none bg-gradient-to-b from-black/90 via-black/40 to-transparent backdrop-blur-md max-lg:from-black/90 max-lg:via-black/40 max-lg:to-transparent lg:bg-[#050505]/60'
                  : 'border-b border-white/[0.08] bg-black/80 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md lg:shadow-none lg:border-b-0 lg:bg-[#050505]/60'
              }`
            : 'fixed left-0 right-0 top-0 z-[100] border-b border-white/10 bg-[#050505]/80 backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
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
            {/* Logo — invités : accueil splash pour éviter préchargement /feed (RSC) sur login, onboarding, etc. */}
            <Link
              href={user ? '/feed' : '/'}
              className={`relative z-[5] flex shrink-0 items-center gap-2.5 group ${shell === 'phone' ? 'lg:mb-10 lg:w-full' : ''}`}
            >
              <BeefLogo size={32} className="transition-transform group-hover:scale-105 drop-shadow-[0_0_12px_rgba(162,0,255,0.55)]" />
              <span className="hidden sm:block text-xl font-extrabold text-white tracking-tighter drop-shadow-md">
                Beefs
              </span>
            </Link>

            {/* Desktop Nav — entrées complètes si connecté ; invités : liens publics d’exploration (évite barre vide). */}
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
                    Rechercher un dossier, un médiateur…
                  </span>
                  <SearchKeyboardShortcut visibleFrom={shell === 'phone' ? 'lg' : 'xl'} />
                </button>
              )}
              {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={hrefWithFrom(item.href, pathname)}
                      prefetch={false}
                      className={`relative flex items-center gap-2 border-l-[3px] border-transparent px-3.5 py-2 text-sm font-medium transition-all duration-200 ${
                        active
                          ? 'text-white max-lg:rounded-xl max-lg:border-l-transparent max-lg:bg-white/10 max-lg:text-plasma-400 lg:rounded-none lg:border-plasma-400 lg:bg-gradient-to-r lg:from-plasma-500/15 lg:to-transparent lg:text-white'
                          : 'text-gray-500 max-lg:rounded-xl max-lg:hover:bg-white/[0.04] max-lg:hover:text-gray-200 lg:rounded-none lg:text-gray-400 lg:hover:border-transparent lg:hover:bg-white/[0.04] lg:hover:text-white'
                      } ${shell === 'full' && navSecondaryHrefs.has(item.href) ? 'hidden xl:flex' : ''} ${
                        shell === 'phone' ? 'lg:w-full lg:justify-start lg:px-4' : ''
                      }`}
                    >
                      <div className="relative">
                        <Icon
                          className={`w-[18px] h-[18px] ${
                            active
                              ? 'max-lg:text-plasma-400 ' +
                                (item.href === '/live' || item.href === '/points' ? 'lg:text-plasma-400' : '')
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
                          style={{ background: 'linear-gradient(90deg, #00F0FF, #A200FF)' }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
            </nav>

            {/* Right — bas de sidebar (lg+) */}
            <div
              className={`relative z-[5] hidden shrink-0 ${
                shell === 'full' ? 'lg:flex lg:items-center gap-2 md:gap-4' : 'md:flex md:items-center gap-2 md:gap-4'
              } ${shell === 'phone' ? 'lg:mt-auto lg:w-full lg:flex-col lg:items-stretch lg:gap-4' : ''}`}
            >
              {user ? (
                <>
                  <Link
                    href="/create"
                    prefetch
                    className={`flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-plasma-500/30 bg-plasma-600 px-4 py-2 text-[11px] font-semibold uppercase tracking-widest text-white shadow-glow-plasma transition-all hover:bg-plasma-500 hover:shadow-glow-plasma active:scale-[0.97] ${
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
                              { href: '/buy-points', icon: Flame, label: 'Acquérir de l\'Aura' },
                              { href: '/invitations', icon: Mail, label: 'Convocations' },
                              { href: '/settings', icon: SettingsIcon, label: 'Paramètres' },
                              ...(userRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
                            ].map(item =>
                              item.href === '/buy-points' ? (
                                <a
                                  key={item.href}
                                  href="/buy-points"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setUserMenuOpen(false)}
                                  className={buyPointsAnchorClass}
                                >
                                  <item.icon className="w-4 h-4 text-gray-500" />
                                  <span>{item.label}</span>
                                </a>
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
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-plasma-400 transition-colors hover:bg-plasma-500/[0.08]"
                            >
                              <LogOut className="w-4 h-4" />
                              <span>Déconnexion</span>
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </>
              ) : (
                <div className={`flex items-center gap-2 ${shell === 'phone' ? 'lg:w-full lg:flex-col lg:gap-3' : ''}`}>
                  <Link
                    href="/login"
                    className={`btn-ghost min-h-[44px] px-4 text-sm font-medium text-gray-400 hover:text-white ${
                      shell === 'phone' ? 'lg:w-full lg:justify-center' : ''
                    }`}
                  >
                    Connexion
                  </Link>
                  <Link
                    href="/signup"
                    className={`inline-flex min-h-[44px] items-center justify-center rounded-[2px] bg-plasma-600 px-5 py-2 text-sm font-semibold text-white shadow-glow-plasma transition-all hover:shadow-glow-plasma active:scale-[0.97] ${
                      shell === 'phone' ? 'lg:w-full' : ''
                    }`}
                  >
                    Entrer dans l&apos;Arène
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile — boutons d'action épurés */}
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
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-plasma-500/40 bg-plasma-600 text-white shadow-glow-plasma backdrop-blur-md transition-colors hover:bg-plasma-500"
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
              className="lg:hidden border-b border-white/[0.06] bg-black/80 backdrop-blur-2xl overflow-y-auto max-h-[calc(100dvh-3.5rem)] shadow-2xl"
            >
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 top-14 bg-black/60 backdrop-blur-sm z-[-1]"
                onClick={() => setMobileMenuOpen(false)}
              />
              <nav className="px-3 py-3 space-y-0.5">
                {visibleNavItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                      <Link
                        key={item.href}
                        href={hrefWithFrom(item.href, pathname)}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 text-sm font-medium transition-all ${
                          active
                            ? 'max-lg:rounded-xl max-lg:bg-white/10 text-plasma-400'
                            : 'text-gray-400 hover:text-white hover:bg-white/[0.04] max-lg:rounded-xl'
                        }`}
                      >
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          <NavUnreadBadge href={item.href} count={item.badge} compact />
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="rounded-full bg-plasma-500/10 px-2 py-0.5 text-[10px] font-bold text-plasma-400">
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
                      <a
                        href="/buy-points"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-colors"
                      >
                        <Flame className="w-5 h-5 text-gray-500" />
                        <span>Acquérir de l&apos;Aura</span>
                      </a>
                      {[
                        { href: '/profile', icon: User, label: 'Profil' },
                        { href: '/settings', icon: SettingsIcon, label: 'Paramètres' },
                        ...(userRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
                      ].map(item => (
                        <Link key={item.href} href={hrefWithFrom(item.href, pathname)} onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-3 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] rounded-xl transition-colors">
                          <item.icon className="w-5 h-5 text-gray-500" />
                          <span>{item.label}</span>
                        </Link>
                      ))}
                      <button onClick={() => { signOut(); setMobileMenuOpen(false); }}
                        className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-plasma-400 transition-colors hover:bg-plasma-500/[0.08]">
                        <LogOut className="w-5 h-5" />
                        <span>Déconnexion</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col gap-2 px-2 sm:flex-row">
                      <Link
                        href="/login"
                        onClick={() => setMobileMenuOpen(false)}
                        className="btn-ghost flex flex-1 items-center justify-center py-3 text-center text-sm font-medium text-gray-400 hover:text-white"
                      >
                        Connexion
                      </Link>
                      <Link
                        href="/signup"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex flex-1 items-center justify-center rounded-[2px] bg-plasma-600 py-3 text-center text-sm font-semibold text-white shadow-glow-plasma transition-all hover:shadow-glow-plasma active:scale-[0.97]"
                      >
                        Entrer dans l&apos;Arène
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
