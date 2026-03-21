'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, Home, Flame, Bell, User, Settings as SettingsIcon, MessageCircle, LogOut, Mail, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext';
import { PointsDisplay } from '@/components/PointsDisplay';
import { BeefLogo } from '@/components/BeefLogo';
import { GlobalSearchBar } from '@/components/GlobalSearchBar';
import { BeefNotificationToasts } from '@/components/BeefNotificationToasts';
import { supabase } from '@/lib/supabase/client';

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [userPoints, setUserPoints] = useState(0);
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  // Close dropdown when route changes
  useEffect(() => {
    setUserMenuOpen(false);
    setAuthMenuOpen(false);
    setMobileMenuOpen(false);
  }, [pathname]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      // Check if click is outside the user menu
      if (userMenuOpen && !target.closest('[data-user-menu]')) {
        setUserMenuOpen(false);
      }
      // Check if click is outside the auth menu
      if (authMenuOpen && !target.closest('[data-auth-menu]')) {
        setAuthMenuOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [userMenuOpen, authMenuOpen]);

  const navItems = [
    { href: '/feed', label: 'Accueil', icon: Home },
    { href: '/notifications', label: 'Notifications', icon: Bell },
    { href: '/live', label: 'Live', icon: Flame },
    { href: '/invitations', label: 'Invitations', icon: Mail },
    { href: '/messages', label: 'Messages', icon: MessageCircle },
  ];

  const isActive = (href: string) => {
    if (href === '/feed') return pathname === '/feed' || pathname === '/';
    return pathname.startsWith(href);
  };

  const handleSignOut = async () => {
    await signOut();
    setUserMenuOpen(false);
  };

  // Load user points
  useEffect(() => {
    if (!user) return;

    const loadUserPoints = async () => {
      const { data, error } = await supabase
        .from('users')
        .select('points')
        .eq('id', user.id)
        .single();

      if (data && !error) {
        setUserPoints(data.points || 0);
      }
    };

    loadUserPoints();

    // Subscribe to points updates
    const channel = supabase
      .channel('user_points')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new && 'points' in payload.new) {
            setUserPoints((payload.new as any).points || 0);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <>
    {user && <BeefNotificationToasts userId={user.id} />}
    <header className="fixed top-0 left-0 right-0 z-[100] bg-black/95 backdrop-blur-md border-b border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <BeefLogo size={40} className="transition-transform group-hover:scale-110" />
            <div className="hidden sm:block">
              <span className="text-2xl font-black bg-gradient-to-r from-red-500 via-orange-500 to-yellow-500 bg-clip-text text-transparent">
                Beefs
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-3">
            {/* Global Search */}
            <GlobalSearchBar />
            
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all ${
                    active
                      ? 'bg-gradient-to-r from-red-500 to-orange-500 text-black'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="hidden md:flex items-center gap-2">
            {/* Points display removed - visible in profile instead */}
            
            {user ? (
              <div className="relative" data-user-menu>
                <button
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                    {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                  </div>
                  <span className="text-white font-semibold text-sm">
                    {user.user_metadata?.username || 'Utilisateur'}
                  </span>
                  <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Dropdown Menu */}
                <AnimatePresence>
                  {userMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
                    >
                      <Link
                        href="/profile"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-white"
                      >
                        <User className="w-5 h-5 text-orange-500" />
                        <span>Mon profil</span>
                      </Link>
                      <Link
                        href="/invitations"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-white"
                      >
                        <Mail className="w-5 h-5 text-orange-500" />
                        <span>Mes invitations</span>
                      </Link>
                      <Link
                        href="/settings"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-white"
                      >
                        <SettingsIcon className="w-5 h-5 text-orange-500" />
                        <span>Paramètres</span>
                      </Link>
                      <div className="border-t border-gray-700"></div>
                      <button
                        onClick={handleSignOut}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 transition-colors text-red-400"
                      >
                        <LogOut className="w-5 h-5" />
                        <span>Déconnexion</span>
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="relative" data-auth-menu>
                <button
                  onClick={() => setAuthMenuOpen(!authMenuOpen)}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-red-500 to-orange-500 text-black rounded-lg font-semibold hover:opacity-90 transition-opacity"
                >
                  <User className="w-4 h-4" />
                  <span>Connexion</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${authMenuOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Auth Dropdown Menu */}
                <AnimatePresence>
                  {authMenuOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-2xl overflow-hidden"
                    >
                      <Link
                        href="/login"
                        onClick={() => setAuthMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-white"
                      >
                        <User className="w-5 h-5 text-orange-500" />
                        <span>Se connecter</span>
                      </Link>
                      <div className="border-t border-gray-700"></div>
                      <Link
                        href="/signup"
                        onClick={() => setAuthMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-white"
                      >
                        <User className="w-5 h-5 text-green-500" />
                        <span>S'inscrire</span>
                      </Link>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Mobile Menu Button + Search */}
          <div className="flex md:hidden items-center gap-2">
            <GlobalSearchBar />
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
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
            className="md:hidden border-t border-gray-800 bg-black"
          >
            <nav className="px-4 py-4 space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg font-semibold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-red-500 to-orange-500 text-black'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
              
              <div className="pt-4 border-t border-gray-800 space-y-2">
                {user ? (
                  <>
                    <div className="px-4 py-2 bg-white/5 rounded-lg">
                      <div className="flex items-center gap-2 text-white">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center text-white font-bold text-sm">
                          {user.user_metadata?.username?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">
                            {user.user_metadata?.username || 'Utilisateur'}
                          </p>
                          <p className="text-gray-400 text-xs">{user.email}</p>
                        </div>
                      </div>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <User className="w-5 h-5" />
                      <span>Mon profil</span>
                    </Link>
                    <Link
                      href="/settings"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-4 py-3 text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <SettingsIcon className="w-5 h-5" />
                      <span>Paramètres</span>
                    </Link>
                    <button 
                      onClick={() => {
                        signOut();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-5 h-5" />
                      <span>Déconnexion</span>
                    </button>
                  </>
                ) : (
                  <div className="space-y-2">
                    <Link 
                      href="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-red-500 to-orange-500 text-black rounded-lg font-semibold"
                    >
                      <User className="w-5 h-5" />
                      <span>Se connecter</span>
                    </Link>
                    <Link 
                      href="/signup"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white/10 text-white rounded-lg font-semibold hover:bg-white/20 transition-colors border border-white/20"
                    >
                      <User className="w-5 h-5" />
                      <span>S'inscrire</span>
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
