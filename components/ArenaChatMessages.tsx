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
        {messages.map((msg) =>
          isMobile ? (
            <div
              key={msg.id}
              className="mb-1.5 pointer-events-auto w-fit max-w-full leading-tight [content-visibility:auto]"
            >
              <span className={`text-[11px] font-bold mr-2 drop-shadow-[0_1px_2px_rgba(0,0,0,1)] ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <span className="text-[13px] text-white font-medium break-words drop-shadow-md [text-shadow:0_1px_3px_rgba(0,0,0,1),0_0_8px_rgba(0,0,0,0.8)]">
                {msg.content}
              </span>
            </div>
          ) : (
            <div key={msg.id} className="mb-3 [content-visibility:auto]">
              <span className={`block mb-1 ml-2 text-[9px] font-black uppercase tracking-widest ${getUsernameColor(msg.user_name)}`}>
                {msg.user_name}
              </span>
              <div className="inline-block rounded-2xl rounded-tl-sm bg-slate-900/40 backdrop-blur-sm border border-white/10 shadow-lg px-3 py-2 text-[13px] leading-snug text-white/90">
                {msg.content}
              </div>
            </div>
          ),
        )}
        <div ref={endRef} className="h-px w-full shrink-0" />
      </div>
    </div>
  );
}
