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

    // Recyclage du stream pour éviter le clignotement (Blink)
    let stream = el.srcObject as MediaStream;
    if (!stream) {
      stream = new MediaStream();
      el.srcObject = stream;
    }

    // Nettoyage des anciennes pistes
    stream.getTracks().forEach(t => stream.removeTrack(t));

    // Ajout des nouvelles
    let hasTracks = false;
    if (videoTrack) { stream.addTrack(videoTrack); hasTracks = true; }
    if (audioTrack && !muted) { stream.addTrack(audioTrack); hasTracks = true; }

    if (hasTracks) {
      void el.play().catch(err => console.warn('Autoplay bloqué', err));
    }
  }, [videoTrack, audioTrack, muted]);

  // Correction iOS : Forcer la lecture au retour dans l'application
  useEffect(() => {
    const el = videoRef.current;
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && el && el.srcObject) {
        void el.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

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
