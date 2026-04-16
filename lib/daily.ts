/**
 * Daily.co WebRTC Integration
 * Handles audio rooms for beef sessions
 * 
 * For production:
 * 1. Create account at https://daily.co
 * 2. Get API key from dashboard
 * 3. Add to .env.local: NEXT_PUBLIC_DAILY_API_KEY=your_key
 */

import DailyIframe, { DailyCall, DailyEvent, DailyEventObject } from '@daily-co/daily-js';

export interface DailyRoomConfig {
  roomUrl?: string;
  token?: string;
}

export interface ParticipantInfo {
  userId: string;
  username: string;
  isMuted: boolean;
  isSpeaking: boolean;
  isLocal: boolean;
}

class DailyManager {
  private callObject: DailyCall | null = null;
  private participants: Map<string, ParticipantInfo> = new Map();

  /**
   * Create or join a Daily.co room
   */
  async joinRoom(roomUrl: string, userData: { userId: string; username: string }): Promise<DailyCall> {
    try {
      // Create Daily call object
      this.callObject = DailyIframe.createCallObject({
        audioSource: true, // Enable microphone
        videoSource: false, // Disable camera (audio only)
      });

      // Set user data
      await this.callObject.setUserName(userData.username);

      // Join the room
      await this.callObject.join({
        url: roomUrl,
        userName: userData.username,
      });

      return this.callObject;
    } catch (error) {
      console.error('Error joining Daily.co room');
      throw error;
    }
  }

  /**
   * Leave the current room
   */
  async leaveRoom(): Promise<void> {
    if (this.callObject) {
      await this.callObject.leave();
      await this.callObject.destroy();
      this.callObject = null;
      this.participants.clear();
    }
  }

  /**
   * Mute/unmute local audio
   */
  async setLocalAudio(enabled: boolean): Promise<void> {
    if (this.callObject) {
      await this.callObject.setLocalAudio(enabled);
    }
  }

  /**
   * Get current call object
   */
  getCallObject(): DailyCall | null {
    return this.callObject;
  }

  /**
   * Check if currently in a call
   */
  isInCall(): boolean {
    return this.callObject !== null;
  }

  /**
   * Get all participants in the room
   */
  getParticipants(): Map<string, ParticipantInfo> {
    return this.participants;
  }

  /**
   * Update participant info
   */
  updateParticipant(sessionId: string, info: Partial<ParticipantInfo>): void {
    const existing = this.participants.get(sessionId);
    if (existing) {
      this.participants.set(sessionId, { ...existing, ...info });
    } else {
      this.participants.set(sessionId, info as ParticipantInfo);
    }
  }

  /**
   * Remove participant
   */
  removeParticipant(sessionId: string): void {
    this.participants.delete(sessionId);
  }
}

// Singleton instance
export const dailyManager = new DailyManager();

/**
 * Create a Daily.co room (server-side API call)
 * This should be called from your backend/API route
 */
export async function createDailyRoom(roomName: string): Promise<{ url: string; name: string }> {
  const apiKey = process.env.DAILY_API_KEY;
  
  if (!apiKey) {
    console.warn('⚠️ DAILY_API_KEY not set. Using demo mode.');
    // Return a mock room for development
    return {
      url: `https://beefs.daily.co/${roomName}`,
      name: roomName,
    };
  }

  try {
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          enable_chat: false,
          enable_screenshare: false,
          enable_recording: false,
          start_video_off: true, // Audio only
          start_audio_off: false,
        },
      }),
    });

    const data = await response.json();
    return {
      url: data.url,
      name: data.name,
    };
  } catch (error) {
    console.error('Error creating Daily.co room:', error);
    throw error;
  }
}

export default dailyManager;
