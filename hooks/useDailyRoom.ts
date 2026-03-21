import { useEffect, useState, useCallback } from 'react';
import { DailyCall, DailyEvent, DailyEventObject } from '@daily-co/daily-js';
import { dailyManager } from '@/lib/daily';

export interface Participant {
  userId: string;
  username: string;
  sessionId: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
}

interface UseDailyRoomOptions {
  roomUrl: string;
  userData: {
    userId: string;
    username: string;
  };
  autoJoin?: boolean;
}

export function useDailyRoom({ roomUrl, userData, autoJoin = true }: UseDailyRoomOptions) {
  const [callObject, setCallObject] = useState<DailyCall | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Join room
  const joinRoom = useCallback(async () => {
    if (isJoining || isJoined) return;

    setIsJoining(true);
    setError(null);

    try {
      const call = await dailyManager.joinRoom(roomUrl, userData);
      setCallObject(call);
      setIsJoined(true);
    } catch (err) {
      console.error('Error joining room:', err);
      setError('Failed to join audio room');
    } finally {
      setIsJoining(false);
    }
  }, [roomUrl, userData, isJoining, isJoined]);

  // Leave room
  const leaveRoom = useCallback(async () => {
    if (!isJoined) return;

    try {
      await dailyManager.leaveRoom();
      setCallObject(null);
      setIsJoined(false);
      setParticipants([]);
    } catch (err) {
      console.error('Error leaving room:', err);
    }
  }, [isJoined]);

  // Toggle mute
  const toggleMute = useCallback(async () => {
    if (!callObject) return;

    const newMutedState = !isMuted;
    await dailyManager.setLocalAudio(!newMutedState);
    setIsMuted(newMutedState);
  }, [callObject, isMuted]);

  // Update participants list from Daily.co
  const updateParticipants = useCallback(() => {
    if (!callObject) return;

    const dailyParticipants = callObject.participants();
    const participantList: Participant[] = [];

    Object.entries(dailyParticipants).forEach(([sessionId, participant]) => {
      participantList.push({
        userId: participant.user_id || sessionId,
        username: participant.user_name || 'Anonymous',
        sessionId,
        isMuted: !participant.audio,
        isSpeaking: false, // Updated by active-speaker-change event
        isLocal: participant.local,
      });
    });

    setParticipants(participantList);
  }, [callObject]);

  // Setup event listeners
  useEffect(() => {
    if (!callObject) return;

    const handleParticipantJoined = (event?: DailyEventObject) => {
      console.log('👤 Participant joined:', event?.participant);
      updateParticipants();
    };

    const handleParticipantLeft = (event?: DailyEventObject) => {
      console.log('👋 Participant left:', event?.participant);
      updateParticipants();
    };

    const handleParticipantUpdated = (event?: DailyEventObject) => {
      updateParticipants();
    };

    const handleActiveSpeakerChange = (event?: DailyEventObject) => {
      if (!event?.activeSpeaker) return;

      // Update speaking status
      setParticipants(prev =>
        prev.map(p => ({
          ...p,
          isSpeaking: p.sessionId === event.activeSpeaker.peerId,
        }))
      );
    };

    const handleError = (event?: DailyEventObject) => {
      console.error('Daily.co error:', event);
      setError('Connection error');
    };

    // Register event listeners
    callObject.on('participant-joined', handleParticipantJoined);
    callObject.on('participant-left', handleParticipantLeft);
    callObject.on('participant-updated', handleParticipantUpdated);
    callObject.on('active-speaker-change', handleActiveSpeakerChange);
    callObject.on('error', handleError);

    // Initial participants load
    updateParticipants();

    // Cleanup
    return () => {
      callObject.off('participant-joined', handleParticipantJoined);
      callObject.off('participant-left', handleParticipantLeft);
      callObject.off('participant-updated', handleParticipantUpdated);
      callObject.off('active-speaker-change', handleActiveSpeakerChange);
      callObject.off('error', handleError);
    };
  }, [callObject, updateParticipants]);

  // Auto-join on mount if enabled
  useEffect(() => {
    if (autoJoin && !isJoined && !isJoining) {
      joinRoom();
    }

    // Cleanup on unmount
    return () => {
      if (isJoined) {
        leaveRoom();
      }
    };
  }, []); // Empty deps - only run on mount/unmount

  return {
    // State
    isJoined,
    isJoining,
    isMuted,
    participants,
    error,
    callObject,

    // Actions
    joinRoom,
    leaveRoom,
    toggleMute,
  };
}
