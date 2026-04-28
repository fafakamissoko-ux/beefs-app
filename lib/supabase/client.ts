import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// createBrowserClient gère automatiquement la synchronisation des cookies pour le Middleware
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      rooms: {
        Row: {
          id: string;
          title: string;
          host_id: string;
          host_name: string;
          tension_level: number;
          status: 'waiting' | 'live' | 'ended';
          current_challenger_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<Database['public']['Tables']['rooms']['Row'], 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Database['public']['Tables']['rooms']['Insert']>;
      };
      challenger_queue: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          position: number;
          status: 'waiting' | 'active' | 'done';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['challenger_queue']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['challenger_queue']['Insert']>;
      };
      messages: {
        Row: {
          id: string;
          room_id: string;
          user_id: string;
          user_name: string;
          content: string;
          type: 'chat' | 'source' | 'fact_check';
          is_pinned: boolean;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['messages']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      gifts: {
        Row: {
          id: string;
          room_id: string;
          from_user_id: string;
          to_user_id: string;
          gift_type: 'flame' | 'crown' | 'lightning' | 'diamond';
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['gifts']['Row'], 'id' | 'created_at'>;
        Update: Partial<Database['public']['Tables']['gifts']['Insert']>;
      };
    };
  };
};
