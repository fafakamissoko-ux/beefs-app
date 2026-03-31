'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TikTokStyleArena } from '@/components/TikTokStyleArena';
import { supabase } from '@/lib/supabase/client';
import { beefDailyRoomName } from '@/lib/beef-daily-room';
import { markBeefWatchStarted } from '@/lib/beef-view-local';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft } from 'lucide-react';

export default function ArenaPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [beefEndedInfo, setBeefEndedInfo] = useState<{
    title: string;
    host_name: string;
    started_at?: string;
    ended_at?: string;
  } | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [userRole, setUserRole] = useState<'mediator' | 'challenger' | 'viewer'>('viewer');

  const [host, setHost] = useState({
    id: 'host_1',
    name: 'Host Principal',
    isHost: true,
    videoEnabled: true,
    audioEnabled: true,
    badges: [] as string[],
  });

  const [dailyRoomUrl, setDailyRoomUrl] = useState<string | null>(null);
  const [initialViewerCount, setInitialViewerCount] = useState(0);
  const [beefTitle, setBeefTitle] = useState('');
  const [previewStartedAt, setPreviewStartedAt] = useState<string | null>(null);
  const [freePreviewMinutes, setFreePreviewMinutes] = useState(10);
  const [continuationPricePoints, setContinuationPricePoints] = useState(0);
  const [hasPaidContinuation, setHasPaidContinuation] = useState(false);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: userData } = await supabase
          .from('users')
          .select('username, display_name')
          .eq('id', user.id)
          .single();
        if (userData) {
          setUserName(userData.display_name || userData.username || 'Utilisateur');
        } else {
          setUserName('Utilisateur');
        }
      } else {
        window.location.href = '/login';
      }
    };
    loadUser();
  }, []);

  const roomLoadedRef = useRef(false);

  useEffect(() => {
    if (!userId || roomLoadedRef.current) return;
    roomLoadedRef.current = true;

    const loadRoomData = async () => {
      const { data: beef } = await supabase
        .from('beefs')
        .select('*, users!beefs_mediator_id_fkey(username, display_name, avatar_url)')
        .eq('id', roomId)
        .single();

      if (!beef) {
        window.location.href = '/feed';
        return;
      }

      const fp = (beef as any).free_preview_minutes;
      setFreePreviewMinutes(typeof fp === 'number' ? fp : 10);
      setContinuationPricePoints((beef as any).price ?? 0);
      setPreviewStartedAt((beef as any).started_at ?? null);

      const { data: accessRow } = await supabase
        .from('beef_access')
        .select('id')
        .eq('beef_id', roomId)
        .eq('user_id', userId)
        .maybeSingle();
      setHasPaidContinuation(!!accessRow);

      if (beef.status === 'ended' || beef.status === 'cancelled') {
        const med = beef.users as any;
        setBeefEndedInfo({
          title: beef.title || 'Beef',
          host_name: med?.display_name || med?.username || 'Médiateur',
          started_at: beef.started_at,
          ended_at: beef.ended_at,
        });
        return;
      }

      const mediator = beef.users as any;
      setHost({
        id: beef.mediator_id,
        name: mediator?.display_name || mediator?.username || 'Médiateur',
        isHost: true,
        videoEnabled: true,
        audioEnabled: true,
        badges: [],
      });

      setBeefTitle(beef.title || '');
      setInitialViewerCount(beef.viewer_count || 0);
      setIsHost(beef.mediator_id === userId);

      // Determine user role
      let resolvedRole: 'mediator' | 'challenger' | 'viewer' = 'viewer';
      if (beef.mediator_id === userId) {
        resolvedRole = 'mediator';
        setUserRole('mediator');
      } else {
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', userId)
          .maybeSingle();

        if (participation && participation.invite_status === 'accepted') {
          resolvedRole = 'challenger';
          setUserRole('challenger');
        } else {
          resolvedRole = 'viewer';
          setUserRole('viewer');
        }
      }

      const pricePts = (beef as { price?: number }).price ?? 0;
      if (beef.status === 'live' && pricePts > 0 && resolvedRole === 'viewer') {
        markBeefWatchStarted(roomId);
      }

      await ensureDailyRoom(roomId);
    };

    loadRoomData();
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`arena_beef_sync_${roomId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'beefs', filter: `id=eq.${roomId}` },
        (payload: { new?: { price?: number; started_at?: string } }) => {
          const n = payload.new;
          if (typeof n?.price === 'number') setContinuationPricePoints(n.price);
          if (n?.started_at) setPreviewStartedAt(n.started_at);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId]);

  const ensureDailyRoom = async (beefId: string) => {
    const roomName = beefDailyRoomName(beefId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) {
        authHeaders['Authorization'] = `Bearer ${session.access_token}`;
      }

      const getRes = await fetch(`/api/daily/rooms?name=${roomName}`, { headers: authHeaders });
      const getData = await getRes.json();
      if (getData.success && getData.room?.url) {
        setDailyRoomUrl(getData.room.url);
        return;
      }

      const createRes = await fetch('/api/daily/rooms', {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify({ roomName, privacy: 'private', maxParticipants: 50 }),
      });
      const createData = await createRes.json();
      if (createData.success && createData.room?.url) {
        setDailyRoomUrl(createData.room.url);
      }
    } catch (err) {
      console.error('Error ensuring Daily room:', err);
    }
  };

  const handleShare = () => {
    const url = `${window.location.origin}/arena/${roomId}`;
    if (navigator.share) {
      navigator.share({ title: `Beef: ${beefTitle}`, text: 'Regarde ce beef en live sur Beefs!', url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  // Show ended page instead of redirecting
  if (beefEndedInfo) {
    const duration = beefEndedInfo.started_at && beefEndedInfo.ended_at
      ? Math.floor((new Date(beefEndedInfo.ended_at).getTime() - new Date(beefEndedInfo.started_at).getTime()) / 60000)
      : 0;

    return (
      <div className="fixed inset-0 bg-gradient-to-b from-gray-950 via-gray-900 to-black flex flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm text-center space-y-6"
        >
          <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-800 border border-white/10 flex items-center justify-center">
            <Clock className="w-8 h-8 text-gray-400" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Beef terminé</h2>
            <p className="text-brand-400 font-semibold">{beefEndedInfo.title}</p>
            <p className="text-sm text-gray-500 mt-1">Médié par {beefEndedInfo.host_name}</p>
            {duration > 0 && <p className="text-xs text-gray-600 mt-2">Durée : {duration} min</p>}
          </div>
          <p className="text-sm text-gray-400">
            Ce beef est terminé. Tu peux en créer un nouveau ou regarder les prochains lives.
          </p>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => router.replace('/feed')}
            className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Retour au feed
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (!userId || !userName) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-white text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-orange-500 mx-auto mb-4" />
          <p>Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 top-16 overflow-hidden">
      <TikTokStyleArena
        host={host}
        roomId={roomId}
        userId={userId}
        userName={userName}
        userRole={userRole}
        viewerCount={initialViewerCount}
        debateTitle={beefTitle}
        dailyRoomUrl={dailyRoomUrl}
        onReaction={() => {}}
        onShare={handleShare}
        previewStartedAt={previewStartedAt}
        freePreviewMinutes={freePreviewMinutes}
        continuationPricePoints={continuationPricePoints}
        hasPaidContinuation={hasPaidContinuation}
        onContinuationPaid={() => setHasPaidContinuation(true)}
      />
    </div>
  );
}
