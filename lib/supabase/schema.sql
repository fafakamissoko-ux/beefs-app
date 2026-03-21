-- Arena VS Database Schema
-- Run this in your Supabase SQL Editor

-- Enable realtime for all tables
ALTER DATABASE postgres SET wal_level = logical;

-- Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  host_id TEXT NOT NULL,
  host_name TEXT NOT NULL,
  tension_level INTEGER DEFAULT 0 CHECK (tension_level >= 0 AND tension_level <= 100),
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'live', 'ended')),
  current_challenger_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Challenger Queue Table
CREATE TABLE IF NOT EXISTS public.challenger_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  position INTEGER NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'done')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Messages Table
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'chat' CHECK (type IN ('chat', 'source', 'fact_check')),
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Gifts Table
CREATE TABLE IF NOT EXISTS public.gifts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  gift_type TEXT NOT NULL CHECK (gift_type IN ('flame', 'crown', 'lightning', 'diamond')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_rooms_status ON public.rooms(status);
CREATE INDEX IF NOT EXISTS idx_challenger_queue_room ON public.challenger_queue(room_id, position);
CREATE INDEX IF NOT EXISTS idx_messages_room ON public.messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gifts_room ON public.gifts(room_id, created_at DESC);

-- Enable Row Level Security (RLS)
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenger_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gifts ENABLE ROW LEVEL SECURITY;

-- RLS Policies (Allow all for demo - customize for production)
CREATE POLICY "Allow all operations on rooms" ON public.rooms FOR ALL USING (true);
CREATE POLICY "Allow all operations on challenger_queue" ON public.challenger_queue FOR ALL USING (true);
CREATE POLICY "Allow all operations on messages" ON public.messages FOR ALL USING (true);
CREATE POLICY "Allow all operations on gifts" ON public.gifts FOR ALL USING (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.rooms;
ALTER PUBLICATION supabase_realtime ADD TABLE public.challenger_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gifts;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for rooms table
CREATE TRIGGER update_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
