'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Send, Pin, Heart } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { useToast } from '@/components/Toast';
import { sanitizeMessage } from '@/lib/security';

interface Message {
  id: string;
  username: string;
  display_name?: string;
  avatar_url?: string;
  content: string;
  is_pinned: boolean;
  is_deleted: boolean;
  created_at: string;
}

interface ChatPanelProps {
  roomId: string;
  userId: string;
  userName: string;
  tiktokStyle?: boolean;
  commentsStyle?: boolean;
}

export function ChatPanel({ roomId, userId, userName, tiktokStyle = false, commentsStyle = false }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Load messages and subscribe to realtime
  useEffect(() => {
    // Load initial messages from beef_messages table
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('beef_messages')
        .select('*')
        .eq('beef_id', roomId)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })
        .limit(100);

      if (error) {
        console.error('Error loading messages:', error);
      } else if (data) {
        setMessages(data as Message[]);
      }
    };

    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel(`beef_${roomId}_messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'beef_messages',
          filter: `beef_id=eq.${roomId}`,
        },
        (payload) => {
          if (!payload.new.is_deleted) {
            setMessages((prev) => [...prev, payload.new as Message]);
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'beef_messages',
          filter: `beef_id=eq.${roomId}`,
        },
        (payload) => {
          setMessages((prev) =>
            prev.map((msg) => (msg.id === payload.new.id ? (payload.new as Message) : msg))
          );
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    setLoading(true);
    try {
      // Get user details
      const { data: userData } = await supabase
        .from('users')
        .select('username, display_name, avatar_url')
        .eq('id', userId)
        .single();

      const cleanContent = sanitizeMessage(input);
      if (!cleanContent) { setLoading(false); return; }

      const { error } = await supabase.from('beef_messages').insert({
        beef_id: roomId,
        user_id: userId,
        username: userData?.username || userName,
        display_name: userData?.display_name || userName,
        avatar_url: userData?.avatar_url,
        content: cleanContent,
        is_pinned: false,
      });

      if (error) {
        console.error('Error sending message:', error);
        toast('Erreur lors de l\'envoi du message. Vérifiez que vous n\'envoyez pas trop de messages trop rapidement.', 'error');
      } else {
        setInput('');
      }
    } catch (error) {
      console.error('Error sending message:', error);
    } finally {
      setLoading(false);
    }
  };

  const pinnedMessages = messages.filter((m) => m.is_pinned);
  const regularMessages = messages.filter((m) => !m.is_pinned);

  if (tiktokStyle) {
    // TikTok-style chat: transparent, floating messages
    return (
      <div className="flex flex-col gap-2 pointer-events-none">
        <AnimatePresence>
          {regularMessages.slice(-5).map((msg) => (
            <TikTokChatMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
      </div>
    );
  }

  if (commentsStyle) {
    // Comments panel style: full list with avatars
    return (
      <div className="space-y-4">
        <AnimatePresence>
          {regularMessages.map((msg) => (
            <CommentsStyleMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-arena-gray">
      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="border-b border-arena-dark p-3 space-y-2">
          <div className="text-xs font-bold text-arena-blue flex items-center gap-1">
            <Pin className="w-3 h-3" />
            MESSAGES ÉPINGLÉS
          </div>
          {pinnedMessages.map((msg) => (
            <div key={msg.id} className="bg-arena-blue/10 rounded px-2 py-1">
              <div className="text-xs text-gray-400">{msg.display_name || msg.username}</div>
              <div className="text-sm text-white">{msg.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <AnimatePresence>
          {regularMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-arena-dark p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Message..."
            disabled={loading}
            className="flex-1 bg-arena-dark border border-arena-darker rounded-lg px-4 py-2 focus:outline-none focus:border-arena-blue disabled:opacity-50"
          />
          
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="bg-arena-blue hover:bg-arena-blue/80 text-arena-dark p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-arena-dark border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function ChatMessage({ message }: { message: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-1"
    >
      <div className="text-xs text-gray-400">{message.display_name || message.username}</div>
      <div className="text-sm bg-arena-dark rounded-lg px-3 py-2">
        {message.content}
      </div>
    </motion.div>
  );
}

function TikTokChatMessage({ message }: { message: Message }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -30, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -30, scale: 0.9 }}
      transition={{ duration: 0.4, type: 'spring', stiffness: 300, damping: 25 }}
      className="mb-2"
    >
      <div className="inline-flex max-w-[85%] items-baseline gap-1.5 rounded-2xl border border-white/12 bg-gradient-to-br from-black/75 to-black/45 px-3.5 py-2 shadow-xl backdrop-blur-md">
        <span className="bg-gradient-to-r from-fuchsia-400 via-pink-400 to-prestige-twitch bg-clip-text text-xs font-extrabold tracking-tight text-transparent drop-shadow">
          {message.display_name || message.username}
        </span>
        <span className="text-sm font-medium leading-snug text-white/95">{message.content}</span>
      </div>
    </motion.div>
  );
}

function CommentsStyleMessage({ message }: { message: Message }) {
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(Math.floor(Math.random() * 50));

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="flex items-start gap-3"
    >
      {/* Avatar with gradient border */}
      <motion.div 
        className="w-10 h-10 rounded-full bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500 p-0.5 flex-shrink-0 shadow-lg"
        whileHover={{ scale: 1.05 }}
      >
        {message.avatar_url ? (
          <div className="relative w-full h-full rounded-full overflow-hidden">
            <Image
              src={message.avatar_url}
              alt={message.display_name || message.username}
              fill
              className="object-cover"
              sizes="40px"
            />
          </div>
        ) : (
          <div className="w-full h-full rounded-full bg-black flex items-center justify-center">
            <span className="text-white font-bold text-sm">
              {(message.display_name || message.username)[0].toUpperCase()}
            </span>
          </div>
        )}
      </motion.div>
      
      {/* Message Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white font-bold text-sm truncate">
            {message.display_name || message.username}
          </span>
          <span className="text-white/40 text-xs flex-shrink-0">
            {new Date(message.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <p className="text-white/95 text-sm leading-relaxed break-words">{message.content}</p>
        
        {/* Actions */}
        <div className="flex items-center gap-4 mt-2.5">
          <motion.button 
            whileTap={{ scale: 0.9 }}
            onClick={() => {
              setLiked(!liked);
              setLikes(prev => liked ? prev - 1 : prev + 1);
            }}
            className="flex items-center gap-1.5 text-white/60 hover:text-pink-400 transition-colors touch-manipulation group"
          >
            <Heart className={`w-4 h-4 transition-all ${liked ? 'fill-pink-500 text-pink-500' : ''}`} />
            {likes > 0 && (
              <span className={`text-xs font-medium ${liked ? 'text-pink-400' : ''}`}>{likes}</span>
            )}
          </motion.button>
          <button className="text-white/60 hover:text-white transition-colors text-xs font-medium touch-manipulation">
            Répondre
          </button>
        </div>
      </div>
    </motion.div>
  );
}
