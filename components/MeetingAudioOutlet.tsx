'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PhysicalPeer } from '@/lib/participant-identity';

const AUDIO_HOST_STYLE: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

function SingleRemoteAudio({ track, muted }: { track: MediaStreamTrack; muted: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.srcObject = new MediaStream([track]);
    void el.play().catch((err) => console.warn('[Arena] Audio lecture:', err));
  }, [track]);

  return (
    <audio
      ref={audioRef}
      autoPlay
      playsInline
      muted={muted}
      style={AUDIO_HOST_STYLE}
    />
  );
}

export interface MeetingAudioOutletProps {
  peers: PhysicalPeer[];
  /** Exclure l’audio local (caméra / micro du client courant) */
  localSessionId?: string;
  /** Sessions dont l’audio doit être muté côté lecture (régie, mode débat, etc.) */
  mutedSessionIds?: Set<string>;
}

/**
 * Point unique de lecture des **pistes audio distantes** — ne pas dupliquer dans les tuiles vidéo.
 */
export function MeetingAudioOutlet({ peers, localSessionId, mutedSessionIds }: MeetingAudioOutletProps) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {peers.map((peer) => {
        if (localSessionId != null && peer.sessionId === localSessionId) return null;
        if (!peer.audioTrack) return null;
        const muted = mutedSessionIds?.has(peer.sessionId) ?? false;
        return <SingleRemoteAudio key={peer.sessionId} track={peer.audioTrack} muted={muted} />;
      })}
    </div>
  );
}
