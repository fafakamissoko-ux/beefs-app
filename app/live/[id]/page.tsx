'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TikTokStyleArena } from '@/components/TikTokStyleArena';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { normalizeBeefId } from '@/lib/beef-id';
import { userIdsEqual } from '@/lib/user-id-equal';
import { useClientArenaOnboardingGuard } from '@/lib/client-arena-onboarding-guard';
import { fetchBeefVideoTicket } from '@/lib/client/fetch-beef-video-ticket';

type EntryPhase = 'FETCH_TICKET' | 'READY';

export default function LiveBeefRoomPage() {
  const params = useParams();
  const router = useRouter();
  const rawRoom = params.id;
  const roomIdParam = typeof rawRoom === 'string' ? rawRoom : Array.isArray(rawRoom) ? rawRoom[0] ?? '' : '';
  const roomId = normalizeBeefId(roomIdParam) ?? '';

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [entryPhase, setEntryPhase] = useState<EntryPhase>('FETCH_TICKET');

  const [beefEndedInfo, setBeefEndedInfo] = useState<{
    title: string;
    host_name: string;
    started_at?: string;
    ended_at?: string;
  } | null>(null);

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
  const [dailyMeetingToken, setDailyMeetingToken] = useState<string | null>(null);
  const [initialViewerCount, setInitialViewerCount] = useState(0);
  const [beefTitle, setBeefTitle] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [ticketAttempt, setTicketAttempt] = useState(0);

  useClientArenaOnboardingGuard(userId || null);

  useEffect(() => {
    setTicketAttempt(0);
  }, [roomId]);

  useEffect(() => {
    if (roomIdParam.trim() !== '' && !roomId) {
      router.replace('/feed');
    }
  }, [roomIdParam, roomId, router]);

  /** Auth obligatoire sur /live */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        window.location.href = '/login';
        return;
      }
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
      setIsAuthLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isAuthLoaded || !roomId || !userId) return;

    let cancelled = false;
    setEntryPhase('FETCH_TICKET');
    setBeefEndedInfo(null);
    setAccessError(null);
    setDailyRoomUrl(null);
    setDailyMeetingToken(null);

    (async () => {
      const { data: beef, error: beefErr } = await supabase.from('beefs').select('*').eq('id', roomId).single();

      if (cancelled) return;
      if (beefErr || !beef) {
        window.location.href = '/feed';
        return;
      }

      const { fetchUserPublicByIds, displayNameFromPublicRow } = await import('@/lib/fetch-user-public-profile');
      const medRow =
        beef.mediator_id
          ? (await fetchUserPublicByIds(supabase, [beef.mediator_id], 'id, username, display_name, avatar_url')).get(
              beef.mediator_id,
            )
          : undefined;

      if (beef.status === 'ended' || beef.status === 'cancelled' || beef.status === 'replay') {
        setBeefEndedInfo({
          title: beef.title || 'Beef',
          host_name: displayNameFromPublicRow(medRow, 'Médiateur'),
          started_at: beef.started_at,
          ended_at: beef.ended_at,
        });
        setEntryPhase('READY');
        return;
      }

      setHost({
        id: beef.mediator_id,
        name: displayNameFromPublicRow(medRow, 'Médiateur'),
        isHost: true,
        videoEnabled: true,
        audioEnabled: true,
        badges: [],
      });

      setBeefTitle(beef.title || '');
      setInitialViewerCount(beef.viewer_count || 0);

      if (userIdsEqual(beef.mediator_id, userId)) {
        setUserRole('mediator');
      } else {
        const uidNorm = userId.trim().toLowerCase();
        const { data: participation } = await supabase
          .from('beef_participants')
          .select('role, invite_status, is_main')
          .eq('beef_id', roomId)
          .eq('user_id', uidNorm)
          .maybeSingle();

        if (participation && participation.invite_status === 'accepted') {
          setUserRole('challenger');
        } else {
          setUserRole('viewer');
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setAccessError('Session expirée — reconnecte-toi.');
        setEntryPhase('READY');
        return;
      }

      const ticket = await fetchBeefVideoTicket(roomId, session.access_token);

      if (cancelled) return;

      if (!ticket.ok) {
        setAccessError(ticket.message);
        setEntryPhase('READY');
        return;
      }

      setDailyRoomUrl(ticket.dailyRoomUrl);
      setDailyMeetingToken(ticket.dailyToken);
      setEntryPhase('READY');
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, roomId, userId, ticketAttempt]);

  const retryTicket = useCallback(() => {
    setAccessError(null);
    setDailyRoomUrl(null);
    setDailyMeetingToken(null);
    setTicketAttempt((a) => a + 1);
  }, []);

  const handleShare = () => {
    const url = `${window.location.origin}/live/${roomId}`;
    if (navigator.share) {
      navigator.share({ title: `Beef: ${beefTitle}`, text: 'Regarde ce beef en direct sur Beefs!', url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  if (beefEndedInfo) {
    const duration =
      beefEndedInfo.started_at && beefEndedInfo.ended_at
        ? Math.floor(
            (new Date(beefEndedInfo.ended_at).getTime() - new Date(beefEndedInfo.started_at).getTime()) / 60000,
          )
        : 0;

    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh flex-col items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm space-y-6 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gray-800">
            <Clock className="h-8 w-8 text-gray-400" />
          </div>
          <div>
            <h2 className="mb-1 text-xl font-bold text-white">Beef terminé</h2>
            <p className="font-semibold text-brand-400">{beefEndedInfo.title}</p>
            <p className="mt-1 text-sm text-gray-500">Médié par {beefEndedInfo.host_name}</p>
            {duration > 0 && <p className="mt-2 text-xs text-gray-600">Durée : {duration} min</p>}
          </div>
          <p className="text-sm text-gray-400">
            Ce beef est terminé. Tu peux en créer un nouveau ou regarder les prochains lives.
          </p>
          <Link
            href={`/beef/${roomId}/summary`}
            className="block w-full rounded-xl bg-white/10 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-white/15"
          >
            Voir le résumé détaillé
          </Link>
          <motion.button
            whileTap={{ scale: 0.96 }}
            type="button"
            onClick={() => router.push('/feed')}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au feed
          </motion.button>
        </motion.div>
      </div>
    );
  }

  if (!isAuthLoaded) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-red-600" />
          <p className="text-sm text-white/80">Session…</p>
        </div>
      </div>
    );
  }

  if (entryPhase === 'FETCH_TICKET') {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-plasma-500" />
        </div>
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh flex-col items-center justify-center bg-black p-6">
        <p className="mb-4 max-w-sm text-center text-sm text-amber-200/90">{accessError}</p>
        <button
          type="button"
          onClick={retryTicket}
          className="rounded-xl bg-plasma-500 px-6 py-3 text-sm font-bold text-white hover:bg-plasma-400"
        >
          Réessayer
        </button>
        <button type="button" onClick={() => router.push('/feed')} className="mt-4 text-sm text-white/60 underline">
          Retour au feed
        </button>
      </div>
    );
  }

  const ticketOk =
    typeof dailyRoomUrl === 'string' &&
    dailyRoomUrl.length > 0 &&
    typeof dailyMeetingToken === 'string' &&
    dailyMeetingToken.length > 0;

  if (!ticketOk) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black">
        <p className="text-sm text-white/70">Accès vidéo indisponible.</p>
      </div>
    );
  }

  return (
    <div className="fixed left-1/2 top-14 z-40 h-[calc(100dvh-3.5rem)] max-lg:w-full max-lg:max-w-md -translate-x-1/2 overflow-hidden lg:left-64 lg:right-0 lg:top-0 lg:h-dvh lg:translate-x-0">
      <TikTokStyleArena
        host={host}
        roomId={roomId}
        userId={userId}
        userName={userName}
        userRole={userRole}
        viewerCount={initialViewerCount}
        debateTitle={beefTitle}
        dailyRoomUrl={dailyRoomUrl}
        dailyMeetingToken={dailyMeetingToken}
        onReaction={() => {}}
        onShare={handleShare}
      />
    </div>
  );
}
