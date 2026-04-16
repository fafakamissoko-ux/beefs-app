'use client';

import { useEffect, useRef } from 'react';

interface ParticipantVideoProps {
  videoTrack: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
}

export function ParticipantVideo({ videoTrack, audioTrack, muted = false, className = '', mirror = false }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    const tracks: MediaStreamTrack[] = [];
    if (videoTrack) tracks.push(videoTrack);
    if (audioTrack && !muted) tracks.push(audioTrack);

    if (tracks.length > 0) {
      const stream = new MediaStream(tracks);
      el.srcObject = stream;

      // FORÇAGE DU MOTEUR : On ordonne au navigateur de lire le flux injecté
      el.play().catch((err) => {
        console.warn('⚠️ Lecture automatique bloquée par le navigateur (Autoplay Policy) :', err);
        // Note : Si l'utilisateur n'a pas cliqué sur la page avant, le navigateur bloque le son.
      });
    } else {
      el.srcObject = null;
    }

    return () => {
      el.srcObject = null;
    };
  }, [videoTrack, audioTrack, muted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? '[transform:scaleX(-1)]' : ''} bg-transparent object-cover`}
    />
  );
}
