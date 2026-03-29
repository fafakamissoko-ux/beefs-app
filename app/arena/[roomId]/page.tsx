'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { TikTokStyleArena } from '@/components/TikTokStyleArena';
import { supabase } from '@/lib/supabase/client';

export default function ArenaPage() {
  const params = useParams();
  const roomId = params.roomId as string;

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
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

      if (beef.status === 'ended' || beef.status === 'cancelled') {
        window.location.href = '/feed';
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
      if (beef.mediator_id === userId) {
        setUserRole('mediator');
      } else {
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', userId)
          .maybeSingle();

        if (participation && participation.invite_status === 'accepted') {
          setUserRole('challenger');
        } else {
          setUserRole('viewer');
        }
      }

      await ensureDailyRoom(roomId);
    };

    loadRoomData();
  }, [roomId, userId]);

  const ensureDailyRoom = async (beefId: string) => {
    const roomName = `beef-${beefId.replace(/-/g, '').slice(0, 32)}`;
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
        body: JSON.stringify({ roomName, privacy: 'public', maxParticipants: 50 }),
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
      />
    </div>
  );
}
