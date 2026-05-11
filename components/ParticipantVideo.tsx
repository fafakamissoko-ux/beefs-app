'use client';

import { useEffect, useRef } from 'react';

export interface ParticipantVideoProps {
  videoTrack: MediaStreamTrack | null;
  className?: string;
  mirror?: boolean;
  /**
   * Conservé uniquement pour compatibilité avec les callers existants (ignoré).
   * L’audio distant passe par `MeetingAudioOutlet`.
   */
  muted?: boolean;
}

/**
 * Couche **strictement visuelle** : une `<video>` muette ; aucune piste audio.
 */
export function ParticipantVideo({
  videoTrack,
  className = '',
  mirror = false,
}: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (videoTrack) {
      el.srcObject = new MediaStream([videoTrack]);
      void el.play().catch((err) => console.warn('[Arena] Vidéo autoplay:', err));
    } else {
      el.srcObject = null;
    }
  }, [videoTrack]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const el = videoRef.current;
      if (el?.srcObject) void el.play().catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      controls={false}
      className={`${className} ${mirror ? 'scale-x-[-1]' : ''}`}
    />
  );
}
