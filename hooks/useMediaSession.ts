'use client';

import { useEffect, useCallback } from 'react';

// Singletons hors du cycle de vie React pour garantir un contexte unique à travers l'application
let webAudioCtx: AudioContext | null = null;
let silenceNode: OscillatorNode | null = null;

type WindowWithWebkitAudio = Window & {
  webkitAudioContext?: typeof AudioContext;
};

export function useMediaSession(title: string, artist: string, artworkUrl?: string) {
  // Cette fonction démarre le moteur matériel et doit être appelée sur un geste utilisateur
  const startSystemAudio = useCallback(() => {
    if (typeof window === 'undefined') return;

    try {
      if (!webAudioCtx) {
        const AudioContextClass =
          window.AudioContext ?? (window as WindowWithWebkitAudio).webkitAudioContext;
        if (!AudioContextClass) return;
        webAudioCtx = new AudioContextClass();
      }

      if (webAudioCtx.state === 'suspended') {
        void webAudioCtx.resume();
      }

      // Création du flux de silence cryptographique si non existant
      if (!silenceNode) {
        silenceNode = webAudioCtx.createOscillator();
        const gainNode = webAudioCtx.createGain();
        gainNode.gain.value = 0; // Silence absolu

        silenceNode.connect(gainNode);
        gainNode.connect(webAudioCtx.destination);
        silenceNode.start();
      }

      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } catch (error) {
      console.warn('[Web Audio Engine] Impossible de démarrer le moteur:', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || 'Live Agora',
        artist: artist || 'Médiateur',
        album: 'Beefs en Direct',
        artwork: [{ src: artworkUrl || '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' }],
      });

      // Handlers indispensables pour simuler l'interactivité sur le Lock Screen
      try {
        navigator.mediaSession.setActionHandler('play', () => {
          if (webAudioCtx && webAudioCtx.state === 'suspended') {
            void webAudioCtx.resume();
          }
        });
        navigator.mediaSession.setActionHandler('pause', () => {
          /* no-op : on empêche la pause OS */
        });
      } catch {
        // Fallback muet
      }
    }

    return () => {
      if (typeof window !== 'undefined' && 'mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
      // On ne coupe pas le contexte audio ici pour survivre aux re-renders de l'arène
    };
  }, [title, artist, artworkUrl]);

  return { startSystemAudio };
}
