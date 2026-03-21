/**
 * Global TypeScript types for Arena VS
 */

export type RoomStatus = 'waiting' | 'live' | 'ended';

export type MessageType = 'chat' | 'source' | 'fact_check';

export type GiftType = 'flame' | 'crown' | 'lightning' | 'diamond';

export type ChallengerStatus = 'waiting' | 'active' | 'done';

export type FactCheckVerdict = 'true' | 'false' | 'misleading' | 'needs-context';

export interface Room {
  id: string;
  title: string;
  host_id: string;
  host_name: string;
  tension_level: number;
  status: RoomStatus;
  current_challenger_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Challenger {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  position: number;
  status: ChallengerStatus;
  created_at: string;
}

export interface Message {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  content: string;
  type: MessageType;
  is_pinned: boolean;
  created_at: string;
}

export interface Gift {
  id: string;
  room_id: string;
  from_user_id: string;
  to_user_id: string;
  gift_type: GiftType;
  created_at: string;
}

export interface FactCheckResult {
  claim: string;
  verdict: FactCheckVerdict;
  explanation: string;
  sources?: string[];
  timestamp: string;
}

export interface Participant {
  id: string;
  name: string;
  isHost: boolean;
  videoEnabled: boolean;
  audioEnabled: boolean;
  badges?: string[];
}

export interface TensionMeterOptions {
  throttleMs?: number;
  decayIntervalMs?: number;
  decayPercent?: number;
  broadcastIntervalMs?: number;
}

export interface RoomAnalytics {
  total_taps: number;
  peak_tension: number;
  chaos_triggers: number;
  avg_tension: number;
  messages_count: number;
  challengers_total: number;
  gifts_sent: number;
  duration_minutes: number;
  unique_viewers: number;
}

export interface UserProfile {
  id: string;
  username: string;
  avatar_url?: string;
  debates_hosted: number;
  debates_challenged: number;
  fact_checks_received: number;
  gifts_sent: number;
  gifts_received: number;
  badges: string[];
  created_at: string;
}
