'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import type { PhysicalPeer } from '@/lib/participant-identity';

const hiddenAudioStyle: CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  opacity: 0,
  pointerEvents: 'none',
  overflow: 'hidden',
};

function SingleRemoteAudio({ track }: { track: MediaStreamTrack }) {
  const ref = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const stream = new MediaStream([track]);
    el.srcObject = stream;
    void el.play().catch(() => {});
    return () => {
      el.srcObject = null;
    };
  }, [track]);

  return (
    <audio
      ref={ref}
      autoPlay
      playsInline
      style={hiddenAudioStyle}
      aria-hidden
    />
  );
}

export interface MeetingAudioOutletProps {
  peers: readonly PhysicalPeer[];
  localSessionId?: string | null;
}

/**
 * Rendu centralisé du son distant Daily : une balise audio par flux entrant ayant une piste audio.
 */
export function MeetingAudioOutlet({ peers, localSessionId }: MeetingAudioOutletProps) {
  const local = localSessionId ?? '';

  const remotesWithAudio = peers.filter(
    (p) => p.audioTrack !== null && (!local || p.sessionId !== local),
  );

  return (
    <div aria-hidden className="pointer-events-none">
      {remotesWithAudio.map((p) => (
        <SingleRemoteAudio key={p.sessionId} track={p.audioTrack!} />
      ))}
    </div>
  );
}
