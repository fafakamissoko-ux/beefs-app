'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Send, Search, MessageCircle, Plus, Check, CheckCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase/client';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';

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

  useEffect(() => {
    if (user) loadConversations();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          // Mark as read
          supabase.from('direct_messages').update({ is_read: true }).eq('id', msg.id).then(() => {});
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedConv, user]);

  const loadConversations = async () => {
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
  };

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

      // Mark unread as read
      if (data?.length) {
        await supabase
          .from('direct_messages')
          .update({ is_read: true })
          .eq('conversation_id', conv.id)
          .neq('sender_id', user?.id || '')
          .eq('is_read', false);
      }
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
    <div className="min-h-screen bg-black">
      <div className="max-w-5xl mx-auto flex h-[calc(100vh-4rem)]">
        {/* Conversation list */}
        <div className={`w-full md:w-96 border-r border-white/10 flex flex-col ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h1 className="text-xl font-black text-white">Messages</h1>
            <button
              onClick={() => setShowNewConv(!showNewConv)}
              className="w-10 h-10 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-colors"
            >
              <Plus className="w-4 h-4 text-white" />
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
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
                      autoFocus
                    />
                  </div>
                  {searchResults.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {searchResults.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => startConversation(u)}
                          className="w-full flex items-center gap-3 p-2.5 rounded-xl hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0">
                            {u.avatar_url ? (
                              <img src={u.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                            ) : (
                              <span className="text-white font-bold text-sm">{u.display_name?.[0]?.toUpperCase() || '?'}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-white text-sm font-semibold">{u.display_name}</p>
                            <p className="text-gray-500 text-xs">@{u.username}</p>
                          </div>
                        </button>
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
                <button
                  key={conv.id}
                  onClick={() => loadMessages(conv)}
                  className={`w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors text-left border-b border-white/[0.04] ${
                    selectedConv?.id === conv.id ? 'bg-white/5' : ''
                  }`}
                >
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500/80 to-brand-600/80 flex items-center justify-center flex-shrink-0">
                    {conv.other_user.avatar_url ? (
                      <img src={conv.other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{conv.other_user.display_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-white font-semibold text-sm truncate">{conv.other_user.display_name}</p>
                      {conv.last_message_at && (
                        <span className="text-gray-600 text-[11px] flex-shrink-0">{formatTime(conv.last_message_at)}</span>
                      )}
                    </div>
                    <p className="text-gray-500 text-xs truncate mt-0.5">
                      {conv.last_message_text || 'Aucun message'}
                    </p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Chat area */}
        <div className={`flex-1 flex flex-col ${!selectedConv ? 'hidden md:flex' : 'flex'}`}>
          {selectedConv ? (
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10">
                <button
                  onClick={() => setSelectedConv(null)}
                  className="md:hidden w-10 h-10 rounded-full hover:bg-white/10 flex items-center justify-center"
                >
                  <ArrowLeft className="w-5 h-5 text-white" />
                </button>
                <div
                  className="flex items-center gap-3 flex-1 cursor-pointer"
                  onClick={() => router.push(`/profile/${selectedConv.other_user.username}`)}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center flex-shrink-0">
                    {selectedConv.other_user.avatar_url ? (
                      <img src={selectedConv.other_user.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                    ) : (
                      <span className="text-white font-bold text-sm">{selectedConv.other_user.display_name?.[0]?.toUpperCase() || '?'}</span>
                    )}
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">{selectedConv.other_user.display_name}</p>
                    <p className="text-gray-500 text-xs">@{selectedConv.other_user.username}</p>
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
                        <div className={`max-w-[75%] px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${
                          isMine
                            ? 'bg-brand-500 text-white rounded-br-md'
                            : 'bg-white/10 text-white rounded-bl-md'
                        }`}>
                          <p>{msg.content}</p>
                          <div className={`flex items-center justify-end gap-1 mt-1 ${isMine ? 'text-white/60' : 'text-gray-500'}`}>
                            <span className="text-[10px]">
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
              <div className="px-4 py-3 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                    placeholder="Ecris ton message..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-brand-500/50"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!newMessage.trim()}
                    className="w-10 h-10 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
                  >
                    <Send className="w-4 h-4 text-white" />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageCircle className="w-16 h-16 text-gray-800 mx-auto mb-4" />
                <p className="text-gray-500 font-semibold">Selectionne une conversation</p>
                <p className="text-gray-700 text-sm mt-1">ou commence une nouvelle discussion</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
