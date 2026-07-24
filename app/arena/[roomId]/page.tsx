'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { TikTokStyleArena } from '@/components/TikTokStyleArena';
import { supabase } from '@/lib/supabase/client';
import { motion } from 'framer-motion';
import { Clock, ArrowLeft, Camera, LogIn, Mic, Play, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { normalizeBeefId } from '@/lib/beef-id';
import { userIdsEqual } from '@/lib/user-id-equal';
import { fetchBeefVideoTicket } from '@/lib/client/fetch-beef-video-ticket';

type EntryPhase = 'FETCH_TICKET' | 'READY';

export default function ArenaPage() {
  const params = useParams();
  const router = useRouter();
  const rawRoom = params.roomId;
  const roomIdParam = typeof rawRoom === 'string' ? rawRoom : Array.isArray(rawRoom) ? rawRoom[0] ?? '' : '';
  const roomId = normalizeBeefId(roomIdParam) ?? '';

  const [userId, setUserId] = useState<string>('');
  const [userName, setUserName] = useState<string>('');
  const [isAuthLoaded, setIsAuthLoaded] = useState(false);
  const [entryPhase, setEntryPhase] = useState<EntryPhase>('FETCH_TICKET');

  const [beefEndedInfo, setBeefEndedInfo] = useState<{
    title: string;
    host_name: string;
    status: string;
    video_url?: string | null;
    started_at?: string;
    ended_at?: string;
  } | null>(null);

  const [isHost, setIsHost] = useState(false);
  const [userRole, setUserRole] = useState<'mediator' | 'challenger' | 'viewer' | 'spectator'>('spectator');

  const [host, setHost] = useState<{
    id: string;
    name: string;
    isHost: boolean;
    videoEnabled: boolean;
    audioEnabled: boolean;
    badges: string[];
  } | null>(null);

  const [dailyRoomUrl, setDailyRoomUrl] = useState<string | null>(null);
  const [dailyMeetingToken, setDailyMeetingToken] = useState<string | null>(null);
  const [initialViewerCount, setInitialViewerCount] = useState(0);
  const [beefTitle, setBeefTitle] = useState('');
  const [accessError, setAccessError] = useState<string | null>(null);
  const [ticketAttempt, setTicketAttempt] = useState(0);
  const [isStagingPassed, setIsStagingPassed] = useState(false);

  useEffect(() => {
    setIsStagingPassed(false);
    setTicketAttempt(0);
  }, [roomId]);

  /** Mouchard d'enregistrement des vues (Phase 3) */
  useEffect(() => {
    if (!dailyRoomUrl || !dailyMeetingToken || !roomId || !userId) return;

    void (async () => {
      const { error } = await supabase.rpc('record_beef_view', { p_beef_id: roomId });
      if (error) console.error(error);
    })();
  }, [dailyRoomUrl, dailyMeetingToken, roomId, userId]);

  useEffect(() => {
    if (roomIdParam.trim() !== '' && !roomId) {
      router.replace('/feed');
    }
  }, [roomIdParam, roomId, router]);

  /** État 1 — WAIT_AUTH : résolution Supabase uniquement. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
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
        setUserId('');
        setUserName('');
      }
      setIsAuthLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** État 2 — contexte beef ; billet vidéo uniquement si session valide (hard auth wall). */
  useEffect(() => {
    if (!isAuthLoaded || !roomId) return;

    let cancelled = false;
    setEntryPhase('FETCH_TICKET');
    setBeefEndedInfo(null);
    setAccessError(null);
    setDailyRoomUrl(null);
    setDailyMeetingToken(null);

    (async () => {
      const { data: beef, error: beefErr } = await supabase
        .from('beefs')
        .select('id, title, status, mediator_id, created_by, video_url, started_at, ended_at, viewer_count')
        .eq('id', roomId)
        .single();

      if (cancelled) return;
      if (beefErr || !beef) {
        router.push('/feed');
        return;
      }

      const { fetchUserPublicByIds, displayNameFromPublicRow } = await import('@/lib/fetch-user-public-profile');

      // Manifesto sans Ref assigné : l'initiateur joue le rôle d'hôte technique
      const effectiveHostId: string = beef.mediator_id ?? beef.created_by ?? '';
      const lookupIds = [...new Set([beef.mediator_id, beef.created_by].filter(Boolean) as string[])];
      const hostPubMap =
        lookupIds.length > 0
          ? await fetchUserPublicByIds(supabase, lookupIds, 'id, username, display_name, avatar_url')
          : new Map();
      const medRow = beef.mediator_id ? hostPubMap.get(beef.mediator_id) : undefined;
      const authorRow = beef.created_by ? hostPubMap.get(beef.created_by) : undefined;
      const hostDisplayName = beef.mediator_id
        ? displayNameFromPublicRow(medRow, 'Ref')
        : displayNameFromPublicRow(authorRow, 'Initiateur');

      if (
        beef.status === 'ended' ||
        beef.status === 'cancelled' ||
        beef.status === 'replay' ||
        beef.status === 'completed'
      ) {
        setBeefEndedInfo({
          title: beef.title || 'Beef',
          host_name: hostDisplayName,
          status: beef.status,
          video_url: beef.video_url,
          started_at: beef.started_at,
          ended_at: beef.ended_at,
        });
        setEntryPhase('READY');
        return;
      }

      setHost({
        id: effectiveHostId,
        name: hostDisplayName,
        isHost: true,
        videoEnabled: true,
        audioEnabled: true,
        badges: [],
      });

      setBeefTitle(beef.title || '');
      setInitialViewerCount(beef.viewer_count || 0);

      const uidTrim = userId.trim();
      if (!uidTrim) {
        setEntryPhase('READY');
        return;
      }

      setIsHost(userIdsEqual(effectiveHostId, uidTrim));

      if (userIdsEqual(effectiveHostId, uidTrim)) {
        setUserRole('mediator');
      }

      const { data: { user: authUser }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !authUser) {
        setAccessError('Session expirée — reconnecte-toi.');
        setEntryPhase('READY');
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const ticket = await fetchBeefVideoTicket(roomId, session?.access_token ?? null);

      if (cancelled) return;

      if (!ticket.ok) {
        setAccessError(ticket.message);
        setEntryPhase('READY');
        return;
      }

      if (ticket.role === 'spectator') {
        setUserRole('viewer');
      } else if (ticket.role === 'participant') {
        setUserRole('challenger');
      } else if (ticket.role === 'mediator') {
        setUserRole('mediator');
      }

      setDailyRoomUrl(ticket.dailyRoomUrl);
      setDailyMeetingToken(ticket.dailyToken);
      setEntryPhase('READY');
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthLoaded, roomId, userId, ticketAttempt]);

  const handleShare = () => {
    const url = `${window.location.origin}/arena/${roomId}`;
    if (navigator.share) {
      navigator.share({ title: `Beef: ${beefTitle}`, text: 'Regarde ce beef en live sur Beefs!', url });
    } else {
      navigator.clipboard.writeText(url);
    }
  };

  const retryTicket = useCallback(() => {
    setAccessError(null);
    setDailyRoomUrl(null);
    setDailyMeetingToken(null);
    setTicketAttempt((a) => a + 1);
  }, []);

  if (beefEndedInfo) {
    const isReplayAvailable = beefEndedInfo.status === 'replay' && !!beefEndedInfo.video_url;
    const duration =
      beefEndedInfo.started_at && beefEndedInfo.ended_at
        ? Math.floor(
            (new Date(beefEndedInfo.ended_at).getTime() - new Date(beefEndedInfo.started_at).getTime()) /
              60000,
          )
        : 0;

    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh flex-col items-center justify-center p-4 sm:p-6 bg-black/90 backdrop-blur-xl">
        {isReplayAvailable ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-5xl space-y-4"
          >
            <div className="w-full aspect-video rounded-2xl border border-white/10 bg-black shadow-2xl overflow-hidden relative">
              <video
                controls
                src={beefEndedInfo.video_url!}
                className="w-full h-full object-contain bg-black"
                playsInline
                autoPlay
              />
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-950/50 backdrop-blur-md p-4 rounded-2xl border border-white/10">
              <div>
                <h2 className="text-xl font-bold text-white">{beefEndedInfo.title}</h2>
                <p className="text-sm text-gray-400">Médié par {beefEndedInfo.host_name}</p>
              </div>
              <div className="flex gap-3">
                <Link
                  href={`/beef/${roomId}/summary`}
                  className="px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors text-center"
                >
                  Verdict & Résumé
                </Link>
                <button
                  type="button"
                  onClick={() => router.push('/feed')}
                  className="px-5 py-2.5 rounded-xl bg-white text-black font-bold text-sm hover:bg-gray-200 transition-colors text-center"
                >
                  Fermer
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-sm text-center space-y-6"
          >
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gray-800 border border-white/10 flex items-center justify-center">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">
                {beefEndedInfo.status === 'cancelled' ? 'Séance annulée' : 'En cours de traitement'}
              </h2>
              <p className="text-brand-400 font-semibold">{beefEndedInfo.title}</p>
              <p className="text-sm text-gray-500 mt-1">Médié par {beefEndedInfo.host_name}</p>
              {duration > 0 && <p className="text-xs text-gray-600 mt-2">Durée : {duration} min</p>}
            </div>
            <p className="text-sm text-gray-400">
              {beefEndedInfo.status === 'ended' || beefEndedInfo.status === 'completed'
                ? "La séance est levée. Le replay sera disponible d'ici quelques minutes."
                : 'Cette séance a été annulée ou est terminée.'}
            </p>
            <Link
              href={`/beef/${roomId}/summary`}
              className="block w-full py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm transition-colors text-center"
            >
              Voir le résumé détaillé
            </Link>
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="button"
              onClick={() => router.push('/feed')}
              className="w-full py-3 rounded-xl bg-brand-500 text-white font-semibold text-sm hover:bg-brand-600 transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Retour au feed
            </motion.button>
          </motion.div>
        )}
      </div>
    );
  }

  if (!isAuthLoaded) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black/20 backdrop-blur-sm">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-red-600" />
          <p className="text-sm text-white/80">Session…</p>
        </div>
      </div>
    );
  }

  if (entryPhase === 'FETCH_TICKET') {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black/20 backdrop-blur-sm">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-cyan-500" />
        </div>
      </div>
    );
  }

  const loginNext = `/arena/${roomId}`;

  // READY — mur d’auth : pas de billet ni d’arène sans compte (beef live uniquement ; ended géré au-dessus)
  if (entryPhase === 'READY' && !beefEndedInfo && !userId.trim() && !accessError) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh flex-col items-center justify-center bg-black/20 backdrop-blur-sm p-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm space-y-6 text-center"
        >
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
            <LogIn className="h-8 w-8 text-cyan-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Connexion requise</h1>
            <p className="mt-2 text-sm text-white/60">
              Connecte-toi pour accéder au direct et obtenir ton billet vidéo.
            </p>
          </div>
          <Link
            href={`/login?next=${encodeURIComponent(loginNext)}`}
            className="block w-full rounded-xl bg-cyan-500 py-3 text-center text-sm font-bold text-white transition-colors hover:bg-cyan-400"
          >
            Se connecter
          </Link>
          <button
            type="button"
            onClick={() => router.push('/feed')}
            className="w-full text-sm text-white/50 underline transition-colors hover:text-white/80"
          >
            Retour au feed
          </button>
        </motion.div>
      </div>
    );
  }

  // READY — erreur billet
  if (accessError) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh flex-col items-center justify-center bg-black/20 backdrop-blur-sm p-6">
        <p className="mb-4 max-w-sm text-center text-sm text-amber-200/90">{accessError}</p>
        <button
          type="button"
          onClick={retryTicket}
          className="rounded-xl bg-cyan-500 px-6 py-3 text-sm font-bold text-white hover:bg-cyan-400"
        >
          Réessayer
        </button>
        <button
          type="button"
          onClick={() => router.push('/feed')}
          className="mt-4 text-sm text-white/60 underline"
        >
          Retour au feed
        </button>
      </div>
    );
  }

  // READY — billet + contexte valides ; sas matériel médiateur/challenger uniquement
  const ticketOk =
    typeof dailyRoomUrl === 'string' &&
    dailyRoomUrl.length > 0 &&
    typeof dailyMeetingToken === 'string' &&
    dailyMeetingToken.length > 0;

  if (!ticketOk) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black/20 backdrop-blur-sm">
        <p className="text-sm text-white/70">Accès vidéo indisponible.</p>
      </div>
    );
  }

  const needsStaging = userRole === 'mediator' || userRole === 'challenger';

  if (needsStaging && !isStagingPassed) {
    return (
      <div className="fixed inset-0 z-[9999] flex h-dvh w-screen flex-col items-center justify-center bg-black/20 p-6 text-center backdrop-blur-sm">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-600/20 via-transparent to-transparent" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 p-8 shadow-[0_0_50px_rgba(0,240,255,0.15)] backdrop-blur-2xl"
        >
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
              <ShieldAlert className="h-8 w-8 text-cyan-400" />
            </div>
            <h2 className="text-2xl font-black uppercase tracking-widest text-white">Check Matériel</h2>
            <p className="text-sm font-semibold text-white/50">
              Tu entres dans l&apos;Agora en tant que{' '}
              <span className="uppercase text-cyan-400">
                {userRole === 'mediator' ? 'Ref' : userRole === 'challenger' ? 'Combattant' : userRole}
              </span>
              .
            </p>
          </div>

          <div className="w-full space-y-4">
            <div className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <Camera className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-bold text-white">Caméra</span>
                  <span className="text-xs text-white/40">Le navigateur te demandera l&apos;accès</span>
                </div>
              </div>
            </div>
            <div className="flex w-full items-center justify-between rounded-2xl border border-white/5 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10">
                  <Mic className="h-5 w-5 text-white" />
                </div>
                <div className="flex flex-col text-left">
                  <span className="font-bold text-white">Microphone</span>
                  <span className="text-xs text-white/40">Active-le dès ton entrée</span>
                </div>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsStagingPassed(true)}
            className="group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl bg-cyan-500 px-6 py-4 text-lg font-black text-white shadow-[0_0_20px_rgba(0,240,255,0.3)] transition-all hover:scale-[1.02] hover:bg-cyan-400 active:scale-95"
          >
            <div className="relative z-10 flex items-center gap-2">
              <Play className="h-5 w-5" /> JE SUIS PRÊT
            </div>
            <div className="pointer-events-none absolute inset-0 z-0 translate-x-[-100%] bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[shimmer_1.5s_infinite]" />
          </button>
        </motion.div>
      </div>
    );
  }

  if (!host) {
    return (
      <div className="fixed inset-0 z-40 flex min-h-dvh items-center justify-center bg-black/20 backdrop-blur-sm">
        <div className="text-center text-white">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-cyan-500" />
        </div>
      </div>
    );
  }

  // État 3 — ARENA_READY : arène avec URL + jeton validés
  return (
    <div className="fixed inset-0 z-[9999] h-dvh w-screen overflow-hidden bg-transparent">
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
