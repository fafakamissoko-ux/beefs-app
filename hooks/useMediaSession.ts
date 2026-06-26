'use client';

import { useEffect } from 'react';

export function useMediaSession(title: string, artist: string, artworkUrl?: string) {
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
    }

    return () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
    };
  }, [title, artist, artworkUrl]);
}
