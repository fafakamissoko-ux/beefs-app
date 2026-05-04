'use client';

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Search, MessageCircle, Plus, Check, CheckCheck, X, Trash2, CheckSquare, Square } from 'lucide-react';
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

export function MessagesUI({ isDrawerMode = false, onClose }: MessagesUIProps = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  const { targetUserId } = useMessagesDrawer();

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
  const dmDeepLinkLockRef = useRef(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [messageMenu, setMessageMenu] = useState<string | null>(null);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      const dest = `/messages${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
      router.push(`/login?redirect=${encodeURIComponent(dest)}`);
    }
  }, [user, authLoading, router, searchParams]);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    if (selectedConv && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, selectedConv, scrollToBottom]);

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
          if (msg.is_deleted) {
            setMessages(prev => prev.filter(m => m.id !== msg.id));
          } else {
            setMessages(prev => prev.map(m => m.id === msg.id ? msg : m));
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, user]);

  const loadMessages = useCallback(async (conv: Conversation) => {
    setReplyingTo(null);
    setMessageMenu(null);
    setIsSelectionMode(false);
    setSelectedMessages(new Set());
    setSelectedConv(conv);
    setLoadingMsgs(true);
    try {
      const { data } = await supabase
        .from('direct_messages')
        .select('*')
        .eq('conversation_id', conv.id)
        .eq('is_deleted', false)
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
    setMessages(prev => prev.filter(m => m.id !== msgId));
    await supabase.from('direct_messages').update({ is_deleted: true }).eq('id', msgId);
    setMessageMenu(null);
  };

  const deleteSelectedMessages = async () => {
    if (selectedMessages.size === 0) return;
    const idsToDelete = Array.from(selectedMessages);
    const serverIds = idsToDelete.filter((id) => !id.startsWith('temp_'));

    setMessages((prev) => prev.filter((m) => !selectedMessages.has(m.id)));
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

  useEffect(() => {
    if (authLoading || !user || loadingConvs) return;
    if (dmDeepLinkLockRef.current) return;

    let raw = searchParams.get('with');

    // Si on est dans le tiroir et qu'un ID cible est demandé, on l'utilise en priorité
    if (isDrawerMode && targetUserId) {
      raw = targetUserId;
    } else if (!raw && typeof window !== 'undefined') {
      raw = sessionStorage.getItem(PENDING_DM_WITH_STORAGE_KEY);
      if (raw) sessionStorage.removeItem(PENDING_DM_WITH_STORAGE_KEY);
    }

    if (!raw) return;

    const withId = raw.trim();
    if (!DM_WITH_UUID_RE.test(withId) || withId === user.id) {
      if (!isDrawerMode) router.replace('/messages', { scroll: false });
      return;
    }

    dmDeepLinkLockRef.current = true;

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
    <div className={`flex flex-1 overflow-hidden bg-[#050505] ${
      isDrawerMode
        ? 'h-full w-full'
        : '-m-4 lg:-m-8 h-[calc(100dvh-3.5rem)] lg:h-[100dvh]'
    }`}>
      <div className="flex w-full h-full">
        {/* Conversation list */}
        <div className={`w-full md:w-96 border-r border-white/[0.06] flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
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
              onClick={() => setShowNewConv(!showNewConv)}
              className="w-10 h-10 rounded-xl bg-prestige-gold/90 hover:bg-prestige-gold flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4 text-black" />
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
                      <ProfileUserLink
                        username={conv.other_user.username}
                        className="min-w-0 truncate font-sans text-sm font-bold text-white"
                      >
                        {conv.other_user.display_name}
                      </ProfileUserLink>
                      {conv.last_message_at && (
                        <span className="shrink-0 self-start font-mono text-[10px] tracking-wider text-white/30">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate font-sans text-xs text-white/35">
                      {conv.last_message_text || 'Aucun message'}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={`flex-1 flex flex-col ${!selectedConv ? 'hidden md:flex' : 'flex'}`}>
          {selectedConv ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <button
                  onClick={() => setSelectedConv(null)}
                  className="md:hidden w-10 h-10 rounded-xl hover:bg-white/[0.06] flex items-center justify-center transition-colors"
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
                    }}
                    className="ml-auto rounded-full px-3 py-1.5 text-xs font-bold text-plasma-400 transition-colors hover:bg-plasma-500/10 hover:text-plasma-300"
                  >
                    {isSelectionMode ? 'Annuler' : 'Sélectionner'}
                  </button>
                )}
              </div>

              {/* Messages */}
              <div
                className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
                onClick={() => {
                  setMessageMenu(null);
                }}
              >
                {loadingMsgs ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <p className="text-gray-600 text-sm">Envoie le premier message !</p>
                  </div>
                ) : (
                  messages.map((msg) => {
                    const isMine = msg.sender_id === user.id;
                    const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null;
                    const decodedText = msg.content.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/');
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isSelectionMode) {
                            toggleMessageSelection(msg.id);
                          } else {
                            setMessageMenu(messageMenu === msg.id ? null : msg.id);
                          }
                        }}
                        className={`relative flex w-full flex-col gap-1 group ${isMine ? 'items-end' : 'items-start'}`}
                      >
                        {isSelectionMode && (
                          <div className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 ${isMine ? '-left-8' : '-right-8'}`}>
                            {selectedMessages.has(msg.id) ? (
                              <CheckSquare className="h-5 w-5 text-plasma-500" aria-hidden />
                            ) : (
                              <Square className="h-5 w-5 text-gray-500" aria-hidden />
                            )}
                          </div>
                        )}
                        <div className={`relative flex items-center gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                          <AnimatePresence>
                            {!isSelectionMode && messageMenu === msg.id && (
                              <motion.div
                                key={`menu-${msg.id}`}
                                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                className={`absolute bottom-full z-[50] mb-2 flex items-center gap-1 rounded-full border border-white/10 bg-[#1A1A1A] px-2 py-1.5 shadow-xl backdrop-blur-md ${isMine ? 'right-0' : 'left-0'}`}
                              >
                                {['👍', '❤️', '🔥', '😂', '😮', '😢'].map((emoji) => {
                                  const hasReacted = msg.reactions?.[emoji]?.includes(user.id);
                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); toggleReaction(msg, emoji); setMessageMenu(null); }}
                                      className={`flex h-8 w-8 items-center justify-center rounded-full text-lg transition-transform hover:scale-125 ${hasReacted ? 'bg-plasma-500/30' : 'hover:bg-white/10'}`}
                                    >
                                      {emoji}
                                    </button>
                                  );
                                })}
                                {isMine && (
                                  <>
                                    <div className="mx-1 h-5 w-px bg-white/10" />
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); deleteMessage(msg.id); }}
                                      className="flex h-8 w-8 items-center justify-center rounded-full text-red-500 transition-colors hover:bg-red-500/20"
                                      title="Supprimer"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </>
                                )}
                              </motion.div>
                            )}
                          </AnimatePresence>
                          <div
                            onDoubleClick={(e) => {
                              if (isSelectionMode) return;
                              e.stopPropagation();
                              setReplyingTo(msg);
                            }}
                            className={`max-w-[75%] select-none px-4 py-2.5 text-[15px] leading-relaxed shadow-md ${
                          isSelectionMode ? 'cursor-default' : 'cursor-pointer'
                        } ${
                          isMine
                            ? 'rounded-[20px] rounded-br-[4px] bg-gradient-to-br from-plasma-600 to-plasma-500 text-white'
                            : 'rounded-[20px] rounded-bl-[4px] border border-white/5 bg-white/10 text-white/95 backdrop-blur-md'
                        }`}>
                            {repliedMsg && (
                              <div className={`mb-2 rounded-lg border-l-2 p-2 text-xs ${isMine ? 'border-white/50 bg-black/20 text-white/90' : 'border-plasma-500 bg-black/30 text-gray-300'}`}>
                                <p className="mb-0.5 font-bold opacity-75">{repliedMsg.sender_id === user.id ? 'Vous' : selectedConv.other_user.display_name}</p>
                                <p className="truncate opacity-90">{repliedMsg.content.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/')}</p>
                              </div>
                            )}
                            <p className="whitespace-pre-wrap font-sans">{decodedText}</p>
                            <div className={`mt-1 flex items-center justify-end gap-1 ${isMine ? 'text-white/75' : 'text-white/40'}`}>
                              <span className="font-mono text-[10px] tracking-wider">
                                {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isMine && (
                                msg.is_read
                                  ? <CheckCheck className="h-3 w-3" />
                                  : <Check className="h-3 w-3" />
                              )}
                            </div>
                          </div>
                          <div className={`pointer-events-none flex flex-col justify-end pb-1 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 ${isSelectionMode ? 'hidden' : ''}`} aria-hidden>
                            <span className="select-none text-xs text-white/30">•••</span>
                          </div>
                        </div>
                        {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                          <div className={`flex flex-wrap gap-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
                            {Object.entries(msg.reactions).map(([emoji, users]) => {
                              if (users.length === 0) return null;
                              const hasReacted = users.includes(user.id);
                              return (
                                <button
                                  key={emoji}
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleReaction(msg, emoji); }}
                                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[11px] border ${hasReacted ? 'bg-plasma-500/20 border-plasma-500/50 text-plasma-400' : 'bg-white/5 border-white/10 text-gray-300'}`}
                                >
                                  <span>{emoji}</span>
                                  <span>{users.length}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {isSelectionMode ? (
                <div className="flex items-center justify-between border-t border-white/[0.06] bg-[#0A0A0A] px-4 py-3">
                  <span className="text-sm font-medium text-gray-400">
                    {selectedMessages.size} message{selectedMessages.size > 1 ? 's' : ''} sélectionné{selectedMessages.size > 1 ? 's' : ''}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsSelectionMode(false);
                        setSelectedMessages(new Set());
                      }}
                      className="rounded-full bg-white/10 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/20"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSelectedMessages()}
                      disabled={selectedMessages.size === 0}
                      className="rounded-full bg-red-500 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2 border-t border-white/[0.06] bg-[#0A0A0A] px-4 py-3">
                <AnimatePresence>
                  {replyingTo && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, height: 0 }} 
                      animate={{ opacity: 1, y: 0, height: 'auto' }} 
                      exit={{ opacity: 0, y: 10, height: 0 }}
                      className="flex items-center justify-between bg-white/5 border-l-2 border-plasma-500 rounded-r-lg px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-plasma-400">Réponse à {replyingTo.sender_id === user.id ? 'vous-même' : selectedConv.other_user.display_name}</p>
                        <p className="text-xs text-gray-400 truncate">{replyingTo.content.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#x2F;/g, '/')}</p>
                      </div>
                      <button type="button" onClick={() => setReplyingTo(null)} className="p-1 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
                <form 
                  onSubmit={(e) => { e.preventDefault(); sendMessage(); }}
                  className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full p-1 pl-4 focus-within:border-plasma-500/50 focus-within:bg-white/[0.07] transition-all"
                >
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Écris ton message..."
                    className="flex-1 bg-transparent border-none font-sans text-[15px] text-white placeholder-white/40 focus:outline-none focus:ring-0"
                  />
                  <button
                    type="submit"
                    disabled={!newMessage.trim()}
                    className="w-9 h-9 rounded-full bg-plasma-500 hover:bg-plasma-400 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
                  >
                    <Send className="w-4 h-4 text-white -ml-0.5" />
                  </button>
                </form>
                </div>
              )}
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 text-white/10 mx-auto mb-4" />
                <p className="font-sans text-sm font-bold text-white/50">Sélectionne une conversation</p>
                <p className="font-sans text-xs text-white/25 mt-1">ou commence une nouvelle discussion</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
