-- ==========================================
-- CREATE ROOMS TABLE FOR LIVE BEEFS
-- ==========================================

-- Create rooms table (simplified version for live beefs)
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Basic Info
  title TEXT NOT NULL,
  host_name TEXT NOT NULL,
  host_id UUID REFERENCES users(id) ON DELETE CASCADE,
  
  -- Status
  status TEXT NOT NULL DEFAULT 'live' CHECK (status IN ('scheduled', 'live', 'ended', 'replay')),
  
  -- Tags system
  tags TEXT[] DEFAULT '{}',
  
  -- Premium
  is_premium BOOLEAN DEFAULT false,
  price DECIMAL(10, 2) DEFAULT 0,
  
  -- Scheduling
  scheduled_at TIMESTAMP WITH TIME ZONE,
  
  -- Session Info
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  
  -- Stats
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  
  -- Daily.co room
  daily_room_url TEXT
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_rooms_host ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_tags ON rooms USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_rooms_scheduled ON rooms(scheduled_at) WHERE scheduled_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rooms_created ON rooms(created_at DESC);

-- Enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Public rooms viewable" ON rooms
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create rooms" ON rooms
  FOR INSERT WITH CHECK (auth.uid() = host_id);

CREATE POLICY "Hosts can update their rooms" ON rooms
  FOR UPDATE USING (auth.uid() = host_id);

CREATE POLICY "Hosts can delete their rooms" ON rooms
  FOR DELETE USING (auth.uid() = host_id);

-- Trigger for updated_at
CREATE TRIGGER update_rooms_updated_at
BEFORE UPDATE ON rooms
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
