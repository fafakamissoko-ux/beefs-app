'use client';

import { useLayoutEffect, useRef } from 'react';
import { useArenaVolatileStore } from '@/lib/stores/arenaVolatileStore';

const getUsernameColor = (username: string) => {
  const colors = [
    'text-red-400',
    'text-orange-400',
    'text-amber-400',
    'text-yellow-400',
    'text-lime-400',
    'text-green-400',
    'text-emerald-400',
    'text-teal-400',
    'text-cyan-400',
    'text-sky-400',
    'text-blue-400',
    'text-indigo-400',
    'text-violet-400',
    'text-purple-400',
    'text-fuchsia-400',
    'text-rose-400',
  ];
  let hash = 5381;
  for (let i = 0; i < username.length; i++) {
    hash = (hash * 33) ^ username.charCodeAt(i);
  }
  return colors[(hash >>> 0) % colors.length];
};

interface ArenaChatMessagesProps {
  isMobile?: boolean;
}

export function ArenaChatMessages({ isMobile }: ArenaChatMessagesProps) {
  const messages = useArenaVolatileStore((s) => s.messages);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'auto', block: 'end' });
    }
  }, [messages]);

  const containerClasses = isMobile
    ? 'pointer-events-auto w-fit max-w-[55vw] h-full flex-1 overflow-y-auto [-webkit-overflow-scrolling:touch] px-3 mb-2 flex flex-col hide-scrollbar mask-image-fade-top'
    : 'flex-1 overflow-y-auto pl-2 pr-4 py-2 hide-scrollbar mask-image-fade-top';

  return (
    <div ref={scrollRef} className={containerClasses}>
      <div className="mt-auto flex flex-col justify-end">
        {messages.map((msg) => (
          <div key={msg.id} className="mb-2.5 [content-visibility:auto]">
            {/* Rendu Cadeau Premium (Ambré) */}
            {msg.type === 'gift' ? (
              <div className="inline-block rounded-2xl rounded-tl-sm bg-gradient-to-br from-amber-500/20 to-amber-900/20 backdrop-blur-md border border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)] px-3 py-2">
                <span className={`inline-block mr-2 text-[10px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}>
                  {msg.user_name}
                </span>
                <span className="text-[13px] font-bold leading-snug text-amber-100 drop-shadow-md">
                  {msg.content}
                </span>
              </div>
            ) : (
              /* Rendu Message Standard (Pilule Pseudo + Texte flottant) */
              <div className="flex flex-col items-start gap-0.5">
                <span className={`inline-flex px-2 py-0.5 rounded-full bg-slate-900/60 backdrop-blur-md border border-white/10 shadow-sm text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}>
                  {msg.user_name}
                </span>
                <span className={`ml-1 text-[13px] font-medium leading-snug text-white/90 drop-shadow-md ${isMobile ? '[text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]' : ''}`}>
                  {msg.content}
                </span>
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} className="h-px w-full shrink-0" />
      </div>
    </div>
  );
}
