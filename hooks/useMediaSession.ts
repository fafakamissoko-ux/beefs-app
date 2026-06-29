'use client';

import { useEffect, useCallback } from 'react';

// Singleton persistant pour maintenir le lecteur réseau actif au niveau de l'OS
let systemNetworkAudio: HTMLAudioElement | null = null;

export function useMediaSession(title: string, artist: string, artworkUrl?: string) {
  // Fonction asynchrone déclenchée APRÈS la destruction du vu-mètre
  const startSystemAudio = useCallback(async () => {
    if (typeof window === 'undefined') return;

    try {
      if (!systemNetworkAudio) {
        // Exige un fichier /public/sounds/silence.mp3
        systemNetworkAudio = new Audio('/sounds/silence.mp3');
        systemNetworkAudio.loop = true;
        systemNetworkAudio.volume = 0.01;
      }

      await systemNetworkAudio.play();

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (error) {
      console.warn('[Hybrid Engine] Audio rejeté par WebKit:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Live Agora',
        artist: artist || 'Médiateur',
        album: 'Beefs en Direct',
        artwork: [{ src: artworkUrl || '/icon-512.png', sizes: '512x512', type: 'image/png' }],
      });

      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (systemNetworkAudio) {
            void systemNetworkAudio.play();
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          // Intercepte la pause pour empêcher la coupure background
        });
      } catch {
        // Fallback
      }
    }

    return () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    };
  }, [title, artist, artworkUrl]);

  return { startSystemAudio };
}
