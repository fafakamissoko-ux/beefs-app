'use client';

import { useState, useEffect, RefObject, useCallback } from 'react';

export function usePiP(videoRef: RefObject<HTMLVideoElement | null>) {
  const [isPiPSupported, setIsPiPSupported] = useState(false);
  const [isPiPActive, setIsPiPActive] = useState(false);

  useEffect(() => {
    // 1. Vérification du support PiP natif
    const supported = typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled;
    setIsPiPSupported(supported);

    // 2. Activation du mode Auto-PiP (Magie Tier-1)
    // Cela permet à iOS Safari et Android Chrome de détacher automatiquement la vidéo
    // lorsque l'utilisateur retourne sur l'écran d'accueil de son téléphone.
    if (videoRef.current && 'autoPictureInPicture' in videoRef.current) {
      (videoRef.current as any).autoPictureInPicture = true;
    }
  }, [videoRef]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement) return;

    const handleEnterPiP = () => setIsPiPActive(true);
    const handleLeavePiP = () => setIsPiPActive(false);

    videoElement.addEventListener('enterpictureinpicture', handleEnterPiP);
    videoElement.addEventListener('leavepictureinpicture', handleLeavePiP);

    return () => {
      videoElement.removeEventListener('enterpictureinpicture', handleEnterPiP);
      videoElement.removeEventListener('leavepictureinpicture', handleLeavePiP);
    };
  }, [videoRef]);

  const togglePiP = useCallback(async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    try {
      if (videoRef.current && videoRef.current !== document.pictureInPictureElement) {
        await videoRef.current.requestPictureInPicture();
      } else if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      console.warn('[PiP] Le navigateur a rejeté le Picture-in-Picture :', error);
    }
  }, [videoRef]);

  return { isPiPSupported, isPiPActive, togglePiP };
}
