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
    <div className="flex h-full flex-col bg-surface-2">
      {/* Pinned Messages */}
      {pinnedMessages.length > 0 && (
        <div className="space-y-2 border-b border-white/10 p-3">
          <div className="flex items-center gap-1 text-xs font-extrabold tracking-wide text-accent">
            <Pin className="w-3 h-3" />
            MESSAGES ÉPINGLÉS
          </div>
          {pinnedMessages.map((msg) => (
            <div key={msg.id} className="frosted-titanium rounded-[2rem] px-2 py-1.5">
              <div className="text-xs font-medium text-white/55">{msg.display_name || msg.username}</div>
              <div className="text-sm font-medium tracking-tight text-white/95">{msg.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Messages List */}
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        <AnimatePresence>
          {regularMessages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-white/10 p-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Message..."
            disabled={loading}
            className="glass-chat flex-1 rounded-[2px] border border-white/12 px-4 py-2.5 text-sm font-medium tracking-tight text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-50"
          />
          
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="rounded-[2px] bg-brand-500 p-2 text-white shadow-glow transition-colors hover:bg-brand-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/90 border-t-transparent" />
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
      <div className="text-xs font-semibold text-white/50">{message.display_name || message.username}</div>
      <div className="frosted-titanium rounded-[2rem] px-3 py-2 text-sm font-medium tracking-tight text-white/95">
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
      <div className="frosted-titanium inline-flex max-w-[85%] items-baseline gap-1.5 rounded-[2rem] px-3.5 py-2 shadow-glow">
        <span className="bg-gradient-to-r from-ember-400 via-ember-500 to-cobalt-400 bg-clip-text text-xs font-extrabold tracking-tight text-transparent drop-shadow">
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
        className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cobalt-500 to-ember-500 p-0.5 shadow-glow"
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
            className="group flex touch-manipulation items-center gap-1.5 text-white/60 transition-colors hover:text-ember-400"
          >
            <Heart className={`h-4 w-4 transition-all ${liked ? 'fill-ember-500 text-ember-500' : ''}`} />
            {likes > 0 && (
              <span className={`text-xs font-medium ${liked ? 'text-ember-400' : ''}`}>{likes}</span>
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
