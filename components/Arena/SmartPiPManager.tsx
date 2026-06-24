'use client';

import { ParticipantVideo } from '../ParticipantVideo';
import type { ArenaTileVM } from './types';

interface SmartPiPManagerProps {
  tiles: ArenaTileVM[];
  activeSpeakerPeerId: string | null;
}

export function SmartPiPManager({ tiles, activeSpeakerPeerId }: SmartPiPManagerProps) {
  // Priorité 1: L'orateur actif. Priorité 2: L'utilisateur local. Priorité 3: N'importe quelle tuile avec vidéo.
  let targetTile = activeSpeakerPeerId ? tiles.find((t) => t.panel?.sessionId === activeSpeakerPeerId) : null;

  if (!targetTile) {
    targetTile = tiles.find((t) => t.isLocal);
  }

  if (!targetTile) {
    targetTile = tiles.find((t) => t.hasActiveVideo);
  }

  if (!targetTile || !targetTile.panel?.videoTrack) return null;

  return (
    // Ce conteneur est invisible mais présent dans le DOM pour que le navigateur
    // puisse extraire la vidéo lors de la réduction de l'application.
    <div
      className="fixed inset-0 z-[-9999] opacity-[0.01] pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <ParticipantVideo
        videoTrack={targetTile.panel.videoTrack}
        muted={true}
        isSmartPiPUI={true}
      />
    </div>
  );
}
