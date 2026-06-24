import type { CallParticipant } from '@/hooks/useDailyCall';
import type { BeefParticipantRowMeta, ReconciledPeer } from '@/lib/participant-identity';
import type { ArenaSupportSlotId, ChallengerSlotId } from '@/lib/arena-slots';

export type { ArenaLayoutMode } from '@/lib/arena-layout-mode';

export const CHALLENGER_SLOT_COLORS: Record<ChallengerSlotId, string> = {
  A: '225,29,72',
  B: '16,185,129',
  C: '234,179,8',
  D: '59,130,246',
  E: '168,85,247',
  F: '244,114,182',
};

export interface ArenaTileVM {
  id: string;
  slot: ChallengerSlotId;
  name: string;
  arenaUserId: string | null;
  panel: CallParticipant | null;
  aura: number;
  colorRgb: string;
  hasActiveVideo: boolean;
  isLocal: boolean;
  avatarUrl: string | null;
  cellClass: string;
  uiPosClass: string;
}

export interface UseArenaLayoutTilesParams {
  expectedUids: string[];
  challengerRemoteSlots: Array<CallParticipant | null>;
  reconciledPeers: ReconciledPeer[];
  participantRoles: Record<string, BeefParticipantRowMeta>;
  auras: Record<ChallengerSlotId, number>;
  localUserId: string;
  localSessionId: string | null | undefined;
  isViewer: boolean;
}

export interface ArenaLayoutManagerProps {
  expectedUids: string[];
  challengerRemoteSlots: Array<CallParticipant | null>;
  reconciledPeers: ReconciledPeer[];
  participantRoles: Record<string, BeefParticipantRowMeta>;
  auras: Record<ChallengerSlotId, number>;
  localUserId: string;
  localSessionId: string | null | undefined;
  isViewer: boolean;
  isHost: boolean;
  speakingTurnActive: boolean;
  effectiveHotMicSpeakerSlot: ChallengerSlotId | null;
  structuredDebateEnabled: boolean;
  micMutedByMediator: boolean;
  mediatorHoldingFloor: boolean;
  micEnabled: boolean;
  camEnabled: boolean;
  onTapSupport: (slot: ArenaSupportSlotId) => void;
  onPreferSide: (side: ArenaSupportSlotId) => void;
  onOpenProfile: (username: string, knownUserId?: string | null) => void | Promise<void>;
  onToggleMic: () => void;
  onToggleCam: () => void;
  onToast: (message: string, type: 'error' | 'success' | 'info') => void;
  onFlipCamera?: () => void;
  webrtcNetworkQuality?: 'good' | 'low' | 'very-low' | 'offline';
  activeSpeakerPeerId?: string | null;
  mediatorParticipant: CallParticipant | null;
  mediatorIsLocal: boolean;
  mediatorName: string;
  auraMed: number;
  isWaitingForMediator: boolean;
  isCameraInterrupted: boolean;
  onRecoverMediaDevices: () => void | Promise<void>;
  mediatorGraceActive: boolean;
  mediatorGraceSeconds: number;
  mediatorHostId: string;
  isJoined: boolean;
  timerActive: boolean;
  timerPaused: boolean;
  beefTimeRemaining: number;
  formatBeefTime: (seconds: number) => string;
  onToggleMediatorSidebar: () => void;
  getMediatorDynamicColor: (val: number) => string;
  /** Intention caméra au PreJoin — court-circuite la grâce bootstrap si false. */
  localCamEnabled?: boolean;
}
