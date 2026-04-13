'use client';

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Search, MessageCircle, Plus, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';
import { AppBackButton } from '@/components/AppBackButton';
import { ProfileUserLink } from '@/components/ProfileUserLink';

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
}

export default function MessagesPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const { toast } = useToast();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewConv, setShowNewConv] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login?redirect=/messages');
    }
  }, [user, loading, router]);

  const loadConversations = useCallback(async () => {
    if (!user) return;
    setLoadingConvs(true);
    try {
      const { data: convs } = await supabase
        .from('conversations')
        .select('*')
        .or(`participant_1.eq.${user.id},participant_2.eq.${user.id}`)
        .order('last_message_at', { ascending: false, nullsFirst: false });

      if (!convs) { setConversations([]); return; }

      const otherIds = convs.map(c => c.participant_1 === user.id ? c.participant_2 : c.participant_1);
      const { data: users } = await supabase.from('users').select('id, username, display_name, avatar_url').in('id', otherIds);
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
    } catch (err) {
      console.error('Error loading conversations:', err);
    } finally {
      setLoadingConvs(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) void loadConversations();
  }, [user, loadConversations]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, []);

  useEffect(() => {
    if (selectedConv && messages.length > 0) {
      scrollToBottom();
    }
  }, [messages, selectedConv, scrollToBottom]);

  // Real-time messages
  useEffect(() => {
    if (!selectedConv) return;

    const channel = supabase
      .channel(`dm_${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'direct_messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload) => {
        const msg = payload.new as Message;
        if (msg.sender_id !== user?.id) {
          setMessages(prev => [...prev, msg]);
          supabase.from('direct_messages').update({ is_read: true }).eq('id', msg.id).then(() => {});
          supabase.from('notifications')
            .update({ is_read: true })
            .eq('user_id', user?.id || '')
            .eq('type', 'message')
            .eq('is_read', false)
            .filter('metadata->>conversation_id', 'eq', selectedConv.id)
            .then(() => {});
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, user]);

  const loadMessages = async (conv: Conversation) => {
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
        .eq('is_read', false)
        .filter('metadata->>conversation_id', 'eq', conv.id);

      // Update local unread count for this conversation
      setConversations(prev =>
        prev.map(c => c.id === conv.id ? { ...c, unread_count: 0 } : c)
      );
    } catch (err) {
      console.error('Error loading messages:', err);
    } finally {
      setLoadingMsgs(false);
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedConv || !user) return;
    const clean = sanitizeMessage(newMessage);
    if (!clean) return;

    const tempMsg: Message = {
      id: `temp_${Date.now()}`,
      conversation_id: selectedConv.id,
      sender_id: user.id,
      content: clean,
      created_at: new Date().toISOString(),
      is_read: false,
    };
    setMessages(prev => [...prev, tempMsg]);
    setNewMessage('');

    const { data, error } = await supabase.from('direct_messages').insert({
      conversation_id: selectedConv.id,
      sender_id: user.id,
      content: clean,
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

  const searchUsers = async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const { data } = await supabase
        .from('users')
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

  const startConversation = async (otherUser: any) => {
    if (!user) return;
    try {
      const { data: convId } = await supabase.rpc('get_or_create_conversation', {
        user_a: user.id,
        user_b: otherUser.id,
      });

      if (convId) {
        const conv: Conversation = {
          id: convId,
          participant_1: user.id < otherUser.id ? user.id : otherUser.id,
          participant_2: user.id < otherUser.id ? otherUser.id : user.id,
          last_message_text: null,
          last_message_at: null,
          other_user: otherUser,
          unread_count: 0,
        };
        setConversations(prev => {
          const exists = prev.find(c => c.id === convId);
          return exists ? prev : [conv, ...prev];
        });
        loadMessages(conv);
        setShowNewConv(false);
        setSearchQuery('');
        setSearchResults([]);
      }
    } catch (err) {
      toast('Erreur lors de la création de la conversation', 'error');
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="h-[calc(100vh-3.5rem)] bg-black overflow-hidden">
      <div className="max-w-5xl mx-auto flex h-full">
        {/* Conversation list */}
        <div className={`w-full md:w-96 border-r border-white/[0.06] flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <AppBackButton className="shrink-0" />
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
                          <div className="min-w-0">
                            <ProfileUserLink
                              username={u.username}
                              className="font-sans text-sm font-bold text-white"
                            >
                              {u.display_name}
                            </ProfileUserLink>
                            <ProfileUserLink
                              username={u.username}
                              className="font-mono text-[10px] tracking-wider text-white/35"
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
                    <div className="flex items-center justify-between gap-2">
                      <ProfileUserLink
                        username={conv.other_user.username}
                        className="min-w-0 flex-1 truncate font-sans text-sm font-bold text-white"
                      >
                        {conv.other_user.display_name}
                      </ProfileUserLink>
                      {conv.last_message_at && (
                        <span className="flex-shrink-0 font-mono text-[10px] tracking-wider text-white/30">
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
                  <div className="min-w-0">
                    <ProfileUserLink
                      username={selectedConv.other_user.username}
                      className="font-sans text-sm font-bold text-white"
                    >
                      {selectedConv.other_user.display_name}
                    </ProfileUserLink>
                    <ProfileUserLink
                      username={selectedConv.other_user.username}
                      className="font-mono text-[10px] tracking-wider text-white/35"
                    >
                      @{selectedConv.other_user.username}
                    </ProfileUserLink>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
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
                    return (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[75%] px-4 py-2.5 text-sm leading-relaxed ${
                          isMine
                            ? 'rounded-lg rounded-br-sm bg-cobalt-500/10 border border-cobalt-500/20 text-white'
                            : 'rounded-lg rounded-bl-sm bg-white/[0.05] border border-white/[0.08] text-white'
                        }`}>
                          <p className="font-sans font-light">{msg.content}</p>
                          <div className={`flex items-center justify-end gap-1 mt-1.5 ${isMine ? 'text-white/40' : 'text-white/30'}`}>
                            <span className="font-mono text-[10px] tracking-wider">
                              {new Date(msg.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            {isMine && (
                              msg.is_read
                                ? <CheckCheck className="w-3 h-3" />
                                : <Check className="w-3 h-3" />
                            )}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div className="px-4 py-3 border-t border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ecris ton message..."
                    className="flex-1 bg-white/[0.05] border-b border-white/[0.1] rounded-none px-4 py-2.5 font-sans text-sm text-white placeholder-white/30 focus:outline-none focus:border-cobalt-500/50 transition-colors"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 rounded-xl bg-prestige-gold/90 hover:bg-prestige-gold disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4 text-black" />
                  </button>
                </div>
              </div>
            </>
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
