'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X, Home, Flame, Bell, User, Settings as SettingsIcon, MessageCircle, LogOut, Mail, ChevronDown, Plus, Shield, Coins } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/components/Toast';
import { BeefLogo } from '@/components/BeefLogo';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
import { BeefNotificationToasts } from '@/components/BeefNotificationToasts';
import { supabase } from '@/lib/supabase/client';
import { hrefWithFrom } from '@/lib/navigation-return';

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

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [pendingInvitations, setPendingInvitations] = useState(0);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const { user, userRole, signOut } = useAuth();
  const { toast } = useToast();

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

    const [invRes, notifRes, dmRes] = await Promise.all([
      supabase
        .from('beef_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('invitee_id', user.id)
        .in('status', ['sent', 'seen']),
      supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('is_read', false),
      supabase
        .from('direct_messages')
        .select('id, conversations!inner(participant_1, participant_2)', { count: 'exact', head: true })
        .eq('is_read', false)
        .neq('sender_id', user.id)
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`, { referencedTable: 'conversations' }),
    ]);

    setPendingInvitations(invRes.count || 0);
    setUnreadNotifications(notifRes.count || 0);
    setUnreadMessages(dmRes.count || 0);
  }, [user]);

  useEffect(() => {
    loadUnreadCounts();

    if (pathname === '/invitations') setPendingInvitations(0);
    if (pathname === '/notifications') setUnreadNotifications(0);
    if (pathname === '/messages') setUnreadMessages(0);
  }, [loadUnreadCounts, pathname]);

  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`header_badges_${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'beef_invitations', filter: `invitee_id=eq.${user.id}` },
        () => {
          setPendingInvitations(prev => prev + 1);
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

          if (pathname !== '/notifications') {
            setUnreadNotifications(prev => prev + 1);
          }
          if (n.type === 'message' && pathname !== '/messages') {
            setUnreadMessages(prev => prev + 1);
          }
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

  const navItems = [
    { href: '/feed', label: 'Accueil', icon: Home, badge: 0 },
    { href: '/notifications', label: 'Notifications', icon: Bell, badge: unreadNotifications },
    { href: '/live', label: 'Live', icon: Flame, badge: 0 },
    { href: '/points', label: 'Points', icon: Coins, badge: 0 },
    { href: '/invitations', label: 'Invitations', icon: Mail, badge: pendingInvitations },
    { href: '/messages', label: 'Messages', icon: MessageCircle, badge: unreadMessages },
  ];

  const isActive = (href: string) => {
    if (!pathname) return false;
    /** Sur les pages profil, aucun onglet principal (Accueil, Messages, …) ne doit rester « actif ». */
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
      <header className="fixed top-0 left-0 right-0 z-[100] bg-black/80 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            {/* Logo — invités : accueil splash pour éviter préchargement /feed (RSC) sur login, onboarding, etc. */}
            <Link href={user ? '/feed' : '/'} className="flex items-center gap-2.5 group flex-shrink-0">
              <BeefLogo size={32} className="transition-transform group-hover:scale-105" />
              <span className="hidden sm:block text-xl font-extrabold text-gradient tracking-tight">
                Beefs
              </span>
            </Link>

            {/* Desktop Nav — liens app uniquement si connecté (sinon préfetch RSC ×6 → échecs Brave / Safari / réseau) */}
            <nav className="hidden md:flex items-center gap-1">
              <GlobalSearchBar />
              {user &&
                navItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActive(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={hrefWithFrom(item.href, pathname)}
                      prefetch={false}
                      className={`relative flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium transition-all duration-200 ${
                        active
                          ? 'text-white bg-white/[0.08]'
                          : 'text-gray-500 hover:text-gray-200 hover:bg-white/[0.04]'
                      }`}
                    >
                      <div className="relative">
                        <Icon className={`w-[18px] h-[18px] ${active && (item.href === '/live' || item.href === '/points') ? 'text-brand-400' : ''}`} />
                        {item.badge > 0 && (
                          <span className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 flex items-center justify-center px-1 text-[10px] font-bold text-white rounded-full bg-red-500">
                            {item.badge > 9 ? '9+' : item.badge}
                          </span>
                        )}
                      </div>
                      <span>{item.label}</span>
                      {active && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute -bottom-[13px] left-3 right-3 h-[2px] rounded-full"
                          style={{ background: 'linear-gradient(90deg, #FF6B2C, #E83A14)' }}
                          transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                        />
                      )}
                    </Link>
                  );
                })}
            </nav>

            {/* Right */}
            <div className="hidden md:flex items-center gap-2">
              {user ? (
                <>
                  <Link
                    href="/create"
                    prefetch
                    className="flex items-center gap-1.5 px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all active:scale-[0.97] shadow-sm hover:shadow-glow brand-gradient"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Créer</span>
                  </Link>

                  <div className="relative" data-user-menu>
                    <button
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.06] rounded-xl transition-all"
                    >
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs ring-2 ring-white/10 brand-gradient">
                        {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                      </div>
                      <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`} />
                    </button>

                    <AnimatePresence>
                      {userMenuOpen && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.97 }}
                          transition={{ duration: 0.15 }}
                          className="absolute right-0 mt-2 w-60 rounded-2xl shadow-modal overflow-hidden dropdown-menu"
                        >
                          <div className="px-4 py-3 dropdown-divider-bottom">
                            <p className="text-sm font-semibold text-white">{user.user_metadata?.username || 'Utilisateur'}</p>
                            <p className="text-xs text-gray-500 truncate">{user.email}</p>
                          </div>
                          <div className="py-1">
                            {[
                              { href: '/profile', icon: User, label: 'Profil' },
                              { href: '/buy-points', icon: Flame, label: 'Acheter des points' },
                              { href: '/invitations', icon: Mail, label: 'Invitations' },
                              { href: '/settings', icon: SettingsIcon, label: 'Paramètres' },
                              ...(userRole === 'admin' ? [{ href: '/admin', icon: Shield, label: 'Admin' }] : []),
                            ].map(item => (
                              <Link
                                key={item.href}
                                href={hrefWithFrom(item.href, pathname)}
                                onClick={() => setUserMenuOpen(false)}
                                className="flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-white/[0.04] transition-colors"
                              >
                                <item.icon className="w-4 h-4 text-gray-500" />
                                <span>{item.label}</span>
                              </Link>
                            ))}
                          </div>
                          <div className="py-1 dropdown-divider-top">
                            <button
                              onClick={async () => { await signOut(); setUserMenuOpen(false); }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-400 hover:bg-red-500/[0.08] transition-colors"
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
                <div className="flex items-center gap-2">
                  <Link href="/login" className="px-4 py-2 text-sm font-medium text-gray-300 hover:text-white transition-colors">
                    Connexion
                  </Link>
                  <Link href="/signup" className="px-4 py-2 text-white text-sm font-semibold rounded-xl transition-all active:scale-[0.97] brand-gradient">
                    S'inscrire
                  </Link>
                </div>
              )}
            </div>

            {/* Mobile */}
            <div className="flex md:hidden items-center gap-1.5">
              <GlobalSearchBar />
              {user && (
                <Link href={hrefWithFrom('/create', pathname)} prefetch className="p-2 text-brand-400">
                  <Plus className="w-5 h-5" />
                </Link>
              )}
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="p-2 text-gray-400 hover:text-white transition-colors">
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
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
              className="md:hidden border-t border-white/[0.06] dropdown-menu"
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
                {user &&
                  navItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={hrefWithFrom(item.href, pathname)}
                        prefetch={false}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${
                          active ? 'bg-brand-500/10 text-brand-400' : 'text-gray-400 hover:text-white hover:bg-white/[0.04]'
                        }`}
                      >
                        <div className="relative">
                          <Icon className="w-5 h-5" />
                          {item.badge > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center px-0.5 text-[9px] font-bold text-white rounded-full bg-red-500">
                              {item.badge > 9 ? '9+' : item.badge}
                            </span>
                          )}
                        </div>
                        <span className="flex-1">{item.label}</span>
                        {item.badge > 0 && (
                          <span className="text-[10px] font-bold text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
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
                        <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm ring-2 ring-white/10 brand-gradient">
                          {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{user.user_metadata?.username || 'Utilisateur'}</p>
                          <p className="text-xs text-gray-500 truncate">{user.email}</p>
                        </div>
                      </div>
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
                        className="w-full flex items-center gap-3 px-4 py-3 text-sm text-red-400 hover:bg-red-500/[0.08] rounded-xl transition-colors">
                        <LogOut className="w-5 h-5" />
                        <span>Déconnexion</span>
                      </button>
                    </>
                  ) : (
                    <div className="flex gap-2 px-2">
                      <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 text-center py-3 text-sm font-medium text-gray-300 hover:text-white bg-white/[0.04] rounded-xl transition-colors">
                        Connexion
                      </Link>
                      <Link href="/signup" onClick={() => setMobileMenuOpen(false)}
                        className="flex-1 text-center py-3 text-sm font-semibold text-white rounded-xl transition-colors brand-gradient">
                        S'inscrire
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
