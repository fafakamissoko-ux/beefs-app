'use client';

import { useState, useEffect } from 'react';
import { Users, ArrowRight, Crown } from 'lucide-react';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';

interface Challenger {
  id: string;
  user_id: string;
  user_name: string;
  position: number;
  status: 'waiting' | 'active' | 'done';
}

interface ChallengerQueueProps {
  roomId: string;
  userId: string;
  userName: string;
  isHost: boolean;
}

export function ChallengerQueue({ roomId, userId, userName, isHost }: ChallengerQueueProps) {
  const [queue, setQueue] = useState<Challenger[]>([]);
  const [inQueue, setInQueue] = useState(false);

  useEffect(() => {
    // Load initial queue
    loadQueue();

    // Subscribe to queue changes
    const channel = supabase
      .channel(`room_${roomId}_queue`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenger_queue',
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          loadQueue();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [roomId]);

  const loadQueue = async () => {
    const { data } = await supabase
      .from('challenger_queue')
      .select('*')
      .eq('room_id', roomId)
      .eq('status', 'waiting')
      .order('position', { ascending: true });

    if (data) {
      setQueue(data as Challenger[]);
      setInQueue(data.some((c: Challenger) => c.user_id === userId));
    }
  };

  const joinQueue = async () => {
    const maxPosition = queue.length > 0 ? Math.max(...queue.map(c => c.position)) : 0;
    
    await supabase.from('challenger_queue').insert({
      room_id: roomId,
      user_id: userId,
      user_name: userName,
      position: maxPosition + 1,
      status: 'waiting',
    });
  };

  const nextChallenger = async () => {
    if (queue.length === 0 || !isHost) return;

    const next = queue[0];
    
    // Mark current as active
    await supabase
      .from('challenger_queue')
      .update({ status: 'active' })
      .eq('id', next.id);

    // Update room with current challenger
    await supabase
      .from('rooms')
      .update({ current_challenger_id: next.user_id })
      .eq('id', roomId);
  };

  return (
    <div className="bg-arena-gray h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-arena-dark">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-arena-blue" />
            <h3 className="font-bold">FILE D'ATTENTE</h3>
          </div>
          <div className="bg-arena-blue/20 text-arena-blue px-3 py-1 rounded-full text-sm font-bold">
            {queue.length}
          </div>
        </div>

        {!inQueue && !isHost && (
          <button
            onClick={joinQueue}
            className="w-full bg-arena-blue hover:bg-arena-blue/80 text-arena-dark font-bold py-3 rounded-lg transition-all transform hover:scale-105"
          >
            Rejoindre la Queue
          </button>
        )}

        {isHost && queue.length > 0 && (
          <button
            onClick={nextChallenger}
            className="w-full bg-arena-red hover:bg-arena-red/80 text-white font-bold py-3 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-5 h-5" />
            Prochain Challenger
          </button>
        )}
      </div>

      {/* Queue List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {queue.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>Aucun challenger en attente</p>
          </div>
        ) : (
          queue.map((challenger, index) => (
            <motion.div
              key={challenger.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className={`bg-arena-dark p-3 rounded-lg border ${
                challenger.user_id === userId 
                  ? 'border-arena-blue' 
                  : 'border-arena-darker'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index === 0 
                    ? 'bg-arena-blue text-arena-dark' 
                    : 'bg-arena-darker text-gray-500'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1">
                  <div className="font-bold text-sm">{challenger.user_name}</div>
                  {index === 0 && (
                    <div className="text-xs text-arena-blue">Suivant !</div>
                  )}
                </div>
                {challenger.user_id === userId && (
                  <div className="text-xs text-arena-blue">C'est vous</div>
                )}
              </div>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
