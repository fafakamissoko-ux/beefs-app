'use client';

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Search, MessageCircle, Plus, Check, CheckCheck, X, Trash2, Trash, CheckSquare, Square, MoreVertical, Swords } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';
import { AppBackButton } from '@/components/AppBackButton';
import { ProfileUserLink } from '@/components/ProfileUserLink';
import { PENDING_DM_WITH_STORAGE_KEY } from '@/lib/messages-deeplink';
import { useMessagesDrawer } from '@/contexts/MessagesDrawerContext';

interface MessagesUIProps {
  isDrawerMode?: boolean;
  onClose?: () => void;
}

interface Conversation {
  id: string;
  participant_1: string;
  participant_2: string;
  last_message_text: string | null;
  last_message_at: string | null;
  other_user: {
    id: string;
    username: string;
    display_name: string;
    avatar_url: string | null;
  };
  unread_count: number;
}

interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  created_at: string;
  is_read: boolean;
  reply_to_id?: string | null;
  reactions?: Record<string, string[]> | null;
  is_deleted?: boolean;
}

const DM_WITH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type UserSearchRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
};

const formatDateSeparator = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();

  if (d.toDateString() === now.toDateString()) return "Aujourd'hui";

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Hier';

  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 7) {
    return d.toLocaleDateString('fr-FR', { weekday: 'long' });
  }

  return d.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' as const } : {}),
  });
};

export function MessagesUI({ isDrawerMode = false, onClose }: MessagesUIProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { targetUserId, isDrawerOpen } = useMessagesDrawer();

  const isDrawerOpenRef = useRef(isDrawerOpen);
  useEffect(() => {
    isDrawerOpenRef.current = isDrawerOpen;
  }, [isDrawerOpen]);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<UserSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(0);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messageComposerRef = useRef<HTMLTextAreaElement>(null);
  const dmDeepLinkLockRef = useRef(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [showChatMenu, setShowChatMenu] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const dest = `/messages${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      router.push(`/login?redirect=${encodeURIComponent(dest)}`);
    }
  }, [user, authLoading, router, searchParams]);

  // Nettoyage immédiat des modales internes dès le début de la fermeture
  useEffect(() => {
    if (isDrawerMode && !isDrawerOpen) {
      setMessageMenu(null);
      setShowChatMenu(false);
      setReplyingTo(null);
      setIsSelectionMode(false);
    }
  }, [isDrawerOpen, isDrawerMode]);

  // Failsafe : nettoyage du body à chaque changement de route et au démontage
  useEffect(() => {
    const cleanupPointerEvents = () => {
      if (typeof document !== 'undefined') {
        document.body.style.pointerEvents = '';
        document.body.style.overflow = '';
        document.body.style.userSelect = '';
      }
    };
    cleanupPointerEvents();
    return cleanupPointerEvents;
  }, [pathname]);

  const loadConversations = useCallback(async (): Promise<Conversation[]> => {
    if (!user) return [];
    setLoadingConvs(true);
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!convs) {
        setConversations([]);
        return [];
      }

      const otherIds = convs.map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1);
      const { data: users } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url')
        .in('id', otherIds);
      const userMap = new Map((users || []).map(u => [u.id, u]));

      // Count unread messages per conversation
      const enriched: Conversation[] = await Promise.all(convs.map(async c => {
        const otherId = c.participant_1 === user.id ? c.participant_2 : c.participant_1;
        const otherUser = userMap.get(otherId) || { id: otherId, username: 'unknown', display_name: 'Utilisateur', avatar_url: null };

        const { count } = await supabase
          .from('direct_messages')
          .select('*', { count: 'exact', head: true })
          .eq('conversation_id', c.id)
          .neq('sender_id', user.id)
          .eq('is_read', false);

        return { ...c, other_user: otherUser, unread_count: count || 0 };
      }));

      setConversations(enriched);
      return enriched;
    } catch (err) {
      console.error('Error loading conversations:', err);
      return [];
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setConversations([]);
      setLoadingConvs(false);
      return;
    }
    void loadConversations();
  }, [user, authLoading, loadConversations]);

  const scrollToBottom = useCallback((instant = false) => {
    if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);

    scrollTimeoutRef.current = setTimeout(() => {
      const container = messagesEndRef.current?.parentElement;
      if (container && instant) {
        container.style.scrollBehavior = 'auto';
      }

      messagesEndRef.current?.scrollIntoView({
        behavior: instant ? 'auto' : 'smooth',
        block: 'end',
      });

      if (container && instant) {
        setTimeout(() => {
          container.style.scrollBehavior = '';
        }, 50);
      }
    }, 150);
  }, []);

  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) clearTimeout(scrollTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (selectedConv && messages.length > 0) {
      const isInitialLoad = prevMessagesLength.current === 0;
      scrollToBottom(isInitialLoad);
      prevMessagesLength.current = messages.length;
    } else {
      prevMessagesLength.current = 0;
    }
  }, [messages, selectedConv, scrollToBottom]);

  useEffect(() => {
    if (newMessage === '') {
      const el = messageComposerRef.current;
      if (el) el.style.height = 'auto';
    }
  }, [newMessage]);

  // Real-time messages & updates
  useEffect(() => {
    if (!selectedConv) return;

    const channel = supabase
      .channel(`dm_${selectedConv.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          const msg = payload.new as Message;
          if (msg.sender_id !== user?.id) {
            setMessages(prev => [...prev, msg]);
            supabase.from('direct_messages').update({ is_read: true }).eq('id', msg.id).then(() => {});
            supabase.from('notifications')
              .update({ is_read: true })
              .eq('user_id', user?.id || '')
              .eq('type', 'message')
              .or('is_read.is.null,is_read.eq.false')
              .filter('metadata->>conversation_id', 'eq', selectedConv.id)
              .then(() => {});
          }
        } else if (payload.eventType === 'UPDATE') {
          const msg = payload.new as Message;
          // On garde le message dans l'état pour afficher « Ce message a été supprimé »
          setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, user]);

  const loadMessages = useCallback(async (conv: Conversation) => {
    setReplyingTo(null);
    setMessageMenu(null);
    setShowChatMenu(false);
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
    setMessages([]);
    setSelectedConv(conv);
    prevMessagesLength.current = 0; // Scroll instantané au chargement des messages
    setLoadingMsgs(true);
    try {
      const { data } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true })
        .limit(100);

      setMessages(data || []);

      // Mark unread DMs as read
      if (data?.length) {
        await supabase
          .from('direct_messages')
          .update({ is_read: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user?.id || '')
          .eq('is_read', false);
      }

      // Mark related notifications as read
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', user?.id || '')
        .eq('type', 'message')
        .or('is_read.is.null,is_read.eq.false')
        .filter('metadata->>conversation_id', 'eq', conv.id);

      // Update local unread count for this conversation
      setConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
      );

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
      }
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMsgs(false);
    }
  }, [user?.id]);

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || !user) return;
    const clean = sanitizeMessage(newMessage);
    if (!clean) return;

    const pendingReplyTarget = replyingTo;
    const replyToId =
      pendingReplyTarget?.id && !pendingReplyTarget.id.startsWith('temp_')
        ? pendingReplyTarget.id
        : null;

    const tempMsg: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: selectedConv.id,
      sender_id: user.id,
      content: clean,
      created_at: new Date().toISOString(),
      is_read: false,
      reply_to_id: pendingReplyTarget?.id ?? null,
    };
    setMessages(prev => [...prev, tempMsg]);
    setReplyingTo(null);
    setNewMessage('');

    const { data, error } = await supabase.from('direct_messages').insert({
      conversation_id: selectedConv.id,
      sender_id: user.id,
      content: clean,
      reply_to_id: replyToId,
    }).select().single();

    // COUPE-CIRCUIT FRAMER MOTION
    // Si le tiroir se ferme pendant l'aller-retour serveur, on stoppe net les mises à jour
    // d'état pour éviter que React/Framer Motion ne gèle le composant en pleine destruction.
    if (isDrawerMode && !isDrawerOpenRef.current) return;

    if (error) {
      toast('Erreur lors de l\'envoi', 'error');
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id));
      return;
    }

    setMessages(prev => prev.map(m => m.id === tempMsg.id ? data : m));

    await supabase.from('conversations').update({
      last_message_text: clean,
      last_message_at: new Date().toISOString(),
    }).eq('id', selectedConv.id);
  };

  const toggleReaction = async (msg: Message, emoji: string) => {
    if (!user) return;
    const currentReactions = msg.reactions || {};
    const usersReacted = currentReactions[emoji] || [];
    const hasReacted = usersReacted.includes(user.id);

    const newUsers = hasReacted ? usersReacted.filter(id => id !== user.id) : [...usersReacted, user.id];

    const newReactions = { ...currentReactions, [emoji]: newUsers };
    if (newUsers.length === 0) delete newReactions[emoji];

    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, reactions: newReactions } : m));
    await supabase.from('direct_messages').update({ reactions: newReactions }).eq('id', msg.id);
  };

  const deleteMessage = async (msgId: string) => {
    setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m)));
    await supabase.from('direct_messages').update({ is_deleted: true }).eq('id', msgId);
    setMessageMenu(null);
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessages.size === 0) return;
    const idsToDelete = Array.from(selectedMessages);
    const serverIds = idsToDelete.filter((id) => !id.startsWith('temp_'));

    setMessages((prev) =>
      prev.map((m) => (selectedMessages.has(m.id) ? { ...m, is_deleted: true } : m))
    );
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
    setMessageMenu(null);

    if (serverIds.length === 0) return;

    const { error } = await supabase
      .from('direct_messages')
      .update({ is_deleted: true })
      .in('id', serverIds);

    if (error) {
      toast('Erreur lors de la suppression groupée', 'error');
      if (selectedConv) void loadMessages(selectedConv);
    }
  };

  const toggleMessageSelection = (msgId: string) => {
    setSelectedMessages((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  };

  const clearEntireConversation = async () => {
    if (!selectedConv) return;
    const convId = selectedConv.id;
    setMessages([]);
    setShowChatMenu(false);
    setMessageMenu(null);

    const { error } = await supabase.from('direct_messages').update({ is_deleted: true }).eq('conversation_id', convId);

    if (error) {
      toast('Impossible de vider la discussion', 'error');
      void loadMessages(selectedConv);
      return;
    }

    toast('Historique purgé', 'success');
    setConversations((prev) =>
      prev.map((c) =>
        c.id === convId ? { ...c, last_message_text: null, last_message_at: null } : c,
      ),
    );

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('beefs:badges-refresh'));
    }
  };

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('user_public_profile')
        .select('id, username, display_name, avatar_url')
        .or(`username.ilike.%${query}%,display_name.ilike.%${query}%`)
        .neq('id', user?.id || '')
        .limit(10);
      setSearchResults(data || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const startConversation = async (otherUser: UserSearchRow) => {
    if (!user) return;
    try {
      const { data: convId } = await supabase.rpc('get_or_create_conversation', {
        user_a: user.id,
        user_b: otherUser.id,
      });

      if (convId) {
        const cid = String(convId);
        const peer: Conversation['other_user'] = {
          id: otherUser.id,
          username: otherUser.username,
          display_name: otherUser.display_name || otherUser.username || 'Utilisateur',
          avatar_url: otherUser.avatar_url,
        };
        const conv: Conversation = {
          id: cid,
          participant_1: user.id < peer.id ? user.id : peer.id,
          participant_2: user.id < peer.id ? peer.id : user.id,
          last_message_text: null,
          last_message_at: null,
          other_user: peer,
          unread_count: 0,
        };
        setConversations(prev => {
          const exists = prev.find(c => c.id === cid);
          return exists ? prev : [conv, ...prev];
        });
        void loadMessages(conv);
        setShowNewConv(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (err) {
      toast('Erreur lors de la création de la conversation', 'error');
    }
  };

  const lastResolvedUserIdRef = useRef<string | null>(null);

  // On réinitialise la sécurité si le tiroir se ferme
  useEffect(() => {
    if (isDrawerMode && !isDrawerOpen) {
      lastResolvedUserIdRef.current = null;
    }
  }, [isDrawerOpen, isDrawerMode]);

  useEffect(() => {
    if (authLoading || !user || loadingConvs) return;
    if (dmDeepLinkLockRef.current) return;

    let raw = searchParams.get('with');

    if (isDrawerMode && targetUserId) {
      raw = targetUserId;
    } else if (!raw && typeof window !== 'undefined') {
      raw = sessionStorage.getItem(PENDING_DM_WITH_STORAGE_KEY);
      if (raw) sessionStorage.removeItem(PENDING_DM_WITH_STORAGE_KEY);
    }

    if (!raw) return;

    const withId = raw.trim();

    // COUPE-CIRCUIT ABSOLU DE LA BOUCLE INFINIE
    if (lastResolvedUserIdRef.current === withId) return;

    if (!DM_WITH_UUID_RE.test(withId) || withId === user.id) {
      if (!isDrawerMode) router.replace('/messages', { scroll: false });
      return;
    }

    dmDeepLinkLockRef.current = true;
    lastResolvedUserIdRef.current = withId;

    void (async () => {
      try {
        const { data: otherUser, error } = await supabase
          .from('user_public_profile')
          .select('id, username, display_name, avatar_url')
          .eq('id', withId)
          .maybeSingle();
        if (error || !otherUser) {
          toast('Utilisateur introuvable', 'error');
          return;
        }
        const peer: Conversation['other_user'] = {
          id: otherUser.id,
          username: otherUser.username,
          display_name: otherUser.display_name || otherUser.username || 'Utilisateur',
          avatar_url: otherUser.avatar_url,
        };
        const { data: convId, error: rpcErr } = await supabase.rpc('get_or_create_conversation', {
          user_a: user.id,
          user_b: peer.id,
        });
        if (rpcErr || !convId) {
          toast('Impossible d’ouvrir la conversation', 'error');
          return;
        }
        const cid = String(convId);
        const conv: Conversation = {
          id: cid,
          participant_1: user.id < peer.id ? user.id : peer.id,
          participant_2: user.id < peer.id ? peer.id : user.id,
          last_message_text: null,
          last_message_at: null,
          other_user: peer,
          unread_count: 0,
        };

        const list = await loadConversations();
        let open = list.find((c) => c.id === cid);
        if (!open) {
          setConversations((prev) => (prev.some((c) => c.id === cid) ? prev : [conv, ...prev]));
          open = conv;
        }
        await loadMessages(open);
      } catch {
        toast('Impossible d’ouvrir la conversation', 'error');
      } finally {
        dmDeepLinkLockRef.current = false;
        if (!isDrawerMode) router.replace('/messages', { scroll: false });
      }
    })();
  }, [authLoading, user, loadingConvs, searchParams, router, toast, loadMessages, loadConversations, targetUserId, isDrawerMode]);

  const activateRow = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'maintenant';
    if (diffMin < 60) return `${diffMin}min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}h`;
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className={`flex flex-1 overflow-hidden bg-transparent ${
      isDrawerMode
        ? 'h-full w-full'
        : '-m-4 lg:-m-8 h-[calc(100dvh-3.5rem)] lg:h-[100dvh]'
    }`}>
      <div className="flex w-full h-full">
        {/* Conversation list */}
        <div className={`w-full ${!isDrawerMode ? 'md:w-80 lg:w-96' : ''} flex flex-col border-r border-white/[0.06] ${selectedConv ? (isDrawerMode ? 'hidden' : 'hidden md:flex') : 'flex'}`}>
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isDrawerMode ? (
                <button type="button" onClick={onClose} className="shrink-0 w-8 h-8 flex items-center justify-center text-white hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              ) : (
                <AppBackButton className="shrink-0" />
              )}
              <h1 className="font-sans text-xl font-black text-white truncate">Messages</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowNewConv(!showNewConv)}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white shadow-lg transition-all hover:scale-105 hover:bg-cyan-400 active:scale-95"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>

          {/* New conversation search */}
          <AnimatePresence>
            {showNewConv && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-white/10"
              >
                <div className="p-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => searchUsers(e.target.value)}
                      placeholder="Rechercher un utilisateur..."
                      className="w-full bg-white/[0.05] border-b border-white/[0.1] rounded-none px-10 py-2.5 font-sans text-sm text-white placeholder-white/30 focus:outline-none focus:border-cobalt-500/50 transition-colors"
                      autoFocus
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {searchResults.map((u) => (
                        <div
                          key={u.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => startConversation(u)}
                          onKeyDown={activateRow(() => startConversation(u))}
                          className="w-full flex cursor-pointer items-center gap-3 rounded-xl p-2.5 text-left transition-colors hover:bg-white/5"
                        >
                          <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded-[1rem] bg-gradient-to-br from-brand-500 to-brand-600">
                            {u.avatar_url ? (
                              <Image src={u.avatar_url} alt="" fill className="object-cover" sizes="40px" />
                            ) : (
                              <span className="text-white font-bold text-sm">{u.display_name?.[0]?.toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div className="flex flex-col min-w-0 leading-tight">
                            <ProfileUserLink
                              username={u.username}
                              className="font-sans text-sm font-bold text-white truncate"
                            >
                              {u.display_name}
                            </ProfileUserLink>
                            <ProfileUserLink
                              username={u.username}
                              className="font-mono text-[10px] tracking-wider text-white/40 truncate"
                            >
                              @{u.username}
                            </ProfileUserLink>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto">
            {loadingConvs ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="text-center py-16 px-4">
                <MessageCircle className="w-12 h-12 text-gray-700 mx-auto mb-3" />
                <p className="text-gray-400 font-semibold mb-1">Aucune conversation</p>
                <p className="text-gray-600 text-sm">Cherche un utilisateur pour demarrer</p>
              </div>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => loadMessages(conv)}
                  onKeyDown={activateRow(() => loadMessages(conv))}
                  className={`flex w-full cursor-pointer items-center gap-3 border-b border-white/[0.04] px-4 py-3.5 text-left transition-colors hover:bg-white/5 ${
                    selectedConv?.id === conv.id ? 'bg-white/5' : ''
                  }`}
                >
                  <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-brand-500/80 to-brand-600/80">
                    {conv.other_user.avatar_url ? (
                      <Image src={conv.other_user.avatar_url} alt="" fill className="object-cover" sizes="48px" />
                    ) : (
                      <span className="text-white font-bold">{conv.other_user.display_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <ProfileUserLink
                          username={conv.other_user.username}
                          className="min-w-0 truncate font-sans text-sm font-bold text-white"
                        >
                          {conv.other_user.display_name}
                        </ProfileUserLink>
                        {conv.unread_count > 0 && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                        )}
                      </div>
                      {conv.last_message_at && (
                        <span className="shrink-0 self-start font-mono text-[10px] tracking-wider text-white/30">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    <p className={`mt-0.5 truncate font-sans text-xs ${conv.unread_count > 0 ? 'font-bold text-white' : 'text-white/35'}`}>
                      {(conv.last_message_text || 'Aucun message')
                        .replace('[BEEF_RESPONSE:LATER] ', '⏳ Défi en attente : ')
                        .replace('[BEEF_RESPONSE:DECLINE] ', '🛡️ Défi esquivé : ')}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={`flex flex-1 flex-col min-w-0 bg-transparent ${!selectedConv ? (isDrawerMode ? 'hidden' : 'hidden md:flex') : 'flex'}`}>
          {selectedConv ? (
            <>
              {/* Chat header */}
              <div className="flex shrink-0 items-center gap-3 border-b border-white/10 bg-black/40 backdrop-blur-md px-4 py-3 z-20">
                <button
                  type="button"
                  onClick={() => setSelectedConv(null)}
                  className={`${isDrawerMode ? 'flex' : 'flex md:hidden'} h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-white/[0.06]`}
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-[1rem] bg-gradient-to-br from-brand-500 to-brand-600">
                    {selectedConv.other_user.avatar_url ? (
                      <Image src={selectedConv.other_user.avatar_url} alt="" fill className="object-cover" sizes="40px" />
                    ) : (
                      <span className="text-sm font-bold text-white">
                        {selectedConv.other_user.display_name?.[0]?.toUpperCase() || '?'}
                      </span>
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col leading-tight">
                    <ProfileUserLink
                      username={selectedConv.other_user.username}
                      className="truncate font-sans text-sm font-bold text-white"
                    >
                      {selectedConv.other_user.display_name}
                    </ProfileUserLink>
                    <ProfileUserLink
                      username={selectedConv.other_user.username}
                      className="truncate font-mono text-[10px] tracking-wider text-white/40"
                    >
                      @{selectedConv.other_user.username}
                    </ProfileUserLink>
                  </div>
                </div>
                {messages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsSelectionMode(!isSelectionMode);
                      setSelectedMessages(new Set());
                      setMessageMenu(null);
                      setShowChatMenu(false);
                    }}
                    className="ml-auto shrink-0 rounded-full px-3 py-1.5 text-xs font-bold text-cyan-400 transition-colors hover:bg-cyan-500/10"
                  >
                    {isSelectionMode ? 'Annuler' : 'Sélectionner'}
                  </button>
                )}
                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowChatMenu((o) => !o)}
                    className="rounded-full p-2 text-white transition-colors hover:bg-white/10"
                  >
                    <MoreVertical className="h-5 w-5" aria-hidden />
                  </button>
                  <AnimatePresence>
                    {showChatMenu && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 10 }}
                        className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/80 shadow-2xl backdrop-blur-2xl"
                      >
                        <button
                          type="button"
                          onClick={() => void clearEntireConversation()}
                          className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-bold text-red-500 transition-colors hover:bg-red-500/10"
                        >
                          <Trash className="h-5 w-5" aria-hidden /> Vider la discussion
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Messages List */}
              <div
                className="relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 pt-4 pb-24"
                onClick={() => {
                  setMessageMenu(null);
                  setShowChatMenu(false);
                }}
              >
                {loadingMsgs ? (
                  <div className="flex flex-1 items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center">
                    <p className="text-sm text-gray-600">Envoie le premier message !</p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isMine = msg.sender_id === user.id;
                    const isDeleted = !!msg.is_deleted;
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                    const isConsecutivePrev = prevMsg && prevMsg.sender_id === msg.sender_id;
                    const isConsecutiveNext = nextMsg && nextMsg.sender_id === msg.sender_id;

                    let bubbleRadius = isMine
                      ? 'rounded-[20px] rounded-br-[4px]'
                      : 'rounded-[20px] rounded-bl-[4px]';

                    if (isConsecutivePrev && isConsecutiveNext) {
                      bubbleRadius = isMine ? 'rounded-[20px] rounded-r-[4px]' : 'rounded-[20px] rounded-l-[4px]';
                    } else if (isConsecutivePrev && !isConsecutiveNext) {
                      bubbleRadius = isMine ? 'rounded-[20px] rounded-tr-[4px] rounded-br-[4px]' : 'rounded-[20px] rounded-tl-[4px] rounded-bl-[4px]';
                    } else if (!isConsecutivePrev && isConsecutiveNext) {
                      bubbleRadius = isMine ? 'rounded-[20px] rounded-br-[4px]' : 'rounded-[20px] rounded-bl-[4px]';
                    }

                    const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;

                    const decodedText = isDeleted
                      ? '🚫 Ce message a été supprimé'
                      : msg.content;

                    const isLater = decodedText.startsWith('[BEEF_RESPONSE:LATER] ');
                    const isDecline = decodedText.startsWith('[BEEF_RESPONSE:DECLINE] ');
                    const isBeefResponse = isLater || isDecline;

                    let displayContent = decodedText;
                    if (isLater) displayContent = displayContent.replace('[BEEF_RESPONSE:LATER] ', '');
                    if (isDecline) displayContent = displayContent.replace('[BEEF_RESPONSE:DECLINE] ', '');

                    const showDateSeparator =
                      !prevMsg ||
                      new Date(msg.created_at).toDateString() !== new Date(prevMsg.created_at).toDateString();

                    return (
                      <div key={msg.id} className="flex w-full flex-col">
                        {showDateSeparator && (
                          <div className="my-5 flex w-full shrink-0 items-center justify-center">
                            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-white/50 backdrop-blur-md">
                              {formatDateSeparator(msg.created_at)}
                            </span>
                          </div>
                        )}
                        <div className={`group relative flex w-full flex-col gap-1 ${isMine ? 'items-end' : 'items-start'}`}>
                        <motion.div
                          drag={isSelectionMode || isDeleted ? false : 'x'}
                          dragConstraints={{ left: 0, right: 0 }}
                          dragElastic={0.08}
                          style={{ touchAction: 'pan-y' }}
                          onDragEnd={(_e, info) => {
                            if (!isSelectionMode && !isDeleted && Math.abs(info.offset.x) > 50) {
                              setReplyingTo(msg);
                            }
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isDeleted) return;
                            if (isSelectionMode) toggleMessageSelection(msg.id);
                            else setMessageMenu(messageMenu === msg.id ? null : msg.id);
                          }}
                          className={`relative flex w-full min-w-0 items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}
                        >
                          {isSelectionMode && !isDeleted && (
                            <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center">
                              {selectedMessages.has(msg.id) ? (
                                <CheckSquare className="h-5 w-5 text-cyan-500" aria-hidden />
                              ) : (
                                <Square className="h-5 w-5 text-gray-500" aria-hidden />
                              )}
                            </div>
                          )}

                          <AnimatePresence>
                            {messageMenu === msg.id && !isSelectionMode && !isDeleted && (
                              <>
                                <motion.div
                                  key={`dm-overlay-${msg.id}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm md:hidden"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setMessageMenu(null);
                                  }}
                                  aria-hidden
                                />
                                <motion.div
                                  key={`menu-${msg.id}`}
                                  initial={{ opacity: 0, y: 50, scale: 0.95 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  exit={{ opacity: 0, y: 50, scale: 0.95 }}
                                  className={`fixed bottom-0 left-0 right-0 z-[100] flex flex-col gap-2 rounded-t-[2rem] border border-white/10 bg-slate-900/80 p-6 pb-[max(2rem,env(safe-area-inset-bottom))] shadow-[0_-20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl md:absolute md:top-[calc(100%+0.5rem)] md:bottom-auto md:left-auto md:right-auto md:flex md:w-max md:flex-row md:items-center md:rounded-full md:border md:bg-slate-900/80 md:p-1.5 md:shadow-xl md:backdrop-blur-2xl ${isMine ? 'md:right-0' : 'md:left-0'}`}
                                >
                                  <div className="mb-4 flex justify-between px-2 md:mb-0 md:justify-start md:gap-1 md:px-0">
                                    {['👍', '❤️', '🔥', '😂', '😮', '😢'].map((emoji) => {
                                      const hasReacted = msg.reactions?.[emoji]?.includes(user.id);
                                      return (
                                        <button
                                          key={emoji}
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            toggleReaction(msg, emoji);
                                            setMessageMenu(null);
                                          }}
                                          className={`flex h-12 w-12 items-center justify-center rounded-full text-2xl transition-transform hover:scale-125 active:scale-90 md:h-8 md:w-8 md:text-lg ${hasReacted ? 'bg-cyan-500/30' : 'bg-white/5 md:bg-transparent md:hover:bg-white/10'}`}
                                        >
                                          {emoji}
                                        </button>
                                      );
                                    })}
                                  </div>
                                  {isMine && (
                                    <>
                                      <div className="mx-1 hidden h-5 w-px bg-white/10 md:block" />
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          void deleteMessage(msg.id);
                                        }}
                                        className="flex items-center justify-center gap-2 rounded-2xl bg-red-500/10 py-3.5 text-sm font-bold text-red-500 transition-colors hover:bg-red-500/20 md:h-8 md:w-8 md:rounded-full md:bg-transparent md:p-0 md:hover:bg-red-500/20"
                                        title="Supprimer"
                                      >
                                        <Trash2 className="h-5 w-5 md:h-4 md:w-4" aria-hidden />{' '}
                                        <span className="md:hidden">Supprimer le message</span>
                                      </button>
                                    </>
                                  )}
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>

                          <div
                            onDoubleClick={(e) => {
                              if (isSelectionMode || isDeleted) return;
                              e.stopPropagation();
                              setReplyingTo(msg);
                            }}
                            className={`flex min-w-0 max-w-[85%] select-none flex-col shadow-md md:max-w-[70%] ${isSelectionMode || isDeleted ? 'pointer-events-none' : ''} ${isMine ? 'items-end' : 'items-start'} ${bubbleRadius} ${isDeleted ? 'border border-white/10 bg-white/5 italic text-white/40' : isMine ? 'bg-gradient-to-br from-cyan-600 to-cyan-500 text-white' : 'border border-white/5 bg-white/10 text-white/95 backdrop-blur-md'} ${!isSelectionMode && !isDeleted ? 'cursor-pointer' : ''}`}
                          >
                            <div className="w-full overflow-hidden px-4 py-2.5">
                              {repliedMsg && !isDeleted && (
                                <div className={`mb-2 rounded-lg border-l-2 p-2 text-xs ${isMine ? 'border-white/50 bg-black/20 text-white/90' : 'border-cyan-500 bg-black/30 text-gray-300'}`}>
                                  <p className="mb-0.5 font-bold opacity-75">{repliedMsg.sender_id === user.id ? 'Vous' : selectedConv.other_user.display_name}</p>
                                  <p className="truncate opacity-90">{repliedMsg.content}</p>
                                </div>
                              )}
                              {isBeefResponse && !isDeleted && (
                                <div
                                  className={`mb-1.5 flex items-center gap-1.5 border-b pb-1 text-[10px] font-black uppercase tracking-widest ${isMine ? 'border-white/20 text-white/80' : 'border-cyan-500/30 text-cyan-400'}`}
                                >
                                  <Swords className="h-3 w-3" />
                                  {isLater ? 'A mis le défi en attente' : 'A esquivé le défi'}
                                </div>
                              )}
                              <p className="min-w-0 whitespace-pre-wrap break-all font-sans text-[15px]">{displayContent}</p>
                              <div className={`mt-1 flex items-center justify-end gap-1 ${isDeleted ? 'text-white/20' : isMine ? 'text-white/75' : 'text-white/40'}`}>
                                <span className="font-mono text-[10px] tracking-wider">
                                  {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                                {isMine && !isDeleted && (msg.is_read ? <CheckCheck className="h-3 w-3" /> : <Check className="h-3 w-3" />)}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && !isDeleted && (
                          <div className={`flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions).map(([emoji, users]) => {
                              if (users.length === 0) return null;
                              const hasReacted = users.includes(user.id);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleReaction(msg, emoji);
                                  }}
                                  className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[11px] ${hasReacted ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-400' : 'border-white/10 bg-white/5 text-gray-300'}`}
                                >
                                  <span>{emoji}</span>
                                  <span>{users.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} className="h-1 shrink-0" />
              </div>

              {/* Action Bar & Input */}
              <div className="z-20 flex shrink-0 flex-col border-t border-white/10 bg-black/60 backdrop-blur-md pb-[max(0.5rem,env(safe-area-inset-bottom))]">
                {isSelectionMode ? (
                  <div className="flex items-center justify-between px-4 py-4">
                    <span className="text-sm font-semibold text-gray-400">
                      {selectedMessages.size} sélectionné{selectedMessages.size > 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setIsSelectionMode(false);
                          setSelectedMessages(new Set());
                        }}
                        className="rounded-full bg-white/10 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-white/20"
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSelectedMessages()}
                        disabled={selectedMessages.size === 0}
                        className="flex items-center gap-2 rounded-full bg-red-500 px-5 py-2.5 text-sm font-black text-white shadow-[0_0_15px_rgba(239,68,68,0.3)] transition-colors hover:bg-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden /> Supprimer
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2 px-4 py-3">
                    <AnimatePresence>
                      {replyingTo && (
                        <motion.div
                          initial={{ opacity: 0, y: 10, height: 0 }}
                          animate={{ opacity: 1, y: 0, height: 'auto' }}
                          exit={{ opacity: 0, y: 10, height: 0 }}
                          className="flex items-center justify-between rounded-r-lg border-l-2 border-cyan-500 bg-white/5 px-3 py-2"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-cyan-400">
                              Réponse à {replyingTo.sender_id === user.id ? 'vous-même' : selectedConv.other_user.display_name}
                            </p>
                            <p className="truncate text-xs text-gray-400">{replyingTo.content}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setReplyingTo(null)}
                            className="shrink-0 rounded-full p-1 text-gray-400 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        sendMessage();
                      }}
                      className="flex w-full items-end gap-2"
                    >
                      <button
                        type="button"
                        aria-label="Options de message"
                        onClick={() => toast('Envoi de médias bientôt disponible !', 'info')}
                        className="mb-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Plus className="h-5 w-5" />
                      </button>
                      <div className="flex min-w-0 flex-1 items-end rounded-[1.5rem] border border-white/10 bg-white/5 p-1.5 transition-all focus-within:border-cyan-500/50 focus-within:bg-white/[0.07]">
                        <textarea
                          ref={messageComposerRef}
                          value={newMessage}
                          onChange={(e) => {
                            setNewMessage(e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              sendMessage();
                              const target = e.target as HTMLTextAreaElement;
                              setTimeout(() => {
                                target.style.height = 'auto';
                              }, 0);
                            }
                          }}
                          placeholder="Message..."
                          rows={1}
                          className="hide-scrollbar flex-1 min-w-0 resize-none border-none bg-transparent px-3 py-2 font-sans text-[15px] text-white placeholder-white/40 focus:outline-none focus:ring-0 max-h-[120px]"
                        />
                        <button
                          type="submit"
                          disabled={!newMessage.trim()}
                          className="mb-0.5 mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cyan-500 text-white transition-colors hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <Send className="-ml-0.5 h-4 w-4" />
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="text-center">
                <MessageCircle className="mx-auto mb-4 h-16 w-16 text-white/10" />
                <p className="font-sans text-sm font-bold text-white/50">Sélectionne une conversation</p>
                <p className="mt-1 font-sans text-xs text-white/25">ou commence une nouvelle discussion</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
