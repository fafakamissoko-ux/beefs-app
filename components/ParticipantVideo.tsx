'use client';
import { useEffect, useRef } from 'react';
import { usePiP } from '@/hooks/usePiP';
import { PictureInPicture2 } from 'lucide-react';

interface ParticipantVideoProps {
  videoTrack: MediaStreamTrack | null;
  audioTrack?: MediaStreamTrack | null;
  muted?: boolean;
  className?: string;
  mirror?: boolean;
  enableAutoPiP?: boolean;
}

export function ParticipantVideo({ videoTrack, audioTrack, muted = false, className = '', mirror = false, enableAutoPiP }: ParticipantVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { isPiPSupported, isPiPActive, togglePiP } = usePiP(videoRef, enableAutoPiP);

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
    <div className={className || 'relative h-full w-full'}>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        disablePictureInPicture={false}
        className={`absolute inset-0 h-full w-full object-cover ${mirror ? '[transform:scaleX(-1)]' : ''} bg-transparent`}
      />
      {isPiPSupported && !isPiPActive && !enableAutoPiP && (
        <button
          onClick={togglePiP}
          type="button"
          className="absolute top-2 right-2 z-20 hidden md:flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 backdrop-blur-md transition-all hover:bg-black/60 hover:text-white"
          title="Détacher la vidéo"
        >
          <PictureInPicture2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
