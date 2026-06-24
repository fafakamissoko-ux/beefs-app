'use client';

import { useEffect } from 'react';

/**
 * Hook enregistrant le flux en cours auprès du système d'exploitation (iOS/Android).
 * Cela permet d'afficher les métadonnées sur l'écran de verrouillage et d'empêcher
 * la suspension du flux WebRTC (Background Audio) lorsque l'app est en arrière-plan.
 */
export function useMediaSession(title: string, artist: string, artworkUrl?: string) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Live Agora',
        artist: artist || 'Médiateur',
        album: 'Beefs en Direct',
        artwork: [
          // Fallback sur l'icône de l'app si pas de miniature spécifique
          { src: artworkUrl || '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }
        ]
      });

      // L'enregistrement de ces handlers "factices" est indispensable sur iOS
      // pour que l'OS maintienne le contrôle actif du lecteur sur l'écran de verrouillage.
      // Le flux WebRTC gère lui-même la lecture continue.
      try {
        navigator.mediaSession.setActionHandler('play', () => { /* No-op */ });
        navigator.mediaSession.setActionHandler('pause', () => { /* No-op */ });
      } catch (error) {
        console.warn('[MediaSession] Action handlers non supportés', error);
      }
    }

    return () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
        } catch (error) {
          /* ignore */
        }
      }
    };
  }, [title, artist, artworkUrl]);
}
