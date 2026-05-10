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
  const audioRef = useRef<HTMLAudioElement>(null);

  // 1. GESTION VIDÉO : Toujours muette pour garantir l'autoplay, flux neuf à chaque fois
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (videoTrack) {
      el.srcObject = new MediaStream([videoTrack]);
      void el.play().catch(err => console.warn('[Vidéo] Autoplay bloqué:', err));
    } else {
      el.srcObject = null;
    }
  }, [videoTrack]);

  // 2. GESTION AUDIO : Balise séparée, gère le son indépendamment
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    if (audioTrack && !muted) {
      el.srcObject = new MediaStream([audioTrack]);
      void el.play().catch(err => console.warn('[Audio] Autoplay bloqué:', err));
    } else {
      el.srcObject = null;
    }
  }, [audioTrack, muted]);

  // 3. CORRECTION iOS : Relance après mise en veille
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (videoRef.current && videoRef.current.srcObject) {
          void videoRef.current.play().catch(() => {});
        }
        if (audioRef.current && audioRef.current.srcObject) {
          void audioRef.current.play().catch(() => {});
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={true}
        className={`${className} ${mirror ? 'scale-x-[-1]' : ''}`}
      />
      <audio
        ref={audioRef}
        autoPlay
        playsInline
        muted={muted}
        style={{ position: 'absolute', width: 0, height: 0, opacity: 0, pointerEvents: 'none' }}
      />
    </>
  );
}
