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

    el.srcObject = tracks.length > 0 ? new MediaStream(tracks) : null;

    return () => {
      // Only clear srcObject — DO NOT stop tracks here.
      // Track lifecycle is managed by useDailyCall.leave() which runs
      // the nuclear stop BEFORE this component unmounts.
      el.srcObject = null;
    };
  }, [videoTrack, audioTrack, muted]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      className={`${className} ${mirror ? '[transform:scaleX(-1)]' : ''}`}
    />
  );
}
