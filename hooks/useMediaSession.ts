'use client';

import { useEffect, useCallback } from 'react';

// MP3 silencieux ultra-léger (Hack WebKit pour forcer le focus audio)
const SILENT_MP3 = 'data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//MQwAAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq//MQwAAAANIAAAAAExBTUUzLjEwMKqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';

// Singleton pour éviter de multiplier les balises audio
let dummyAudio: HTMLAudioElement | null = null;

export function useMediaSession(title: string, artist: string, artworkUrl?: string) {

  // Fonction à appeler SYNCHRONIQUEMENT lors du clic utilisateur
  const takeSystemFocus = useCallback(() => {
    if (typeof window !== 'undefined') {
      if (!dummyAudio) {
        dummyAudio = new Audio(SILENT_MP3);
        dummyAudio.loop = true;
        // Volume 0.01 au lieu de 0 pour éviter que les OS trop agressifs ne l'ignorent
        dummyAudio.volume = 0.01;
      }

      dummyAudio.play().then(() => {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }).catch((e) => console.warn('[System Takeover] Dummy audio bloqué :', e));
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Live Agora',
        artist: artist || 'Médiateur',
        album: 'Beefs en Direct',
        artwork: [
          { src: artworkUrl || '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (dummyAudio) dummyAudio.play();
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Optionnel : on empêche l'OS de mettre l'app en pause globale
        });
      } catch (error) {
        console.warn('[MediaSession] Handlers non supportés', error);
      }
    }

    return () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
      if (dummyAudio) {
        dummyAudio.pause();
        dummyAudio = null;
      }
    };
  }, [title, artist, artworkUrl]);

  return { takeSystemFocus };
}
