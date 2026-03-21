-- ==========================================
-- SPRINT 4: BEEF CREATION TABLES
-- ==========================================

-- 1. BEEFS TABLE
-- Stores all beefs created by mediators
CREATE TABLE IF NOT EXISTS beefs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Basic Info
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL, -- What's the beef about
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  
  -- Mediator (creator)
  mediator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Context
  origin TEXT, -- How did it start
  conflict_date DATE, -- When did it happen
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'live', 'ended', 'cancelled')),
  -- pending: waiting for participants to accept
  -- ready: all accepted, waiting to start
  -- live: currently streaming
  -- ended: finished
  -- cancelled: beef was cancelled
  
  -- Premium
  is_premium BOOLEAN DEFAULT false,
  price DECIMAL(10, 2) DEFAULT 0,
  
  -- Session Info (when live)
  started_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_minutes INTEGER,
  
  -- Stats
  viewer_count INTEGER DEFAULT 0,
  max_viewers INTEGER DEFAULT 0,
  total_gifts_received INTEGER DEFAULT 0
);

-- 2. BEEF PARTICIPANTS TABLE
-- Tracks who is invited/participating in each beef
CREATE TABLE IF NOT EXISTS beef_participants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Role
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('participant', 'witness')),
  -- participant: main person in the beef
  -- witness: additional person who can speak
  
  is_main BOOLEAN DEFAULT true, -- Is this one of the 2 main people in beef?
  
  -- Invitation Status
  invite_status TEXT NOT NULL DEFAULT 'pending' CHECK (invite_status IN ('pending', 'accepted', 'declined')),
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Session Status (when live)
  is_present BOOLEAN DEFAULT false, -- Currently in the session
  is_muted BOOLEAN DEFAULT false,
  is_speaking BOOLEAN DEFAULT false,
  speaking_time_seconds INTEGER DEFAULT 0,
  
  UNIQUE(beef_id, user_id)
);

-- 3. BEEF INVITATIONS TABLE
-- Stores invitation history and notifications
CREATE TABLE IF NOT EXISTS beef_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  beef_id UUID NOT NULL REFERENCES beefs(id) ON DELETE CASCADE,
  inviter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who sent the invite (mediator)
  invitee_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, -- Who receives the invite
  
  -- Message
  personal_message TEXT, -- Optional message from mediator
  
  -- Status
  status TEXT NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'seen', 'accepted', 'declined', 'expired')),
  seen_at TIMESTAMP WITH TIME ZONE,
  responded_at TIMESTAMP WITH TIME ZONE,
  
  -- Expiration
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
  
  UNIQUE(beef_id, invitee_id)
);

-- 4. INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_beefs_mediator ON beefs(mediator_id);
CREATE INDEX IF NOT EXISTS idx_beefs_status ON beefs(status);
CREATE INDEX IF NOT EXISTS idx_beef_participants_beef ON beef_participants(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_user ON beef_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_beef_participants_status ON beef_participants(invite_status);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_beef ON beef_invitations(beef_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_invitee ON beef_invitations(invitee_id);
CREATE INDEX IF NOT EXISTS idx_beef_invitations_status ON beef_invitations(status);

-- 5. ROW LEVEL SECURITY (RLS)

-- Enable RLS
ALTER TABLE beefs ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE beef_invitations ENABLE ROW LEVEL SECURITY;

-- BEEFS POLICIES

-- Anyone can view beefs
CREATE POLICY "Public beefs are viewable by everyone" ON beefs
  FOR SELECT USING (true);

-- Only authenticated users can create beefs (as mediator)
CREATE POLICY "Authenticated users can create beefs" ON beefs
  FOR INSERT WITH CHECK (auth.uid() = mediator_id);

-- Mediator can update their own beefs
CREATE POLICY "Mediators can update their beefs" ON beefs
  FOR UPDATE USING (auth.uid() = mediator_id);

-- Mediator can delete their own beefs
CREATE POLICY "Mediators can delete their beefs" ON beefs
  FOR DELETE USING (auth.uid() = mediator_id);

-- BEEF PARTICIPANTS POLICIES

-- Anyone can view participants
CREATE POLICY "Public participants viewable" ON beef_participants
  FOR SELECT USING (true);

-- Mediator can add participants
CREATE POLICY "Mediators can add participants" ON beef_participants
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- Participants can update their own status (accept/decline)
CREATE POLICY "Participants can update their status" ON beef_participants
  FOR UPDATE USING (auth.uid() = user_id);

-- Mediator can update participants in their beefs
CREATE POLICY "Mediators can update participants" ON beef_participants
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- BEEF INVITATIONS POLICIES

-- Users can view their own invitations
CREATE POLICY "Users can view their invitations" ON beef_invitations
  FOR SELECT USING (auth.uid() = invitee_id);

-- Mediators can view invitations they sent
CREATE POLICY "Mediators can view sent invitations" ON beef_invitations
  FOR SELECT USING (auth.uid() = inviter_id);

-- Mediators can create invitations for their beefs
CREATE POLICY "Mediators can send invitations" ON beef_invitations
  FOR INSERT WITH CHECK (
    auth.uid() = inviter_id AND
    EXISTS (
      SELECT 1 FROM beefs 
      WHERE beefs.id = beef_id 
      AND beefs.mediator_id = auth.uid()
    )
  );

-- Invitees can update their invitation status
CREATE POLICY "Invitees can respond to invitations" ON beef_invitations
  FOR UPDATE USING (auth.uid() = invitee_id);

-- 6. FUNCTIONS

-- Function to check if beef is ready (all main participants accepted)
CREATE OR REPLACE FUNCTION check_beef_ready(beef_id_param UUID)
RETURNS BOOLEAN AS $$
DECLARE
  total_main INTEGER;
  accepted_main INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_main
  FROM beef_participants
  WHERE beef_id = beef_id_param AND is_main = true;
  
  SELECT COUNT(*) INTO accepted_main
  FROM beef_participants
  WHERE beef_id = beef_id_param AND is_main = true AND invite_status = 'accepted';
  
  RETURN (total_main > 0 AND total_main = accepted_main);
END;
$$ LANGUAGE plpgsql;

-- Function to auto-update beef status when participants accept
CREATE OR REPLACE FUNCTION update_beef_status_on_acceptance()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invite_status = 'accepted' AND OLD.invite_status != 'accepted' THEN
    -- Check if all main participants have accepted
    IF check_beef_ready(NEW.beef_id) THEN
      UPDATE beefs SET status = 'ready' WHERE id = NEW.beef_id AND status = 'pending';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update beef status
CREATE TRIGGER trigger_update_beef_status
AFTER UPDATE ON beef_participants
FOR EACH ROW
EXECUTE FUNCTION update_beef_status_on_acceptance();

-- Function to update 'updated_at' timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for beefs updated_at
CREATE TRIGGER update_beefs_updated_at
BEFORE UPDATE ON beefs
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- 7. SAMPLE DATA (for testing)
-- Uncomment to add test data

/*
-- Insert a test mediator beef
INSERT INTO beefs (title, subject, description, severity, mediator_id, status)
VALUES (
  'Conflit: Idée de startup volée',
  'Idée de startup',
  'Jean accuse Marc d\'avoir volé son concept de startup après leur collaboration.',
  'high',
  (SELECT id FROM users WHERE username = 'mediator1' LIMIT 1),
  'pending'
);

-- Add participants
INSERT INTO beef_participants (beef_id, user_id, is_main, invite_status)
VALUES
  (
    (SELECT id FROM beefs WHERE title = 'Conflit: Idée de startup volée' LIMIT 1),
    (SELECT id FROM users WHERE username = 'jean' LIMIT 1),
    true,
    'pending'
  ),
  (
    (SELECT id FROM beefs WHERE title = 'Conflit: Idée de startup volée' LIMIT 1),
    (SELECT id FROM users WHERE username = 'marc' LIMIT 1),
    true,
    'pending'
  );
*/
